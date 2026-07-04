import type {
  CashAction,
  ForecastScenario,
  OwnerPriority,
  RevenueGrowthSummary,
  RevenueOpportunity,
  XeroSnapshot
} from "../types/domain";
import { formatMoney } from "../forecast/dateUtils";

export function buildOwnerPriorities({
  snapshot,
  baseline,
  afterActions,
  cashActions,
  revenueGrowth,
  revenueOpportunities
}: {
  snapshot: XeroSnapshot;
  baseline: ForecastScenario;
  afterActions: ForecastScenario;
  cashActions: CashAction[];
  revenueGrowth: RevenueGrowthSummary;
  revenueOpportunities: RevenueOpportunity[];
}): OwnerPriority[] {
  const priorities: OwnerPriority[] = [];
  const breachDate = baseline.summary.firstThresholdBreachDate;
  const topCashAction = cashActions[0];
  const latePaymentAction = cashActions.find((action) => action.type === "chase_invoice");
  const supplierAction = cashActions.find((action) => action.type === "delay_supplier_payment");
  const dormantOpportunity = revenueOpportunities.find((opportunity) => opportunity.type === "dormant_customer_reactivation");
  const subscriptionOpportunity = revenueOpportunities.find((opportunity) => opportunity.type === "subscription_conversion");
  const cashImprovement = afterActions.summary.minimumCashBalance - baseline.summary.minimumCashBalance;

  if (breachDate) {
    priorities.push({
      id: "owner-cash-runway",
      type: "cash_runway",
      title: `Avoid the ${shortDate(breachDate)} cash squeeze`,
      practicalImpact: `Baseline cash drops to ${formatMoney(
        baseline.summary.minimumCashBalance,
        snapshot.currency
      )}; approved actions lift the low point by ${formatMoney(cashImprovement, snapshot.currency)}.`,
      recommendedMove: topCashAction
        ? `Approve "${topCashAction.title}" first, then review the remaining queued actions.`
        : "Review the forecast assumptions before committing to new spend.",
      metricLabel: "Runway risk",
      metricValue: `${baseline.summary.crunchProbability}%`,
      urgency: "high",
      effort: "low",
      ownerOutcome: "Protect payroll, rent, and supplier commitments before the gap appears."
    });
  }

  if (latePaymentAction) {
    priorities.push({
      id: "owner-late-payment",
      type: "late_payment_stress",
      title: "Chase cash without sounding desperate",
      practicalImpact: `${latePaymentAction.contactName} can move ${formatMoney(
        latePaymentAction.cashImpactBeforeCrunch,
        snapshot.currency
      )} into the risk window.`,
      recommendedMove: "Send the drafted follow-up, then ask for a specific payment date rather than a vague update.",
      metricLabel: "Cash at stake",
      metricValue: formatMoney(latePaymentAction.cashImpactBeforeCrunch, snapshot.currency),
      urgency: "high",
      effort: "low",
      ownerOutcome: "Reduce awkward collections work while keeping the customer relationship intact."
    });
  }

  if (dormantOpportunity) {
    priorities.push({
      id: "owner-revenue-leakage",
      type: "revenue_leakage",
      title: "Win back revenue that already converted",
      practicalImpact: `${dormantOpportunity.contactName} has proven buying history and is worth ${formatMoney(
        dormantOpportunity.expectedRevenueImpact,
        snapshot.currency
      )} in expected revenue.`,
      recommendedMove: "Send a personalised reactivation note tied to their last successful project.",
      metricLabel: "Expected revenue",
      metricValue: formatMoney(dormantOpportunity.expectedRevenueImpact, snapshot.currency),
      urgency: dormantOpportunity.urgency,
      effort: "medium",
      ownerOutcome: "Grow revenue without starting from a cold lead list."
    });
  }

  if (subscriptionOpportunity) {
    priorities.push({
      id: "owner-predictable-revenue",
      type: "predictable_revenue",
      title: "Turn repeat work into a retainer",
      practicalImpact: `${subscriptionOpportunity.contactName} repeatedly buys ${subscriptionOpportunity.serviceCategory}; packaging it can add ${formatMoney(
        subscriptionOpportunity.expectedCashFlowImpact,
        snapshot.currency
      )} of cash-flow lift.`,
      recommendedMove: "Offer a simple monthly plan with a clear scope, review cadence, and cancellation option.",
      metricLabel: "Revenue upside",
      metricValue: formatMoney(subscriptionOpportunity.expectedRevenueImpact, snapshot.currency),
      urgency: subscriptionOpportunity.urgency,
      effort: "medium",
      ownerOutcome: "Replace ad-hoc invoices with a more predictable base of recurring revenue."
    });
  }

  if (supplierAction) {
    priorities.push({
      id: "owner-supplier-trust",
      type: "supplier_trust",
      title: "Protect supplier trust while buying time",
      practicalImpact: `${supplierAction.contactName} can be delayed by 7 days, protecting ${formatMoney(
        supplierAction.cashImpactBeforeCrunch,
        snapshot.currency
      )} before the risk window.`,
      recommendedMove: "Use the supplier message only for lower-sensitivity suppliers and keep the new date specific.",
      metricLabel: "Cash protected",
      metricValue: formatMoney(supplierAction.cashImpactBeforeCrunch, snapshot.currency),
      urgency: "medium",
      effort: "low",
      ownerOutcome: "Create breathing room without training key suppliers to distrust payment promises."
    });
  }

  if (priorities.length === 0 && revenueGrowth.opportunitiesDetected > 0) {
    priorities.push({
      id: "owner-growth-default",
      type: "revenue_leakage",
      title: "Prioritise the easiest revenue lift",
      practicalImpact: `${revenueGrowth.opportunitiesDetected} Xero-backed opportunities total ${formatMoney(
        revenueGrowth.totalExpectedRevenue,
        snapshot.currency
      )} of expected revenue.`,
      recommendedMove: "Approve the highest-confidence outreach draft and review response within 48 hours.",
      metricLabel: "Expected revenue",
      metricValue: formatMoney(revenueGrowth.totalExpectedRevenue, snapshot.currency),
      urgency: "medium",
      effort: "low",
      ownerOutcome: "Create measurable growth activity without adding another dashboard to check."
    });
  }

  return priorities.slice(0, 5);
}

function shortDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short"
  });
}
