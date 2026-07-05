import { useMemo } from "react";
import type { CashDriverInsight, ForecastPoint, ForecastScenario } from "../types/domain";

interface ForecastRiskSceneProps {
  baseline: ForecastScenario;
  afterActions: ForecastScenario;
  threshold: number;
  drivers: CashDriverInsight[];
}

interface ChartPoint {
  x: number;
  y: number;
}

interface TickLabel {
  key: string;
  label: string;
  x?: number;
  y?: number;
}

const DAY_COUNT = 90;
const CHART_WIDTH = 980;
const CHART_HEIGHT = 330;
const CHART_PAD_X = 84;
const CHART_PAD_Y = 28;

export function ForecastRiskScene({ baseline, afterActions, threshold, drivers }: ForecastRiskSceneProps) {
  const view = useMemo(() => buildRiskView(baseline, afterActions, threshold, drivers), [
    afterActions,
    baseline,
    drivers,
    threshold
  ]);

  return (
    <div className="forecastDecisionBand">
      <div className="forecastSceneHeader">
        <div>
          <strong>Cash risk fan chart</strong>
          <span>Dates on the bottom, cash position on the left, safe threshold in amber.</span>
        </div>
        <div className="sceneLegend" aria-label="Forecast visualization legend">
          <span className="risk">Before actions</span>
          <span className="safe">After actions</span>
          <span className="threshold">Safe cash line</span>
          <span className="range">{view.bandLabel}</span>
        </div>
      </div>

      <div className="riskStoryGrid">
        <div className="riskFanPanel">
          <svg
            aria-label="Cash forecast fan chart"
            className="riskFanSvg"
            role="img"
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          >
            <defs>
              <linearGradient id="riskBandGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#6d6cff" stopOpacity="0.18" />
                <stop offset="62%" stopColor="#ff4d6d" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#ff4d6d" stopOpacity="0.08" />
              </linearGradient>
              <linearGradient id="actionAreaGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#41d8c5" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#41d8c5" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            <rect className="riskPlotBg" x="0" y="0" width={CHART_WIDTH} height={CHART_HEIGHT} rx="12" />
            {view.gridLines.map((line) => (
              <line
                className="riskGridLine"
                key={line.key}
                x1={line.x1}
                x2={line.x2}
                y1={line.y1}
                y2={line.y2}
              />
            ))}
            <path className="riskBandPath" d={view.bandPath} />
            <path className="actionLiftArea" d={view.actionAreaPath} />
            <line
              className="thresholdLine"
              x1={CHART_PAD_X}
              x2={CHART_WIDTH - CHART_PAD_X}
              y1={view.thresholdY}
              y2={view.thresholdY}
            />
            <path className="baselinePath" d={view.baselinePath} />
            <path className="afterPath" d={view.afterPath} />
            <circle className="riskPoint" cx={view.breachPoint.x} cy={view.breachPoint.y} r="5" />
            <circle className="safePoint" cx={view.afterMinimumPoint.x} cy={view.afterMinimumPoint.y} r="5" />

            {view.yTicks.map((tick) => (
              <text className="cashTickLabel" key={tick.key} x={CHART_PAD_X - 10} y={(tick.y ?? 0) + 4}>
                {tick.label}
              </text>
            ))}
            {view.xTicks.map((tick) => (
              <text className="dateTickLabel" key={tick.key} x={tick.x} y={CHART_HEIGHT - CHART_PAD_Y + 20}>
                {tick.label}
              </text>
            ))}
            <text className="axisLabel" x={CHART_PAD_X} y={CHART_PAD_Y - 8}>
              Cash balance
            </text>
            <text className="thresholdText" x={CHART_WIDTH - 210} y={view.thresholdY - 8}>
              Safe cash line: {money(threshold)}
            </text>
          </svg>

          <div className="riskChartCallouts">
            <span>{view.breachLabel}</span>
            <span>Monte Carlo band shows likely payment-timing outcomes, not a single fixed future.</span>
          </div>

          <div className="riskCalendar" aria-label="Weekly risk calendar">
            {view.weeks.map((week) => (
              <div className={`riskWeek ${week.status}`} key={week.label}>
                <span>{week.label}</span>
                <strong>{week.minimumLabel}</strong>
                <em>{week.statusLabel}</em>
              </div>
            ))}
          </div>
        </div>

        <div className="riskDecisionPanel">
          <div className="riskDecisionHeader">
            <span>Decision readout</span>
            <strong>{view.headline}</strong>
          </div>

          <div className="riskMetricList">
            <div>
              <span>Baseline crunch probability</span>
              <strong>{baseline.summary.crunchProbability}%</strong>
            </div>
            <div>
              <span>After-action probability</span>
              <strong>{afterActions.summary.crunchProbability}%</strong>
            </div>
            <div>
              <span>Minimum cash lift</span>
              <strong>{money(view.minimumLift)}</strong>
            </div>
          </div>

          <div className="driverBars" aria-label="Cash driver impact bars">
            {view.driverBars.map((driver) => (
              <div className={`driverBar ${driver.direction}`} key={driver.id}>
                <div>
                  <strong>{driver.label}</strong>
                  <span>{driver.explanation}</span>
                </div>
                <div className="driverBarTrack">
                  <span style={{ width: `${driver.width}%` }} />
                </div>
                <em>{driver.impactLabel}</em>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildRiskView(
  baseline: ForecastScenario,
  afterActions: ForecastScenario,
  threshold: number,
  drivers: CashDriverInsight[]
) {
  const baselinePoints = baseline.points.slice(0, DAY_COUNT);
  const afterPoints = afterActions.points.slice(0, baselinePoints.length);
  const daysShown = baselinePoints.length;
  const simulatedBands = (baseline.bands ?? []).slice(0, daysShown);
  const hasSimulatedBands = simulatedBands.length === daysShown && daysShown > 0;

  // Prefer Monte Carlo p10/p90 percentiles; fall back to a driver-scaled band
  // when the simulation was skipped (e.g. monteCarloRuns: 0).
  const paymentTimingImpact =
    drivers.find((driver) => driver.id === "driver-payment-delay")?.impactAmount ??
    Math.max(1200, threshold * 0.28);
  const bandWidth = Math.max(900, Math.min(4200, paymentTimingImpact * 0.55));

  const lowerBand = baselinePoints.map((point, index) => ({
    ...point,
    closingBalance: hasSimulatedBands
      ? simulatedBands[index].pessimisticBalance
      : point.closingBalance - bandWidth * Math.sqrt((index + 1) / Math.max(1, daysShown))
  }));
  const upperBand = baselinePoints.map((point, index) => ({
    ...point,
    closingBalance: hasSimulatedBands
      ? simulatedBands[index].optimisticBalance
      : point.closingBalance + bandWidth * 0.28 * Math.sqrt((index + 1) / Math.max(1, daysShown))
  }));
  const allBalances = [
    ...baselinePoints,
    ...afterPoints,
    ...lowerBand,
    ...upperBand,
    { closingBalance: threshold } as ForecastPoint
  ].map((point) => point.closingBalance);
  const minBalance = Math.min(...allBalances);
  const maxBalance = Math.max(...allBalances);
  const padding = Math.max(1600, (maxBalance - minBalance) * 0.12);
  const domainMin = minBalance - padding;
  const domainMax = maxBalance + padding;
  const baselineChart = baselinePoints.map((point, index) => chartPoint(index, point.closingBalance));
  const afterChart = afterPoints.map((point, index) => chartPoint(index, point.closingBalance));
  const lowerChart = lowerBand.map((point, index) => chartPoint(index, point.closingBalance));
  const upperChart = upperBand.map((point, index) => chartPoint(index, point.closingBalance));
  const thresholdY = yFor(threshold);
  const breachIndex = Math.max(
    0,
    baselinePoints.findIndex((point) => point.date === baseline.summary.firstThresholdBreachDate)
  );
  const safeMinimumIndex = Math.max(
    0,
    afterPoints.findIndex((point) => point.date === afterActions.summary.minimumCashDate)
  );
  const breachPoint = baselineChart[breachIndex] ?? baselineChart[0] ?? { x: CHART_PAD_X, y: thresholdY };
  const afterMinimumPoint = afterChart[safeMinimumIndex] ?? afterChart[0] ?? { x: CHART_PAD_X, y: thresholdY };
  const driverBars = buildDriverBars(drivers);
  const minimumLift = afterActions.summary.minimumCashBalance - baseline.summary.minimumCashBalance;
  const yTicks: TickLabel[] = buildCashTicks(domainMin, domainMax, threshold).map((value) => ({
    key: `cash-${value}`,
    label: money(value),
    y: yFor(value)
  }));
  const xTicks: TickLabel[] = buildDateTicks(baselinePoints).map((tick) => ({
    key: `date-${tick.index}`,
    label: tick.label,
    x: xFor(tick.index)
  }));

  return {
    daysShown,
    bandLabel: hasSimulatedBands
      ? "Monte Carlo p10-p90 payment timing range"
      : "payment timing sensitivity range",
    baselinePath: linePath(baselineChart),
    afterPath: linePath(afterChart),
    bandPath: areaBetweenPath(upperChart, lowerChart),
    actionAreaPath: areaBetweenPath(afterChart, baselineChart),
    thresholdY,
    breachPoint,
    afterMinimumPoint,
    breachLabel: baseline.summary.firstThresholdBreachDate
      ? `First risk date: ${shortDate(baseline.summary.firstThresholdBreachDate)}`
      : "No baseline breach",
    breachLabelX: Math.min(CHART_WIDTH - 255, Math.max(CHART_PAD_X + 10, breachPoint.x - 20)),
    breachLabelY: Math.max(CHART_PAD_Y + 18, breachPoint.y - 18),
    weeks: buildWeeks(baselinePoints, afterPoints, threshold),
    xTicks,
    yTicks,
    headline: baseline.summary.firstThresholdBreachDate
      ? `Cash falls below the safe line on ${shortDate(baseline.summary.firstThresholdBreachDate)} unless selected actions land.`
      : "Baseline stays above the safe line in this horizon.",
    minimumLift,
    driverBars,
    gridLines: buildGridLines(),
  };

  function xFor(index: number) {
    const usableWidth = CHART_WIDTH - CHART_PAD_X * 2;
    return CHART_PAD_X + (index / Math.max(1, daysShown - 1)) * usableWidth;
  }

  function chartPoint(index: number, balance: number): ChartPoint {
    return {
      x: xFor(index),
      y: yFor(balance)
    };
  }

  function yFor(balance: number) {
    const usableHeight = CHART_HEIGHT - CHART_PAD_Y * 2;
    const ratio = (balance - domainMin) / Math.max(1, domainMax - domainMin);
    return CHART_HEIGHT - CHART_PAD_Y - ratio * usableHeight;
  }
}

function buildDriverBars(drivers: CashDriverInsight[]) {
  const selected = drivers.slice(0, 3);
  const maxImpact = Math.max(1, ...selected.map((driver) => driver.impactAmount));
  return selected.map((driver) => ({
    id: driver.id,
    label: driver.label,
    direction: driver.direction,
    impactLabel: driver.impactLabel,
    explanation: driver.sensitivity,
    width: Math.max(10, Math.round((driver.impactAmount / maxImpact) * 100))
  }));
}

function buildWeeks(baselinePoints: ForecastPoint[], afterPoints: ForecastPoint[], threshold: number) {
  const weeks = [];
  for (let index = 0; index < baselinePoints.length; index += 7) {
    const baselineWeek = baselinePoints.slice(index, index + 7);
    const afterWeek = afterPoints.slice(index, index + 7);
    const baselineMinimum = Math.min(...baselineWeek.map((point) => point.closingBalance));
    const afterMinimum = Math.min(...afterWeek.map((point) => point.closingBalance));
    const status = baselineMinimum < threshold ? "danger" : baselineMinimum < threshold * 1.35 ? "watch" : "safe";
    weeks.push({
      label: `${shortDate(baselineWeek[0].date)}-${shortDate(baselineWeek[baselineWeek.length - 1].date)}`,
      minimumLabel: money(Math.round(baselineMinimum)),
      status,
      statusLabel:
        status === "danger"
          ? afterMinimum >= threshold
            ? "actions protect"
            : "below safe line"
          : status === "watch"
            ? "watch"
            : "safe"
    });
  }
  return weeks.slice(0, 10);
}

function buildCashTicks(domainMin: number, domainMax: number, threshold: number) {
  const tickStep = 5000;
  const candidates = [
    Math.ceil(domainMin / tickStep) * tickStep,
    threshold,
    Math.floor(domainMax / tickStep) * tickStep
  ];
  return [...new Set(candidates)]
    .filter((value) => Number.isFinite(value) && value >= domainMin && value <= domainMax)
    .sort((left, right) => right - left);
}

function buildDateTicks(points: ForecastPoint[]) {
  if (points.length === 0) return [];
  const indexes = [0, 29, 59, points.length - 1].filter(
    (index, position, values) => index >= 0 && index < points.length && values.indexOf(index) === position
  );
  return indexes.map((index) => ({
    index,
    label: index === points.length - 1 ? `Day ${points.length}` : shortDate(points[index].date)
  }));
}

function buildGridLines() {
  const lines = [];
  for (let index = 0; index <= 4; index += 1) {
    const y = CHART_PAD_Y + ((CHART_HEIGHT - CHART_PAD_Y * 2) / 4) * index;
    lines.push({ key: `h-${index}`, x1: CHART_PAD_X, x2: CHART_WIDTH - CHART_PAD_X, y1: y, y2: y });
  }
  for (let index = 0; index <= 6; index += 1) {
    const x = CHART_PAD_X + ((CHART_WIDTH - CHART_PAD_X * 2) / 6) * index;
    lines.push({ key: `v-${index}`, x1: x, x2: x, y1: CHART_PAD_Y, y2: CHART_HEIGHT - CHART_PAD_Y });
  }
  return lines;
}

function linePath(points: ChartPoint[]) {
  if (points.length === 0) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function areaBetweenPath(top: ChartPoint[], bottom: ChartPoint[]) {
  if (top.length === 0 || bottom.length === 0) return "";
  const topPath = top.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`);
  const bottomPath = [...bottom]
    .reverse()
    .map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`);
  return [...topPath, ...bottomPath, "Z"].join(" ");
}

function money(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0
  }).format(value);
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short"
  }).format(new Date(`${date}T00:00:00Z`));
}
