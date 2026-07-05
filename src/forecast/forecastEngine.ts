import type {
  CashAction,
  CashDriverInsight,
  Contact,
  DataQualityResult,
  ForecastBandPoint,
  ForecastIntelligence,
  ForecastPoint,
  ForecastScenario,
  Invoice,
  RevenueGrowthSummary,
  RevenueOpportunity,
  XeroSnapshot
} from "../types/domain";
import { addDays, dateRange, daysBetween, formatMoney, maxDate, minDate } from "./dateUtils";

interface ForecastOptions {
  horizonDays?: number;
  actions?: CashAction[];
  monteCarloRuns?: number;
}

interface PaymentEvent {
  date: string;
  direction: "inflow" | "outflow";
  amount: number;
  source: "customer" | "supplier" | "recurring";
}

export function assessDataQuality(snapshot: XeroSnapshot): DataQualityResult {
  const issues: DataQualityResult["issues"] = [];
  const openInvoices = snapshot.invoices.filter((invoice) => invoice.status === "AUTHORISED");

  if (snapshot.openingCashBalance <= 0) {
    issues.push({
      severity: "critical",
      title: "Opening cash is missing or non-positive",
      detail: "CashPilot needs a current bank/cash balance before the forecast can be trusted."
    });
  }

  const invoicesWithoutContacts = openInvoices.filter(
    (invoice) => !snapshot.contacts.some((contact) => contact.id === invoice.contactId)
  );
  if (invoicesWithoutContacts.length > 0) {
    issues.push({
      severity: "warning",
      title: "Some invoices are missing contact records",
      detail: `${invoicesWithoutContacts.length} open item(s) cannot use customer or supplier behaviour.`
    });
  }

  const invoicesWithoutDueDates = openInvoices.filter((invoice) => !invoice.dueDate);
  if (invoicesWithoutDueDates.length > 0) {
    issues.push({
      severity: "warning",
      title: "Some open invoices have no due date",
      detail: `${invoicesWithoutDueDates.length} open item(s) will be excluded from timing-sensitive forecasts.`
    });
  }

  const paidInvoices = snapshot.invoices.filter((invoice) => invoice.status === "PAID");
  if (paidInvoices.length < 3) {
    issues.push({
      severity: "info",
      title: "Limited paid-invoice history",
      detail: "The customer delay model is using contact-level assumptions until more payment history is available."
    });
  }

  const penalty = issues.reduce((total, issue) => {
    if (issue.severity === "critical") return total + 38;
    if (issue.severity === "warning") return total + 16;
    return total + 6;
  }, 0);
  const score = Math.max(0, 100 - penalty);

  return {
    score,
    status: score >= 80 ? "forecast-ready" : score >= 55 ? "usable-with-caveats" : "needs-cleanup",
    issues
  };
}

export function buildForecastScenario(
  snapshot: XeroSnapshot,
  name: string,
  options: ForecastOptions = {}
): ForecastScenario {
  const horizonDays = options.horizonDays ?? 90;
  const events = buildPaymentEvents(snapshot, options.actions ?? [], horizonDays);
  const points = buildDailyLedger(snapshot, events, horizonDays);
  const simulation = runMonteCarlo(snapshot, options.actions ?? [], {
    horizonDays,
    runs: options.monteCarloRuns ?? 420
  });

  return {
    name,
    threshold: snapshot.safeCashThreshold,
    horizonDays,
    points,
    bands: simulation.bands,
    summary: {
      ...summarise(points, snapshot.safeCashThreshold),
      crunchProbability: simulation.crunchProbability
    }
  };
}

export function recommendCashActions(snapshot: XeroSnapshot, baseline: ForecastScenario): CashAction[] {
  const breachDate = baseline.summary.firstThresholdBreachDate ?? addDays(snapshot.asOfDate, 30);
  const contacts = new Map(snapshot.contacts.map((contact) => [contact.id, contact]));

  const receivableActions = snapshot.invoices
    .filter((invoice) => invoice.type === "ACCREC" && invoice.status === "AUTHORISED" && invoice.amountDue > 0)
    .flatMap((invoice) => {
      const contact = contacts.get(invoice.contactId);
      if (!contact) return [];
      const expectedDate = expectedReceivableDate(snapshot.asOfDate, invoice, contact);
      const chaseDate = maxDate(addDays(snapshot.asOfDate, 5), snapshot.asOfDate);
      const canAccelerateBeforeCrunch = expectedDate > breachDate && chaseDate <= breachDate;
      const actions: CashAction[] = [];
      const isLargeFutureInvoice = invoice.amountDue >= 6000 && invoice.dueDate >= snapshot.asOfDate;

      if (!isLargeFutureInvoice) {
        actions.push({
          id: `chase-${invoice.id}`,
          type: "chase_invoice",
          title: `Chase ${contact.name}`,
          contactId: contact.id,
          contactName: contact.name,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          grossAmount: invoice.amountDue,
          estimatedCost: 0,
          amount: invoice.amountDue,
          cashImpactBeforeCrunch: canAccelerateBeforeCrunch ? invoice.amountDue : invoice.amountDue * 0.35,
          actionDate: snapshot.asOfDate,
          expectedCashDate: chaseDate,
          confidence: confidenceFromReliability(contact.paymentReliability),
          relationshipRisk: contact.relationshipSensitivity === "high" ? "medium" : "low",
          rationale: `${contact.name} usually pays ${contact.medianDaysLate} days late, so a targeted reminder can pull ${invoice.invoiceNumber} into the risk window.`,
          messageDraft: buildCollectionMessage(contact, invoice, "chase"),
          approvalPlan: {
            xeroRecords: [
              `Invoice ${invoice.invoiceNumber}`,
              `Contact ${contact.name}`,
              `${formatMoney(invoice.amountDue, snapshot.currency)} receivable`
            ],
            approvedExecution:
              "Create a contact note and queue the invoice follow-up draft against the Xero invoice record.",
            humanControl: "Owner reviews the customer message before anything is sent."
          }
        });
      }

      if (isLargeFutureInvoice) {
        const discountRate = 0.02;
        const cost = Math.round(invoice.amountDue * discountRate);
        const expectedCashDate = minDate(addDays(snapshot.asOfDate, 11), addDays(breachDate, -2));
        actions.push({
          id: `discount-${invoice.id}`,
          type: "early_payment_incentive",
          title: `Offer ${contact.name} a 2% early-payment incentive`,
          contactId: contact.id,
          contactName: contact.name,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          grossAmount: invoice.amountDue,
          estimatedCost: cost,
          amount: invoice.amountDue - cost,
          cashImpactBeforeCrunch:
            expectedReceivableDate(snapshot.asOfDate, invoice, contact) > breachDate ? invoice.amountDue - cost : 0,
          actionDate: snapshot.asOfDate,
          expectedCashDate,
          confidence: confidenceFromReliability(contact.paymentReliability),
          relationshipRisk: "low",
          rationale: `The discount costs ${formatMoney(cost, snapshot.currency)} but accelerates a large invoice before the crunch date.`,
          messageDraft: buildCollectionMessage(contact, invoice, "discount"),
          approvalPlan: {
            xeroRecords: [
              `Invoice ${invoice.invoiceNumber}`,
              `Contact ${contact.name}`,
              `2% discount cost ${formatMoney(cost, snapshot.currency)}`
            ],
            approvedExecution:
              "Add an approved early-payment offer note and queue the customer email; invoice totals stay unchanged until payment is confirmed.",
            humanControl: "Owner approves the discount language and can cap the offer window."
          }
        });
      }

      return actions;
    });

  const payableActions: CashAction[] = [];
  for (const invoice of snapshot.invoices.filter(
    (candidate) => candidate.type === "ACCPAY" && candidate.status === "AUTHORISED" && candidate.amountDue > 0
  )) {
    const contact = contacts.get(invoice.contactId);
    if (!contact || contact.relationshipSensitivity === "high") continue;
    const plannedDate = invoice.plannedPaymentDate ?? invoice.dueDate;
    const delayedDate = addDays(plannedDate, 7);
    const helpsRiskWindow = plannedDate <= breachDate && delayedDate > breachDate;

    payableActions.push({
        id: `delay-${invoice.id}`,
        type: "delay_supplier_payment",
        title: `Delay ${contact.name} by 7 days`,
        contactId: contact.id,
        contactName: contact.name,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        grossAmount: invoice.amountDue,
        estimatedCost: 0,
        amount: invoice.amountDue,
        cashImpactBeforeCrunch: helpsRiskWindow ? invoice.amountDue : invoice.amountDue * 0.25,
        actionDate: snapshot.asOfDate,
        expectedCashDate: delayedDate,
        confidence: contact.relationshipSensitivity === "low" ? "high" : "medium",
        relationshipRisk: contact.relationshipSensitivity,
        rationale: `${contact.name} has previously accepted short payment extensions, and this bill lands inside the crunch window.`,
        messageDraft: buildSupplierMessage(contact, invoice, delayedDate),
        approvalPlan: {
          xeroRecords: [
            `Bill ${invoice.invoiceNumber}`,
            `Supplier ${contact.name}`,
            `New target date ${delayedDate}`
          ],
          approvedExecution:
            "Queue a supplier extension request and record the approved payment-plan note against the bill.",
          humanControl: "Owner confirms supplier sensitivity before the request is sent."
        }
      });
  }

  const rankedActions = [...receivableActions, ...payableActions]
    .filter((action) => action.cashImpactBeforeCrunch > 0)
    .sort((left, right) => right.cashImpactBeforeCrunch - left.cashImpactBeforeCrunch);

  return [
    rankedActions.find((action) => action.type === "chase_invoice"),
    rankedActions.find((action) => action.type === "early_payment_incentive"),
    rankedActions.find((action) => action.type === "delay_supplier_payment")
  ]
    .filter((action): action is CashAction => Boolean(action))
    .sort((left, right) => right.cashImpactBeforeCrunch - left.cashImpactBeforeCrunch);
}

export function buildForecastIntelligence(
  snapshot: XeroSnapshot,
  baseline: ForecastScenario,
  afterActions: ForecastScenario,
  actions: CashAction[],
  revenueGrowth?: RevenueGrowthSummary,
  revenueOpportunities: RevenueOpportunity[] = []
): ForecastIntelligence {
  const baselineMinimum = baseline.summary.minimumCashBalance;
  const contacts = new Map(snapshot.contacts.map((contact) => [contact.id, contact]));
  const receivables = snapshot.invoices.filter(
    (invoice) => invoice.type === "ACCREC" && invoice.status === "AUTHORISED" && invoice.amountDue > 0
  );
  const payables = snapshot.invoices.filter(
    (invoice) => invoice.type === "ACCPAY" && invoice.status === "AUTHORISED" && invoice.amountDue > 0
  );
  const totalReceivables = receivables.reduce((sum, invoice) => sum + invoice.amountDue, 0);
  const totalPayables = payables.reduce((sum, invoice) => sum + invoice.amountDue, 0);
  const recurringOutflows = snapshot.recurringCashFlows
    .filter((flow) => flow.direction === "outflow")
    .reduce((sum, flow) => sum + flow.amount, 0);
  const actionProtection = actions.reduce((sum, action) => sum + action.cashImpactBeforeCrunch, 0);
  const largestReceivable = receivables.reduce<Invoice | null>(
    (largest, invoice) => (!largest || invoice.amountDue > largest.amountDue ? invoice : largest),
    null
  );
  const largestReceivableContact = largestReceivable ? contacts.get(largestReceivable.contactId) : undefined;
  const lateWeightedReceivables = receivables.reduce((sum, invoice) => {
    const contact = contacts.get(invoice.contactId);
    if (!contact) return sum;
    const expectedDate = expectedReceivableDate(snapshot.asOfDate, invoice, contact);
    const expectedDelay = Math.max(0, daysBetween(invoice.dueDate, expectedDate));
    return sum + invoice.amountDue * Math.min(1, expectedDelay / 30) * (1 - contact.paymentReliability + 0.35);
  }, 0);
  const receivableDelayImpact = stressReceivableDelay(snapshot, baseline, 7);
  const supplierTimingImpact = stressSupplierTiming(snapshot, baseline, -7);
  const openingBuffer = snapshot.openingCashBalance - snapshot.safeCashThreshold;
  const cashImprovement = afterActions.summary.minimumCashBalance - baseline.summary.minimumCashBalance;

  const cashDriverCandidates: CashDriverInsight[] = [
    {
      id: "driver-payment-delay",
      label: "Customer payment timing",
      direction: "risk",
      impactAmount: Math.round(Math.max(lateWeightedReceivables, receivableDelayImpact)),
      impactLabel: formatMoney(Math.round(Math.max(lateWeightedReceivables, receivableDelayImpact)), snapshot.currency),
      explanation:
        "The forecast is most sensitive to when authorised receivables actually land, not just their due dates.",
      evidence: [
        `${formatMoney(totalReceivables, snapshot.currency)} open customer receivables`,
        `${receivables.length} authorised customer invoice(s)`,
        largestReceivable
          ? `Largest invoice: ${largestReceivable.invoiceNumber} from ${largestReceivableContact?.name ?? "unknown contact"}`
          : "No open receivables"
      ],
      sensitivity: `If open customer receipts slip by 7 days, minimum cash falls by ${formatMoney(
        receivableDelayImpact,
        snapshot.currency
      )}.`,
      confidence: receivables.length >= 2 ? "high" : "medium"
    },
    {
      id: "driver-supplier-timing",
      label: "Supplier payment timing",
      direction: "negative",
      impactAmount: Math.round(Math.max(totalPayables, supplierTimingImpact)),
      impactLabel: formatMoney(Math.round(Math.max(totalPayables, supplierTimingImpact)), snapshot.currency),
      explanation:
        "Supplier bills and planned payment dates create the steepest downward steps in the short-term cash curve.",
      evidence: [
        `${formatMoney(totalPayables, snapshot.currency)} authorised supplier bills`,
        `${payables.length} payable item(s) in the forecast window`,
        actions.some((action) => action.type === "delay_supplier_payment")
          ? "One supplier timing action is available for approval"
          : "No supplier timing action selected"
      ],
      sensitivity: `Pulling supplier payments 7 days earlier lowers minimum cash by ${formatMoney(
        supplierTimingImpact,
        snapshot.currency
      )}.`,
      confidence: payables.length > 0 ? "high" : "medium"
    },
    {
      id: "driver-fixed-cost-load",
      label: "Fixed cost load",
      direction: "negative",
      impactAmount: Math.round(recurringOutflows),
      impactLabel: formatMoney(Math.round(recurringOutflows), snapshot.currency),
      explanation: "Recurring rent, software, and operating costs reduce the buffer even when invoice timing is stable.",
      evidence: [
        `${snapshot.recurringCashFlows.filter((flow) => flow.direction === "outflow").length} recurring outflow(s)`,
        `${formatMoney(recurringOutflows, snapshot.currency)} recurring outflow per cycle`,
        "Recurring flows are projected across the 90-day ledger"
      ],
      sensitivity: `A 10% fixed-cost reduction would improve monthly cash by about ${formatMoney(
        Math.round(recurringOutflows * 0.1),
        snapshot.currency
      )}.`,
      confidence: snapshot.recurringCashFlows.length > 0 ? "medium" : "low"
    },
    {
      id: "driver-action-lift",
      label: "Approved action lift",
      direction: "positive",
      impactAmount: Math.round(actionProtection),
      impactLabel: formatMoney(Math.round(actionProtection), snapshot.currency),
      explanation:
        "The selected cash actions change the timing of receipts and payments before the risk window arrives.",
      evidence: [
        `${actions.length} cash action(s) selected`,
        `${formatMoney(cashImprovement, snapshot.currency)} improvement to minimum cash`,
        afterActions.summary.firstThresholdBreachDate
          ? `After-action breach remains on ${afterActions.summary.firstThresholdBreachDate}`
          : "After-action forecast removes the threshold breach"
      ],
      sensitivity: `Removing selected actions would bring the minimum cash back to ${formatMoney(
        baselineMinimum,
        snapshot.currency
      )}.`,
      confidence: actions.length > 0 ? "high" : "medium"
    },
    {
      id: "driver-revenue-upside",
      label: "Revenue opportunity pipeline",
      direction: "positive",
      impactAmount: Math.round(revenueGrowth?.totalExpectedCashFlow ?? 0),
      impactLabel: formatMoney(Math.round(revenueGrowth?.totalExpectedCashFlow ?? 0), snapshot.currency),
      explanation:
        "Detected growth opportunities do not fix today's bank balance immediately, but they improve the forward cash outlook.",
      evidence: [
        `${revenueGrowth?.opportunitiesDetected ?? 0} growth opportunity/opportunities`,
        `${formatMoney(revenueGrowth?.totalExpectedRevenue ?? 0, snapshot.currency)} expected revenue impact`,
        revenueOpportunities[0]?.title ?? "No growth opportunity detected"
      ],
      sensitivity: `Converting the top opportunity adds about ${formatMoney(
        revenueOpportunities[0]?.expectedCashFlowImpact ?? 0,
        snapshot.currency
      )} expected cash-flow lift.`,
      confidence: revenueOpportunities.length > 0 ? revenueOpportunities[0].confidence : "medium"
    },
    {
      id: "driver-starting-buffer",
      label: "Starting cash buffer",
      direction: openingBuffer >= 0 ? "positive" : "risk",
      impactAmount: Math.round(Math.abs(openingBuffer)),
      impactLabel: formatMoney(Math.round(Math.abs(openingBuffer)), snapshot.currency),
      explanation: "Opening cash relative to the safety threshold determines how much timing shock the business can absorb.",
      evidence: [
        `Opening cash: ${formatMoney(snapshot.openingCashBalance, snapshot.currency)}`,
        `Safe threshold: ${formatMoney(snapshot.safeCashThreshold, snapshot.currency)}`,
        baseline.summary.firstThresholdBreachDate
          ? `Baseline breach: ${baseline.summary.firstThresholdBreachDate}`
          : "No baseline breach in horizon"
      ],
      sensitivity: `Every ${formatMoney(1000, snapshot.currency)} of extra starting cash delays or softens threshold risk.`,
      confidence: "high"
    }
  ];
  const cashDrivers = cashDriverCandidates
    .filter((driver) => driver.impactAmount > 0)
    .sort((left, right) => right.impactAmount - left.impactAmount)
    .slice(0, 6);

  const biggestRisk = cashDrivers.find((driver) => driver.direction !== "positive")?.label ?? "No major cash risk";
  const biggestOpportunity = cashDrivers.find((driver) => driver.direction === "positive")?.label ?? "No action lift selected";
  const sharpestDip = findSharpestDailyDip(baseline.points);
  const worstSevenDayWindow = findWorstRollingWindow(baseline.points, 7);
  const dailyNetFlows = baseline.points.map((point) => point.closingBalance - point.openingBalance);
  const averageDailyNetFlow = Math.round(dailyNetFlows.reduce((sum, value) => sum + value, 0) / Math.max(1, dailyNetFlows.length));
  const netFlowVolatility = Math.round(standardDeviation(dailyNetFlows));
  const minimumBand = baseline.bands?.find((band) => band.date === baseline.summary.minimumCashDate);
  const actionLift = afterActions.summary.minimumCashBalance - baseline.summary.minimumCashBalance;
  const topDrivers = cashDrivers.slice(0, 3);
  const decisionCallouts = [
    {
      id: "why-cash-dips",
      title: `Why cash dips on ${baseline.summary.minimumCashDate}`,
      answer: sharpestDip
        ? `${formatMoney(sharpestDip.netMovement, snapshot.currency)} net movement on ${sharpestDip.date}, driven by ${formatMoney(
            sharpestDip.outflows,
            snapshot.currency
          )} of outflows against ${formatMoney(sharpestDip.inflows, snapshot.currency)} of inflows.`
        : "No material cash dip appears in the selected forecast horizon.",
      evidence: [
        `${formatMoney(totalPayables, snapshot.currency)} authorised supplier bills in the model`,
        `${formatMoney(totalReceivables, snapshot.currency)} authorised receivables depend on payment timing`,
        baseline.summary.firstThresholdBreachDate
          ? `Safe threshold first breached on ${baseline.summary.firstThresholdBreachDate}`
          : "Safe threshold is not breached"
      ],
      businessDecision: "Prioritise actions that move cash before the minimum-cash date, not actions that arrive after the danger window."
    },
    {
      id: "top-three-factors",
      title: "Which 3 factors move cash most",
      answer: topDrivers.map((driver) => `${driver.label}: ${driver.impactLabel}`).join(" | "),
      evidence: topDrivers.flatMap((driver) => driver.evidence.slice(0, 1)),
      businessDecision: "Focus the owner conversation on the few timing levers that actually change runway."
    },
    {
      id: "what-changed-after-actions",
      title: "What changed after actions",
      answer: `${formatMoney(actionLift, snapshot.currency)} improvement to minimum cash; crunch probability moves from ${
        baseline.summary.crunchProbability
      }% to ${afterActions.summary.crunchProbability}%.`,
      evidence: [
        `${actions.length} cash-flow action(s) included`,
        afterActions.summary.firstThresholdBreachDate
          ? `After-action breach remains on ${afterActions.summary.firstThresholdBreachDate}`
          : "After-action forecast removes the threshold breach",
        actions[0]?.title ?? "No cash action selected"
      ],
      businessDecision: "Approve the smallest action bundle that removes the breach and preserves supplier/customer trust."
    },
    {
      id: "monte-carlo-meaning",
      title: "Monte Carlo means many realistic payment futures",
      answer: minimumBand
        ? `At the minimum-cash date, simulated outcomes range from ${formatMoney(
            minimumBand.pessimisticBalance,
            snapshot.currency
          )} to ${formatMoney(minimumBand.optimisticBalance, snapshot.currency)}.`
        : `${baseline.summary.crunchProbability}% of simulated payment futures fall below the safe cash threshold.`,
      evidence: [
        "420 seeded simulations vary customer payment delay around contact reliability",
        "p10-p90 band shows the middle 80% of realistic outcomes",
        "The red line is the deterministic expected timing case"
      ],
      businessDecision: "Treat the forecast as a risk range, not a single promise; approve actions that work in pessimistic timing cases."
    }
  ];
  const timeSeriesDiagnostics = [
    {
      id: "daily-ledger",
      label: "Daily ledger model",
      value: `${baseline.points.length} forecast days`,
      detail: `Every day rolls opening cash plus dated receivables, supplier bills, and recurring flows into closing cash.`,
      method: "Time-indexed deterministic ledger from Xero due dates, planned payment dates, expected payment dates, and recurring cash flows."
    },
    {
      id: "rolling-net-flow",
      label: "Worst 7-day net cash movement",
      value: formatMoney(worstSevenDayWindow.netMovement, snapshot.currency),
      detail: `${worstSevenDayWindow.startDate} to ${worstSevenDayWindow.endDate} is the most stressful seven-day run in the baseline forecast.`,
      method: "Rolling seven-day window over daily closing-minus-opening cash movement."
    },
    {
      id: "cash-velocity",
      label: "Average daily cash velocity",
      value: formatMoney(averageDailyNetFlow, snapshot.currency),
      detail: `Daily movement volatility is ${formatMoney(netFlowVolatility, snapshot.currency)}, which is why timing changes matter more than the average.`,
      method: "Mean and standard deviation of daily net cash movements across the forecast horizon."
    },
    {
      id: "payment-timing-band",
      label: "Payment timing uncertainty",
      value: `${baseline.summary.crunchProbability}% crunch probability`,
      detail: minimumBand
        ? `On ${minimumBand.date}, the simulated p10-p90 balance range is ${formatMoney(
            minimumBand.pessimisticBalance,
            snapshot.currency
          )} to ${formatMoney(minimumBand.optimisticBalance, snapshot.currency)}.`
        : "Monte Carlo band is unavailable for this run.",
      method: "Monte Carlo simulation using contact payment reliability and invoice timing variance."
    }
  ];

  return {
    explainabilitySummary: `${biggestRisk} is the main pressure on cash, while ${biggestOpportunity.toLowerCase()} is the strongest lever the owner can control.`,
    biggestRisk,
    biggestOpportunity,
    decisionCallouts,
    timeSeriesDiagnostics,
    models: [
      {
        id: "model-daily-ledger",
        name: "Daily cash ledger forecast",
        type: "time_series",
        purpose: "Project daily opening and closing cash over 30-90 days.",
        xeroInputs: ["Bank summary", "Authorised invoices", "Bills", "Repeating cash flows"],
        method: "Deterministic time-series ledger with dated inflows and outflows.",
        output: `Minimum baseline cash is ${formatMoney(baseline.summary.minimumCashBalance, snapshot.currency)} on ${
          baseline.summary.minimumCashDate
        }.`,
        confidence: "high"
      },
      {
        id: "model-payment-delay",
        name: "Customer payment-delay model",
        type: "payment_delay",
        purpose: "Estimate when receivables will actually arrive.",
        xeroInputs: ["Contacts", "Paid invoices", "Due dates", "Fully paid dates"],
        method: "Contact-level median days late and reliability scoring from Xero payment history.",
        output: `${formatMoney(totalReceivables, snapshot.currency)} of open receivables are timing-sensitive.`,
        confidence: receivables.length >= 2 ? "high" : "medium"
      },
      {
        id: "model-monte-carlo",
        name: "Monte Carlo cash simulation",
        type: "monte_carlo",
        purpose: "Estimate probability of a future cash threshold breach.",
        xeroInputs: ["Open receivables", "Customer reliability", "Supplier bills", "Recurring flows"],
        method: "420 seeded simulations varying customer payment delays around contact reliability.",
        output: `${baseline.summary.crunchProbability}% baseline crunch probability, ${afterActions.summary.crunchProbability}% after actions.`,
        confidence: "medium"
      },
      {
        id: "model-driver-attribution",
        name: "Cash-driver attribution",
        type: "driver_attribution",
        purpose: "Explain which business factors move the forecast most.",
        xeroInputs: ["Invoice concentration", "Payable timing", "Recurring costs", "Action impact"],
        method: "Sensitivity tests and factor scoring against the minimum cash point.",
        output: `${cashDrivers.length} ranked cash drivers explain the forecast movement.`,
        confidence: "medium"
      }
    ],
    cashDrivers
  };
}

export function buildFallbackNarrative(
  snapshot: XeroSnapshot,
  baseline: ForecastScenario,
  afterActions: ForecastScenario,
  actions: CashAction[],
  revenueGrowth?: RevenueGrowthSummary,
  revenueOpportunities: RevenueOpportunity[] = []
) {
  const breach = baseline.summary.firstThresholdBreachDate;
  const afterBreach = afterActions.summary.firstThresholdBreachDate;
  const topAction = actions[0];
  const topOpportunity = revenueOpportunities[0];
  const opportunityNoun =
    revenueGrowth?.opportunitiesDetected === 1 ? "growth opportunity" : "growth opportunities";
  const revenuePhrase = revenueGrowth?.totalExpectedRevenue
    ? ` The revenue agent also found ${revenueGrowth.opportunitiesDetected} ${opportunityNoun} worth ${formatMoney(
        revenueGrowth.totalExpectedRevenue,
        snapshot.currency
      )} in expected revenue.`
    : "";

  return {
    headline: breach
      ? `Cash risk appears on ${breach}; growth and cash actions remove the immediate breach.`
      : "No cash threshold breach detected; revenue opportunities are ready for outreach.",
    summary: breach
      ? `Baseline cash falls to ${formatMoney(
          baseline.summary.minimumCashBalance,
          snapshot.currency
        )}. With the recommended actions, the minimum projected cash position improves to ${formatMoney(
          afterActions.summary.minimumCashBalance,
          snapshot.currency
        )}.${revenuePhrase}`
      : `The 90-day baseline stays above the ${formatMoney(snapshot.safeCashThreshold, snapshot.currency)} safety threshold.${revenuePhrase}`,
    boardLevelNarrative: topOpportunity
      ? `The strongest growth move is "${topOpportunity.title}", with ${formatMoney(
          topOpportunity.expectedRevenueImpact,
          snapshot.currency
        )} of expected revenue impact. The cash forecast still matters: "${topAction?.title ?? "the top cash action"}" protects ${formatMoney(
          topAction?.cashImpactBeforeCrunch ?? 0,
          snapshot.currency
        )} before the risk window.`
      : topAction
        ? `The forecast is most sensitive to working-capital timing rather than revenue loss. The highest-impact move is "${topAction.title}", which contributes ${formatMoney(
          topAction.cashImpactBeforeCrunch,
          snapshot.currency
        )} of protection before the risk window.`
        : "The forecast does not require immediate intervention, but the business should keep monitoring large receivables and supplier commitments.",
    assumptions: [
      "Customer payment timing is estimated from contact-level payment behaviour.",
      "Revenue opportunities are detected from Xero invoices, contacts, payment history, and invoice line items.",
      "Supplier bills are assumed to be paid on planned payment date unless an approved action changes it.",
      "AI agents explain and draft actions; deterministic forecast code performs numerical calculations.",
      afterBreach
        ? `Even after actions, cash breaches the threshold on ${afterBreach}.`
        : "After recommended actions, no threshold breach appears in the selected horizon."
    ]
  };
}

function buildPaymentEvents(snapshot: XeroSnapshot, actions: CashAction[], horizonDays: number): PaymentEvent[] {
  const actionByInvoice = new Map(actions.map((action) => [action.invoiceId, action]));
  const contacts = new Map(snapshot.contacts.map((contact) => [contact.id, contact]));
  const horizonEnd = addDays(snapshot.asOfDate, horizonDays - 1);
  const events: PaymentEvent[] = [];

  for (const invoice of snapshot.invoices) {
    if (invoice.status !== "AUTHORISED" || invoice.amountDue <= 0) continue;
    const action = actionByInvoice.get(invoice.id);

    if (invoice.type === "ACCREC") {
      const contact = contacts.get(invoice.contactId);
      if (!contact) continue;
      const date = action?.type === "chase_invoice" || action?.type === "early_payment_incentive"
        ? action.expectedCashDate
        : expectedReceivableDate(snapshot.asOfDate, invoice, contact);
      const amount = action?.type === "early_payment_incentive" ? action.amount : invoice.amountDue;
      if (date >= snapshot.asOfDate && date <= horizonEnd) {
        events.push({ date, direction: "inflow", amount, source: "customer" });
      }
    }

    if (invoice.type === "ACCPAY") {
      const date = action?.type === "delay_supplier_payment"
        ? action.expectedCashDate
        : invoice.plannedPaymentDate ?? invoice.dueDate;
      if (date >= snapshot.asOfDate && date <= horizonEnd) {
        events.push({ date, direction: "outflow", amount: invoice.amountDue, source: "supplier" });
      }
    }
  }

  for (const recurring of snapshot.recurringCashFlows) {
    for (let date = recurring.nextDate; date <= horizonEnd; date = addDays(date, recurring.cadenceDays)) {
      if (date < snapshot.asOfDate) continue;
      events.push({
        date,
        direction: recurring.direction,
        amount: recurring.amount,
        source: "recurring"
      });
    }
  }

  return events;
}

function buildDailyLedger(snapshot: XeroSnapshot, events: PaymentEvent[], horizonDays: number): ForecastPoint[] {
  const days = dateRange(snapshot.asOfDate, horizonDays);
  let balance = snapshot.openingCashBalance;

  return days.map((date) => {
    const openingBalance = balance;
    const dayEvents = events.filter((event) => event.date === date);
    const customerInflows = sum(dayEvents, "inflow", "customer");
    const supplierOutflows = sum(dayEvents, "outflow", "supplier");
    const recurringInflows = sum(dayEvents, "inflow", "recurring");
    const recurringOutflows = sum(dayEvents, "outflow", "recurring");
    balance = openingBalance + customerInflows + recurringInflows - supplierOutflows - recurringOutflows;

    return {
      date,
      openingBalance,
      customerInflows,
      supplierOutflows,
      recurringInflows,
      recurringOutflows,
      closingBalance: balance
    };
  });
}

function summarise(points: ForecastPoint[], threshold: number) {
  const firstBreach = points.find((point) => point.closingBalance < threshold);
  const minimum = points.reduce((lowest, point) =>
    point.closingBalance < lowest.closingBalance ? point : lowest
  );

  return {
    firstThresholdBreachDate: firstBreach?.date ?? null,
    minimumCashDate: minimum.date,
    minimumCashBalance: Math.round(minimum.closingBalance)
  };
}

function expectedReceivableDate(asOfDate: string, invoice: Invoice, contact: Contact): string {
  const modelDate = invoice.expectedPaymentDate ?? addDays(invoice.dueDate, contact.medianDaysLate);
  if (modelDate < asOfDate) {
    return addDays(asOfDate, Math.max(3, Math.round((1 - contact.paymentReliability) * 16)));
  }
  return modelDate;
}

interface MonteCarloResult {
  crunchProbability: number;
  /** p10 (pessimistic) / p50 (expected) / p90 (optimistic) daily balances across runs. */
  bands?: ForecastBandPoint[];
}

function runMonteCarlo(
  snapshot: XeroSnapshot,
  actions: CashAction[],
  options: { horizonDays: number; runs: number }
): MonteCarloResult {
  if (options.runs <= 0) return { crunchProbability: 0 };

  let breaches = 0;
  let seed = 20260704;
  const dailyBalances: number[][] = Array.from({ length: options.horizonDays }, () => []);
  let dates: string[] = [];

  for (let run = 0; run < options.runs; run += 1) {
    const variedSnapshot: XeroSnapshot = {
      ...snapshot,
      invoices: snapshot.invoices.map((invoice) => {
        if (invoice.type !== "ACCREC" || invoice.status !== "AUTHORISED") return invoice;
        if (actions.some((action) => action.invoiceId === invoice.id)) return invoice;
        const contact = snapshot.contacts.find((candidate) => candidate.id === invoice.contactId);
        if (!contact) return invoice;
        const reliabilityRoll = seededRandom();
        const variance = Math.round(seededRandom() * 18);
        const delay = reliabilityRoll < contact.paymentReliability
          ? Math.max(0, contact.medianDaysLate - Math.round(variance / 2))
          : contact.medianDaysLate + variance + 5;

        return {
          ...invoice,
          expectedPaymentDate: addDays(invoice.dueDate, delay)
        };
      })
    };

    const events = buildPaymentEvents(variedSnapshot, actions, options.horizonDays);
    const points = buildDailyLedger(variedSnapshot, events, options.horizonDays);
    if (points.some((point) => point.closingBalance < snapshot.safeCashThreshold)) breaches += 1;
    if (dates.length === 0) dates = points.map((point) => point.date);
    points.forEach((point, index) => {
      dailyBalances[index].push(point.closingBalance);
    });
  }

  const bands: ForecastBandPoint[] = dailyBalances.map((balances, index) => {
    const sorted = [...balances].sort((left, right) => left - right);
    return {
      date: dates[index],
      pessimisticBalance: Math.round(percentile(sorted, 0.1)),
      expectedBalance: Math.round(percentile(sorted, 0.5)),
      optimisticBalance: Math.round(percentile(sorted, 0.9))
    };
  });

  return {
    crunchProbability: Math.round((breaches / options.runs) * 100),
    bands
  };

  function seededRandom() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }
}

function percentile(sortedValues: number[], ratio: number) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.round(ratio * (sortedValues.length - 1))));
  return sortedValues[index];
}

function stressReceivableDelay(snapshot: XeroSnapshot, baseline: ForecastScenario, days: number) {
  const contacts = new Map(snapshot.contacts.map((contact) => [contact.id, contact]));
  const stressed: XeroSnapshot = {
    ...snapshot,
    invoices: snapshot.invoices.map((invoice) => {
      if (invoice.type !== "ACCREC" || invoice.status !== "AUTHORISED" || invoice.amountDue <= 0) return invoice;
      const contact = contacts.get(invoice.contactId);
      if (!contact) return invoice;

      return {
        ...invoice,
        expectedPaymentDate: addDays(expectedReceivableDate(snapshot.asOfDate, invoice, contact), days)
      };
    })
  };
  const scenario = buildForecastScenario(stressed, "Receivable delay sensitivity", {
    horizonDays: baseline.horizonDays,
    monteCarloRuns: 0
  });
  return Math.max(0, baseline.summary.minimumCashBalance - scenario.summary.minimumCashBalance);
}

function stressSupplierTiming(snapshot: XeroSnapshot, baseline: ForecastScenario, days: number) {
  const stressed: XeroSnapshot = {
    ...snapshot,
    invoices: snapshot.invoices.map((invoice) => {
      if (invoice.type !== "ACCPAY" || invoice.status !== "AUTHORISED" || invoice.amountDue <= 0) return invoice;
      return {
        ...invoice,
        plannedPaymentDate: addDays(invoice.plannedPaymentDate ?? invoice.dueDate, days)
      };
    })
  };
  const scenario = buildForecastScenario(stressed, "Supplier timing sensitivity", {
    horizonDays: baseline.horizonDays,
    monteCarloRuns: 0
  });
  return Math.max(0, baseline.summary.minimumCashBalance - scenario.summary.minimumCashBalance);
}

function findSharpestDailyDip(points: ForecastPoint[]) {
  return points
    .map((point) => ({
      date: point.date,
      inflows: point.customerInflows + point.recurringInflows,
      outflows: point.supplierOutflows + point.recurringOutflows,
      netMovement: point.closingBalance - point.openingBalance
    }))
    .sort((left, right) => left.netMovement - right.netMovement)[0];
}

function findWorstRollingWindow(points: ForecastPoint[], windowDays: number) {
  const daily = points.map((point) => ({
    date: point.date,
    netMovement: point.closingBalance - point.openingBalance
  }));
  const windows = daily.map((point, index) => {
    const window = daily.slice(index, index + windowDays);
    return {
      startDate: point.date,
      endDate: window.at(-1)?.date ?? point.date,
      netMovement: Math.round(window.reduce((sum, day) => sum + day.netMovement, 0))
    };
  });
  return windows.sort((left, right) => left.netMovement - right.netMovement)[0] ?? {
    startDate: points[0]?.date ?? "",
    endDate: points[0]?.date ?? "",
    netMovement: 0
  };
}

function standardDeviation(values: number[]) {
  if (values.length === 0) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function confidenceFromReliability(reliability: number) {
  if (reliability >= 0.8) return "high";
  if (reliability >= 0.62) return "medium";
  return "low";
}

function buildCollectionMessage(contact: Contact, invoice: Invoice, mode: "chase" | "discount") {
  if (mode === "discount") {
    return `Hi ${contact.name}, I hope you are well. We are offering a 2% early-payment discount on ${invoice.invoiceNumber} if payment can be made this week. Would that be helpful on your side?`;
  }

  return `Hi ${contact.name}, I hope you are well. A quick reminder that ${invoice.invoiceNumber} for ${formatMoney(
    invoice.amountDue
  )} is now due. Could you let us know when payment is scheduled?`;
}

function buildSupplierMessage(contact: Contact, invoice: Invoice, delayedDate: string) {
  return `Hi ${contact.name}, we are reviewing payment timing for ${invoice.invoiceNumber}. Would it be possible to move payment to ${delayedDate}? We value the relationship and want to confirm this works for your team.`;
}

function sum(events: PaymentEvent[], direction: "inflow" | "outflow", source: PaymentEvent["source"]) {
  return events
    .filter((event) => event.direction === direction && event.source === source)
    .reduce((total, event) => total + event.amount, 0);
}
