import type {
  CashAction,
  Contact,
  DataQualityResult,
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
      detail: "CashFlow Radar needs a current bank/cash balance before the forecast can be trusted."
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
  const crunchProbability = runMonteCarlo(snapshot, options.actions ?? [], {
    horizonDays,
    runs: options.monteCarloRuns ?? 420
  });

  return {
    name,
    threshold: snapshot.safeCashThreshold,
    horizonDays,
    points,
    summary: {
      ...summarise(points, snapshot.safeCashThreshold),
      crunchProbability
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

function runMonteCarlo(
  snapshot: XeroSnapshot,
  actions: CashAction[],
  options: { horizonDays: number; runs: number }
): number {
  if (options.runs <= 0) return 0;

  let breaches = 0;
  let seed = 20260704;

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

    const scenario = buildForecastScenario(variedSnapshot, "simulation", {
      horizonDays: options.horizonDays,
      actions,
      monteCarloRuns: 0
    });
    if (scenario.summary.firstThresholdBreachDate) breaches += 1;
  }

  return Math.round((breaches / options.runs) * 100);

  function seededRandom() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }
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
