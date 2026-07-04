import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Check,
  CircleDollarSign,
  Clock3,
  DatabaseZap,
  FileClock,
  Link2,
  Mail,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Workflow
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { CashAction, DashboardPayload, ForecastPoint, RevenueOpportunity } from "./types/domain";

type Horizon = 30 | 60 | 90;
type SourceMode = "demo" | "xero";

interface XeroStatus {
  configured: boolean;
  authenticated: boolean;
  missing: string[];
  scopes: string[];
  mode: "seeded-demo" | "ready-for-oauth" | "connected";
  tokenPath: string;
  connectUrl: string;
  tenantId?: string;
  tenantName?: string;
}

const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0
});

export function App() {
  const initialSource = new URLSearchParams(window.location.search).get("source") === "xero" ? "xero" : "demo";
  const [source, setSource] = useState<SourceMode>(initialSource);
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [xeroStatus, setXeroStatus] = useState<XeroStatus | null>(null);
  const [horizon, setHorizon] = useState<Horizon>(30);
  const [selectedActionIds, setSelectedActionIds] = useState<string[]>([]);
  const [selectedOpportunityIds, setSelectedOpportunityIds] = useState<string[]>([]);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh(nextSource = source) {
    setLoading(true);
    setError(null);
    const [dashboardResponse, xeroResponse] = await Promise.all([
      fetch(`/api/dashboard?source=${nextSource}`),
      fetch("/api/integrations/xero/status")
    ]);

    if (!dashboardResponse.ok) {
      const result = await dashboardResponse.json();
      throw new Error(result.error ?? "Unable to load dashboard");
    }

    const dashboard = (await dashboardResponse.json()) as DashboardPayload;
    const xero = (await xeroResponse.json()) as XeroStatus;
    setPayload(dashboard);
    setXeroStatus(xero);
    setSelectedActionIds(dashboard.recommendedActions.map((action) => action.id));
    setSelectedOpportunityIds(dashboard.revenueOpportunities.map((opportunity) => opportunity.id));
    setLoading(false);
  }

  useEffect(() => {
    refresh().catch((caught) => {
      setError(caught instanceof Error ? caught.message : "Unable to load dashboard");
      setLoading(false);
    });
  }, []);

  const chartData = useMemo(() => {
    if (!payload) return [];
    return payload.baseline.points.slice(0, horizon).map((point, index) => ({
      date: formatShortDate(point.date),
      fullDate: point.date,
      before: Math.round(point.closingBalance),
      after: Math.round(payload.afterActions.points[index]?.closingBalance ?? point.closingBalance),
      threshold: payload.snapshot.safeCashThreshold
    }));
  }, [horizon, payload]);

  async function switchSource(nextSource: SourceMode) {
    setSource(nextSource);
    window.history.replaceState(null, "", nextSource === "xero" ? "?source=xero" : window.location.pathname);
    await refresh(nextSource);
  }

  async function approveSelectedActions() {
    if (approvalCount === 0 || approving) return;
    setApproving(true);
    setApprovalStatus("Submitting approval...");
    try {
      const response = await fetch("/api/actions/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashActionIds: selectedActionIds,
          revenueOpportunityIds: selectedOpportunityIds,
          source
        })
      });

      if (!response.ok) throw new Error("Approval queue request failed");

      const result = await response.json();
      setApprovalStatus(
        `${result.counts.cashActions} cash-flow action(s) and ${result.counts.revenueOpportunities} growth action(s) queued.`
      );
    } catch (caught) {
      setApprovalStatus(caught instanceof Error ? caught.message : "Unable to queue selected actions.");
    } finally {
      setApproving(false);
    }
  }

  function toggleAction(actionId: string) {
    setApprovalStatus(null);
    setSelectedActionIds((current) =>
      current.includes(actionId) ? current.filter((id) => id !== actionId) : [...current, actionId]
    );
  }

  function toggleOpportunity(opportunityId: string) {
    setApprovalStatus(null);
    setSelectedOpportunityIds((current) =>
      current.includes(opportunityId)
        ? current.filter((id) => id !== opportunityId)
        : [...current, opportunityId]
    );
  }

  if (loading && !payload) {
    return (
      <main className="loadingShell">
        <RefreshCw className="spin" aria-hidden="true" />
        <span>Booting CashFlow Radar</span>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="loadingShell">
        <AlertTriangle aria-hidden="true" />
        <span>{error ?? "Unable to load dashboard"}</span>
      </main>
    );
  }

  const breachDate = displayDate(payload.baseline.summary.firstThresholdBreachDate);
  const afterBreachDate = displayDate(payload.afterActions.summary.firstThresholdBreachDate);
  const minimumCashImprovement =
    payload.afterActions.summary.minimumCashBalance - payload.baseline.summary.minimumCashBalance;
  const activeActions = payload.recommendedActions.filter((action) => selectedActionIds.includes(action.id));
  const activeOpportunities = payload.revenueOpportunities.filter((opportunity) =>
    selectedOpportunityIds.includes(opportunity.id)
  );
  const approvalCount = selectedActionIds.length + selectedOpportunityIds.length;
  const xeroRecordStats = [
    ["Invoices", payload.xero.records.invoices],
    ["Contacts", payload.xero.records.contacts],
    ["Line items", payload.xero.records.lineItems],
    ["Accounts", payload.xero.records.accounts],
    ["Items", payload.xero.records.items],
    ["Payments", payload.xero.records.payments],
    ["Quotes", payload.xero.records.quotes],
    ["Bank txns", payload.xero.records.bankTransactions],
    ["Repeating", payload.xero.records.repeatingInvoices],
    ["Tracking", payload.xero.records.trackingCategories],
    ["Reports", payload.xero.records.reports]
  ];
  const mcpStatusLabel = payload.xero.tooling.mcpEnabled
    ? payload.xero.tooling.mcpToolsDiscovered > 0
      ? "MCP connected"
      : "MCP attempted"
    : "MCP ready";
  const accountingScopes = payload.xero.scopes.filter((scope) => scope.startsWith("accounting")).slice(0, 8);

  return (
    <main className="appFrame">
      <aside className="sideRail">
        <div className="brandMark">
          <RadioTower size={18} aria-hidden="true" />
          <div>
            <strong>CashFlow Radar</strong>
            <span>Xero agent cockpit</span>
          </div>
        </div>

        <div className="railSection">
          <span className="railLabel">Source</span>
          <button
            className={`railButton ${source === "demo" ? "active" : ""}`}
            type="button"
            onClick={() => switchSource("demo")}
          >
            <DatabaseZap size={16} aria-hidden="true" />
            Demo snapshot
          </button>
          <button
            className={`railButton ${source === "xero" ? "active" : ""}`}
            type="button"
            onClick={() => switchSource("xero")}
          >
            <Link2 size={16} aria-hidden="true" />
            Live Xero API
          </button>
        </div>

        <div className="railSection">
          <span className="railLabel">Xero connection</span>
          <div className="railStatus">
            <strong>{xeroStatus?.authenticated ? "Connected" : xeroStatus?.configured ? "OAuth ready" : "Config needed"}</strong>
            <span>{xeroStatus?.tenantName ?? payload.xero.note}</span>
          </div>
          {xeroStatus?.configured ? (
            <a className="connectLink" href="/auth/xero/start">
              Connect Xero
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          ) : (
            <div className="connectDisabled">
              <button type="button" disabled>
                Add Xero credentials
              </button>
              <span>{xeroStatus?.missing.join(", ")}</span>
            </div>
          )}
        </div>

        <div className="railSection">
          <span className="railLabel">Agent layer</span>
          {payload.agentLayer.specialists.map((agent) => (
            <div key={agent.name} className="agentDot">
              <span className={agent.status} />
              <strong>{agent.name.replace(" Agent", "")}</strong>
            </div>
          ))}
        </div>
      </aside>

      <section className="workspace">
        <header className="commandBar">
          <div className="commandTitle">
            <div className="eyebrow">
              <Sparkles size={16} aria-hidden="true" />
              Xero growth command
            </div>
            <h1>
              Revenue <em>radar</em>
            </h1>
            <p>{payload.snapshot.organisationName} · cash-flow risk, revenue opportunities, and approved actions</p>
          </div>
          <div className="commandRight">
            <div className="statusCluster" aria-label="System status">
              <span className="livePill">{payload.xero.connected ? "live xero" : "demo xero"}</span>
              <span>{payload.agentLayer.mode === "openai-agents-sdk" ? "agents live" : "agents ready"}</span>
              <span>{horizon}d horizon</span>
            </div>
            <div className="commandActions">
              <button className="ghostButton" type="button" onClick={() => refresh()}>
                <RefreshCw size={16} aria-hidden="true" />
                Refresh
              </button>
              <button
                className="primaryButton"
              type="button"
              onClick={() => approveSelectedActions()}
              disabled={approvalCount === 0 || approving}
            >
              <Check size={16} aria-hidden="true" />
                {approving ? "Queuing..." : `Approve ${approvalCount}`}
              </button>
            </div>
          </div>
        </header>

        <section className="signalBand">
          <MetricTile
            icon={<AlertTriangle size={18} aria-hidden="true" />}
            label="Baseline breach"
            value={breachDate}
            helper={`${payload.baseline.summary.crunchProbability}% crunch probability`}
            tone="danger"
          />
          <MetricTile
            icon={<Check size={18} aria-hidden="true" />}
            label="After actions"
            value={afterBreachDate}
            helper={`${payload.afterActions.summary.crunchProbability}% crunch probability`}
            tone="good"
          />
          <MetricTile
            icon={<CircleDollarSign size={18} aria-hidden="true" />}
            label="Revenue upside"
            value={money(payload.revenueGrowth.totalExpectedRevenue)}
            helper={`${payload.revenueGrowth.opportunitiesDetected} Xero-backed growth opportunities`}
            tone="good"
          />
          <MetricTile
            icon={<TrendingUp size={18} aria-hidden="true" />}
            label="Protected cash"
            value={money(minimumCashImprovement)}
            helper={`${activeActions.length} cash-flow actions selected`}
            tone="neutral"
          />
          <MetricTile
            icon={<ArrowUpRight size={18} aria-hidden="true" />}
            label="Growth actions"
            value={String(activeOpportunities.length)}
            helper={`${money(payload.revenueGrowth.totalExpectedCashFlow)} expected cash-flow lift`}
            tone="neutral"
          />
          <MetricTile
            icon={<ShieldCheck size={18} aria-hidden="true" />}
            label="Data quality"
            value={`${payload.dataQuality.score}/100`}
            helper={payload.dataQuality.status.replaceAll("-", " ")}
            tone="neutral"
          />
        </section>

        <section className="approvalSummaryPanel">
          <div className="panelHeader compact">
            <div>
              <span className="sectionLabel">Pending approval</span>
              <h2>
                {activeActions.length} cash-flow action(s) and {activeOpportunities.length} growth action(s) selected
              </h2>
            </div>
            <FileClock size={20} aria-hidden="true" />
          </div>
          <div className="approvalSummaryGrid">
            <div className="approvalGroup">
              <div className="approvalGroupHeader">
                <strong>Cash-flow actions</strong>
                <span>{money(activeActions.reduce((sum, action) => sum + action.cashImpactBeforeCrunch, 0))}</span>
              </div>
              <div className="approvalList">
                {activeActions.length > 0 ? (
                  activeActions.map((action) => (
                    <ApprovalCashItem key={action.id} action={action} onToggle={() => toggleAction(action.id)} />
                  ))
                ) : (
                  <EmptyApprovalState label="No cash-flow actions selected" />
                )}
              </div>
            </div>

            <div className="approvalGroup">
              <div className="approvalGroupHeader">
                <strong>Revenue growth actions</strong>
                <span>{money(activeOpportunities.reduce((sum, opportunity) => sum + opportunity.expectedRevenueImpact, 0))}</span>
              </div>
              <div className="approvalList">
                {activeOpportunities.length > 0 ? (
                  activeOpportunities.map((opportunity) => (
                    <ApprovalOpportunityItem
                      key={opportunity.id}
                      opportunity={opportunity}
                      onToggle={() => toggleOpportunity(opportunity.id)}
                    />
                  ))
                ) : (
                  <EmptyApprovalState label="No growth actions selected" />
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="ownerPanel">
          <div className="panelHeader compact">
            <div>
              <span className="sectionLabel">Owner priorities</span>
              <h2>What needs attention before it becomes painful</h2>
            </div>
            <Banknote size={20} aria-hidden="true" />
          </div>
          <div className="ownerPriorityGrid">
            {payload.ownerPriorities.map((priority) => (
              <article key={priority.id} className={`ownerPriorityCard ${priority.urgency}`}>
                <div className="priorityTop">
                  <strong>{priority.title}</strong>
                  <span>{priority.urgency}</span>
                </div>
                <div className="priorityMetric">
                  <span>{priority.metricLabel}</span>
                  <strong>{priority.metricValue}</strong>
                </div>
                <p>{priority.practicalImpact}</p>
                <div className="priorityMove">
                  <Clock3 size={15} aria-hidden="true" />
                  <span>{priority.recommendedMove}</span>
                </div>
                <div className="priorityOutcome">
                  <ShieldCheck size={15} aria-hidden="true" />
                  <span>{priority.ownerOutcome}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mainGrid">
          <div className="chartPanel">
            <div className="panelHeader">
              <div>
                <span className="sectionLabel">Before vs after actions</span>
                <h2>{payload.narrative.headline}</h2>
              </div>
              <div className="segmented" aria-label="Forecast horizon">
                {[30, 60, 90].map((days) => (
                  <button
                    key={days}
                    className={horizon === days ? "active" : ""}
                    type="button"
                    onClick={() => setHorizon(days as Horizon)}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </div>
            <div className="chartFrame">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#1b2445" strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#7f87a5", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={22}
                  />
                  <YAxis
                    tickFormatter={(value) => `£${Math.round(Number(value) / 1000)}k`}
                    tick={{ fill: "#7f87a5", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={54}
                  />
                  <Tooltip
                    formatter={(value) => money(Number(value))}
                    labelFormatter={(_, rows) => rows?.[0]?.payload?.fullDate ?? ""}
                    contentStyle={{
                      background: "#0c1024",
                      border: "1px solid #252d55",
                      borderRadius: 8,
                      color: "#eef2ff"
                    }}
                    labelStyle={{ color: "#9aa4c7" }}
                  />
                  <Legend wrapperStyle={{ color: "#9aa4c7" }} />
                  <ReferenceLine
                    y={payload.snapshot.safeCashThreshold}
                    label="Safe threshold"
                    stroke="#ff4d6d"
                    strokeDasharray="5 5"
                  />
                  {payload.baseline.summary.firstThresholdBreachDate ? (
                    <ReferenceArea
                      x1={formatShortDate(payload.baseline.summary.firstThresholdBreachDate)}
                      x2={formatShortDate(payload.baseline.summary.minimumCashDate)}
                      fill="#ff4d6d"
                      fillOpacity={0.1}
                    />
                  ) : null}
                  <Line type="monotone" name="Before actions" dataKey="before" stroke="#ff4d6d" strokeWidth={3} dot={false} />
                  <Line type="monotone" name="After actions" dataKey="after" stroke="#6d6cff" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <aside className="narrativePanel">
            <span className="sectionLabel">CFO narrative</span>
            <p className="leadText">{payload.narrative.summary}</p>
            <p>{payload.narrative.boardLevelNarrative}</p>
            <div className="assumptionList">
              {payload.narrative.assumptions.map((assumption) => (
                <div key={assumption} className="assumptionItem">
                  <ShieldCheck size={15} aria-hidden="true" />
                  <span>{assumption}</span>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="pipelineGrid">
          <div className="pipelinePanel">
            <div className="panelHeader compact">
              <div>
                <span className="sectionLabel">Xero API footprint</span>
                <h2>{payload.xero.connected ? "Live accounting snapshot" : "Demo snapshot, live path ready"}</h2>
              </div>
              <DatabaseZap size={20} aria-hidden="true" />
            </div>
            <div className="endpointGrid">
              {payload.xero.endpoints.map((endpoint) => (
                <span key={endpoint}>{endpoint}</span>
              ))}
            </div>
            <div className="recordRow">
              <Stat label="Invoices" value={String(payload.xero.records.invoices)} />
              <Stat label="Contacts" value={String(payload.xero.records.contacts)} />
              <Stat label="Reports" value={String(payload.xero.records.reports)} />
            </div>
          </div>

          <div className="pipelinePanel">
            <div className="panelHeader compact">
              <div>
                <span className="sectionLabel">Agents SDK orchestration</span>
                <h2>{payload.agentLayer.mode === "openai-agents-sdk" ? "Specialists ran" : "Specialists ready"}</h2>
              </div>
              <Workflow size={20} aria-hidden="true" />
            </div>
            <div className="agentGrid">
              {payload.agentLayer.specialists.map((agent) => (
                <article key={agent.name}>
                  <strong>{agent.name}</strong>
                  <span>{agent.role}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="xeroDepthPanel">
          <div className="panelHeader compact">
            <div>
              <span className="sectionLabel">Xero resource depth</span>
              <h2>Official API, MCP, Agent Toolkit, and prompt-library patterns</h2>
            </div>
            <ShieldCheck size={20} aria-hidden="true" />
          </div>
          <div className="xeroDepthGrid">
            <article className="xeroDepthCard">
              <strong>Accounting API coverage</strong>
              <p>{payload.xero.endpoints.length} read surfaces feed the forecast and revenue-opportunity models.</p>
              <div className="miniRecordGrid">
                {xeroRecordStats.map(([label, value]) => (
                  <Stat key={label} label={String(label)} value={String(value)} />
                ))}
              </div>
            </article>

            <article className="xeroDepthCard">
              <strong>{mcpStatusLabel}</strong>
              <p>{payload.xero.tooling.mcpServerPackage}</p>
              <div className="pillGrid">
                {payload.xero.tooling.mcpToolExamples.slice(0, 8).map((tool) => (
                  <span key={tool}>{tool}</span>
                ))}
              </div>
              <p>{payload.xero.tooling.agentToolkitPattern}</p>
            </article>

            <article className="xeroDepthCard">
              <strong>{payload.xero.tooling.scopeMode}</strong>
              <p>{payload.xero.tooling.safeWriteMode}</p>
              <div className="pillGrid scopeGrid">
                {accountingScopes.map((scope) => (
                  <span key={scope}>{scope}</span>
                ))}
              </div>
              <div className="resourceList">
                {payload.xero.tooling.promptLibraryGuidance.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="growthPanel">
          <div className="panelHeader compact">
            <div>
              <span className="sectionLabel">Revenue opportunity agent</span>
              <h2>Turns Xero activity into proactive growth actions</h2>
            </div>
            <ArrowUpRight size={20} aria-hidden="true" />
          </div>
          <div className="opportunityGrid">
            {payload.revenueOpportunities.map((opportunity) => (
              <OpportunityCard
                key={opportunity.id}
                opportunity={opportunity}
                selected={selectedOpportunityIds.includes(opportunity.id)}
                onToggle={() => toggleOpportunity(opportunity.id)}
              />
            ))}
          </div>
        </section>

        <section className="actionsPanel">
          <div className="panelHeader compact">
            <div>
              <span className="sectionLabel">Action simulator</span>
              <h2>Ranked by cash protected before the risk window</h2>
            </div>
            {approvalStatus ? <div className="approvalNote">{approvalStatus}</div> : null}
          </div>

          <div className="actionTable">
            {payload.recommendedActions.map((action) => (
              <ActionRow
                key={action.id}
                action={action}
                selected={selectedActionIds.includes(action.id)}
                onToggle={() => toggleAction(action.id)}
              />
            ))}
          </div>
        </section>

        <section className="messagePanel">
          <div className="panelHeader compact">
            <div>
              <span className="sectionLabel">Human approval queue</span>
              <h2>Agent-drafted communications</h2>
            </div>
            <Mail size={20} aria-hidden="true" />
          </div>
          <div className="messageGrid">
            {payload.revenueOpportunities.slice(0, 3).map((opportunity) => (
              <article key={opportunity.id} className="messageCard growthMessage">
                <div className="messageMeta">
                  <span>{opportunity.contactName ?? opportunity.serviceCategory ?? "Internal growth action"}</span>
                  <span>{opportunity.type.replaceAll("_", " ")}</span>
                </div>
                <p>{opportunity.messageDraft}</p>
              </article>
            ))}
            {payload.recommendedActions.map((action) => (
              <article key={action.id} className="messageCard">
                <div className="messageMeta">
                  <span>{action.contactName}</span>
                  <span>{action.invoiceNumber}</span>
                </div>
                <p>{action.messageDraft}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function MetricTile({
  icon,
  label,
  value,
  helper,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper: string;
  tone: "danger" | "good" | "neutral";
}) {
  return (
    <article className={`metricTile ${tone}`}>
      <div className="metricIcon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{helper}</p>
    </article>
  );
}

function ApprovalCashItem({ action, onToggle }: { action: CashAction; onToggle: () => void }) {
  return (
    <article className="approvalItem">
      <label className="approvalSelector">
        <input type="checkbox" checked onChange={onToggle} />
        <span>{action.title}</span>
      </label>
      <div className="approvalMeta">
        <span>{action.contactName}</span>
        <span>{action.invoiceNumber}</span>
        <strong>{money(action.cashImpactBeforeCrunch)}</strong>
      </div>
      <p>{action.rationale}</p>
      <ApprovalPlan plan={action.approvalPlan} />
    </article>
  );
}

function EmptyApprovalState({ label }: { label: string }) {
  return (
    <div className="approvalEmpty">
      <FileClock size={16} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function ApprovalOpportunityItem({
  opportunity,
  onToggle
}: {
  opportunity: RevenueOpportunity;
  onToggle: () => void;
}) {
  return (
    <article className="approvalItem growth">
      <label className="approvalSelector">
        <input type="checkbox" checked onChange={onToggle} />
        <span>{opportunity.title}</span>
      </label>
      <div className="approvalMeta">
        <span>{opportunity.contactName ?? opportunity.serviceCategory ?? "Internal action"}</span>
        <span>{opportunity.type.replaceAll("_", " ")}</span>
        <strong>{money(opportunity.expectedRevenueImpact)}</strong>
      </div>
      <p>{opportunity.recommendedAction}</p>
      <ApprovalPlan plan={opportunity.approvalPlan} />
    </article>
  );
}

function ApprovalPlan({ plan }: { plan: CashAction["approvalPlan"] }) {
  return (
    <div className="approvalPlan">
      <div>
        <span>Xero evidence</span>
        <div className="approvalEvidence">
          {plan.xeroRecords.map((record) => (
            <strong key={record}>{record}</strong>
          ))}
        </div>
      </div>
      <div>
        <span>On approval</span>
        <p>{plan.approvedExecution}</p>
      </div>
      <div>
        <span>Human control</span>
        <p>{plan.humanControl}</p>
      </div>
    </div>
  );
}

function OpportunityCard({
  opportunity,
  selected,
  onToggle
}: {
  opportunity: RevenueOpportunity;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="opportunityCard">
      <div className="opportunityTop">
        <label className="actionSelector">
          <input type="checkbox" checked={selected} onChange={onToggle} />
          <span>{opportunity.title}</span>
        </label>
        <div className="actionType">{opportunity.type.replaceAll("_", " ")}</div>
      </div>
      <div className="recordRow">
        <Stat label="Revenue impact" value={money(opportunity.expectedRevenueImpact)} />
        <Stat label="Cash-flow impact" value={money(opportunity.expectedCashFlowImpact)} />
        <Stat label="Confidence" value={opportunity.confidence} />
      </div>
      <p>{opportunity.recommendedAction}</p>
      <div className="evidenceList">
        {opportunity.evidence.slice(0, 3).map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      <div className="signalList">
        {opportunity.modelSignals.slice(0, 3).map((signal) => (
          <div key={`${opportunity.id}-${signal.label}`}>
            <span>{signal.label}</span>
            <strong>{signal.value}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function ActionRow({
  action,
  selected,
  onToggle
}: {
  action: CashAction;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="actionRow">
      <label className="actionSelector">
        <input type="checkbox" checked={selected} onChange={onToggle} />
        <span>{action.title}</span>
      </label>
      <div className="actionType">{action.type.replaceAll("_", " ")}</div>
      <Stat label="Impact" value={money(action.cashImpactBeforeCrunch)} />
      <Stat label="Confidence" value={action.confidence} />
      <Stat label="Risk" value={action.relationshipRisk} />
      <p>{action.rationale}</p>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function money(value: number) {
  return currencyFormatter.format(value);
}

function formatShortDate(value: ForecastPoint["date"]) {
  const date = new Date(`${value}T00:00:00Z`);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function displayDate(value: ForecastPoint["date"] | null) {
  return value ? formatShortDate(value) : "No breach";
}
