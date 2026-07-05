import { generateAgentNarrative } from "../agents/cfoNarrativeAgent";
import { getApprovalDecisions, getQueuedWritebacks } from "../approvals/decisionStore";
import { demoSnapshot } from "../data/demoSnapshot";
import {
  buildAdaptiveIntegrationCandidates,
  summariseAdaptiveIntegrations
} from "../integrations/adaptive/adaptiveIntegrationEngine";
import {
  assessDataQuality,
  buildFallbackNarrative,
  buildForecastScenario,
  buildForecastIntelligence,
  recommendCashActions
} from "../forecast/forecastEngine";
import type { DashboardPayload, XeroSnapshot } from "../types/domain";
import { seededXeroProvenance } from "../integrations/xero";
import { inspectXeroMcpBridge } from "../integrations/xeroMcp";
import { buildOwnerPriorities } from "../product/ownerPriorities";
import { buildProductivityAutomations, summariseProductivityAutomations } from "../productivity/automationEngine";
import { buildEntityMatches, summariseEntityMatches } from "../mapping/smartMappingService";
import { buildRevenueOpportunities, summariseRevenueGrowth } from "../revenue/opportunityEngine";
import { getAuditLog, getMappingDecisions } from "../audit/auditService";
import { formatMoney } from "../forecast/dateUtils";

export async function buildDashboardPayload(
  snapshot: XeroSnapshot = demoSnapshot,
  options: {
    source?: DashboardPayload["source"];
    xero?: DashboardPayload["xero"];
  } = {}
): Promise<DashboardPayload> {
  const dataQuality = assessDataQuality(snapshot);
  const baseline = buildForecastScenario(snapshot, "Before agent actions");
  const approvalDecisions = await getApprovalDecisions();
  const recommendedActionCandidates = recommendCashActions(snapshot, baseline);
  const effectiveActions = recommendedActionCandidates.filter((action) => approvalDecisions[action.id]?.decision !== "REJECTED");
  const recommendedActions = recommendedActionCandidates.filter((action) => !approvalDecisions[action.id]);
  const afterActions = buildForecastScenario(snapshot, "After recommended actions", {
    actions: effectiveActions
  });
  const mappingDecisions = getMappingDecisions();
  const entityMatches = buildEntityMatches(snapshot).map((match) => {
    const decision = mappingDecisions[match.matchId];
    return decision ? { ...match, matchStatus: decision } : match;
  });
  const smartMappingSummary = summariseEntityMatches(entityMatches);
  const revenueOpportunities = buildRevenueOpportunities(snapshot, entityMatches).filter(
    (opportunity) => !approvalDecisions[opportunity.id]
  );
  const revenueGrowth = summariseRevenueGrowth(revenueOpportunities);
  const productivityTasks = buildProductivityAutomations(snapshot).filter((task) => !approvalDecisions[task.id]);
  const productivitySummary = summariseProductivityAutomations(productivityTasks);
  const integrationCandidates = buildAdaptiveIntegrationCandidates(snapshot).filter((candidate) => !approvalDecisions[candidate.id]);
  const integrationSummary = summariseAdaptiveIntegrations(integrationCandidates);
  const forecastIntelligence = buildForecastIntelligence(
    snapshot,
    baseline,
    afterActions,
    effectiveActions,
    revenueGrowth,
    revenueOpportunities
  );
  const ownerPriorities = buildOwnerPriorities({
    snapshot,
    baseline,
    afterActions,
    cashActions: effectiveActions,
    revenueGrowth,
    revenueOpportunities
  });
  const mcp = options.xero ? undefined : await inspectXeroMcpBridge();

  const agentNarrative = await generateAgentNarrative({
    snapshot: {
      organisationName: snapshot.organisationName,
      currency: snapshot.currency,
      asOfDate: snapshot.asOfDate,
      safeCashThreshold: snapshot.safeCashThreshold
    },
    dataQuality,
    baseline: baseline.summary,
    afterActions: afterActions.summary,
    revenueGrowth,
    revenueOpportunities: revenueOpportunities.map((opportunity) => ({
      id: opportunity.id,
      type: opportunity.type,
      title: opportunity.title,
      contactName: opportunity.contactName,
      serviceCategory: opportunity.serviceCategory,
      expectedRevenueImpact: opportunity.expectedRevenueImpact,
      expectedCashFlowImpact: opportunity.expectedCashFlowImpact,
      confidence: opportunity.confidence,
      urgency: opportunity.urgency,
      recommendedAction: opportunity.recommendedAction,
      evidence: opportunity.evidence
    })),
    recommendedActions: effectiveActions.map((action) => ({
      id: action.id,
      type: action.type,
      title: action.title,
      contactName: action.contactName,
      invoiceNumber: action.invoiceNumber,
      cashImpactBeforeCrunch: action.cashImpactBeforeCrunch,
      confidence: action.confidence,
      relationshipRisk: action.relationshipRisk,
      rationale: action.rationale,
      messageDraft: action.messageDraft
    }))
  });

  return {
    source: options.source ?? "seeded-demo",
    generatedAt: new Date().toISOString(),
    snapshot: {
      organisationName: snapshot.organisationName,
      currency: snapshot.currency,
      asOfDate: snapshot.asOfDate,
      openingCashBalance: snapshot.openingCashBalance,
      safeCashThreshold: snapshot.safeCashThreshold
    },
    dataQuality,
    baseline,
    afterActions,
    forecastIntelligence,
    recommendedActions,
    revenueGrowth,
    revenueOpportunities,
    smartMappingSummary,
    entityMatches,
    productivitySummary,
    productivityTasks,
    integrationSummary,
    integrationCandidates,
    auditLog: getAuditLog(),
    ownerPriorities,
    narrative:
      agentNarrative ??
      buildFallbackNarrative(snapshot, baseline, afterActions, recommendedActions, revenueGrowth, revenueOpportunities),
    xero: options.xero ?? seededXeroProvenance(mcp),
    queuedWritebacks: await getQueuedWritebacks(),
    agentLayer: {
      mode: agentNarrative ? "openai-agents-sdk" : "deterministic-fallback",
      specialists: [
        {
          name: "Productivity Automation Agent",
          role: "Handles messy receipts, reconciliation, duplicate bills, and contractor payment prep.",
          status: agentNarrative ? "ran" : "fallback"
        },
        {
          name: "Adaptive Integration Agent",
          role: "Maps CRM, e-commerce, payments, SaaS, and spreadsheet data into Xero objects.",
          status: agentNarrative ? "ran" : "fallback"
        },
        {
          name: "Data Quality Agent",
          role: "Checks whether Xero data is complete enough for forecasting.",
          status: agentNarrative ? "ran" : "fallback"
        },
        {
          name: "Forecast Agent",
          role: "Interprets deterministic risk windows and Monte Carlo output.",
          status: agentNarrative ? "ran" : "fallback"
        },
        {
          name: "Cash Action Agent",
          role: "Ranks customer and supplier interventions by forecast impact.",
          status: agentNarrative ? "ran" : "fallback"
        },
        {
          name: "Collections Agent",
          role: "Drafts customer-specific invoice follow-up messages.",
          status: agentNarrative ? "ran" : "fallback"
        },
        {
          name: "Revenue Growth Agent",
          role: "Finds dormant customers, upsells, subscription conversions, and service opportunities.",
          status: agentNarrative ? "ran" : "fallback"
        },
        {
          name: "Outreach Agent",
          role: "Turns revenue opportunities into customer-specific messages.",
          status: agentNarrative ? "ran" : "fallback"
        },
        {
          name: "Supplier Payment Agent",
          role: "Suggests which bills are safe to delay with human approval.",
          status: agentNarrative ? "ran" : "fallback"
        },
        {
          name: "CFO Narrative Agent",
          role: "Explains the forecast in plain English.",
          status: agentNarrative ? "ran" : "fallback"
        }
      ],
      traceSteps: [
        {
          id: "trace-data-quality",
          agentName: "Data Quality Agent",
          status: agentNarrative ? "ran" : "fallback",
          input: `${snapshot.invoices.length} invoices, ${snapshot.contacts.length} contacts, opening cash ${formatMoney(
            snapshot.openingCashBalance,
            snapshot.currency
          )}`,
          reasoning:
            "Checked whether due dates, contacts, opening cash, and payment history are complete enough to trust the forecast.",
          output: `${dataQuality.score}/100 data quality: ${dataQuality.status.replaceAll("-", " ")}`,
          xeroEvidence: ["GET /Invoices", "GET /Contacts", "GET /Reports/BankSummary"]
        },
        {
          id: "trace-forecast",
          agentName: "Forecast Agent",
          status: agentNarrative ? "ran" : "fallback",
          input: `${baseline.horizonDays}-day ledger with ${baseline.bands?.length ?? 0} Monte Carlo band points`,
          reasoning:
            "Interpreted the risk window, safe-cash threshold, simulated uncertainty, and before/after action movement.",
          output: baseline.summary.firstThresholdBreachDate
            ? `Cash falls below threshold on ${baseline.summary.firstThresholdBreachDate}; after-action minimum is ${formatMoney(
                afterActions.summary.minimumCashBalance,
                snapshot.currency
              )}.`
            : "No threshold breach detected in the selected horizon.",
          xeroEvidence: ["GET /Invoices?Statuses=AUTHORISED,PAID", "GET /Reports/BankSummary", "GET /RepeatingInvoices"]
        },
        {
          id: "trace-cash-actions",
          agentName: "Cash Action Agent",
          status: agentNarrative ? "ran" : "fallback",
          input: `${recommendedActionCandidates.length} cash intervention candidates`,
          reasoning: "Ranked customer and supplier moves by cash protected before the risk window and relationship risk.",
          output: `${recommendedActions.length} pending cash action(s); ${effectiveActions.length} action(s) included in after-action forecast.`,
          xeroEvidence: ["Invoices", "Contacts", "Payment timing history"]
        },
        {
          id: "trace-revenue-growth",
          agentName: "Revenue Growth Agent",
          status: agentNarrative ? "ran" : "fallback",
          input: `${revenueOpportunities.length} pending revenue opportunities from invoices, contacts, line items, and external matches`,
          reasoning:
            "Looked for closed-won uninvoiced work, dormant high-value customers, repeat purchases, upsells, and unmatched external orders.",
          output: `${formatMoney(revenueGrowth.totalExpectedRevenue, snapshot.currency)} expected revenue upside remains pending.`,
          xeroEvidence: ["GET /Invoices", "GET /Contacts", "GET /Items", "Smart Mapping Review"]
        },
        {
          id: "trace-communications",
          agentName: "Communication Agent",
          status: agentNarrative ? "ran" : "fallback",
          input: `${recommendedActions.length + revenueOpportunities.length} customer/supplier message drafts`,
          reasoning: "Kept outreach specific, respectful, and gated behind owner approval.",
          output: "Draft messages are editable before any Xero writeback or external send.",
          xeroEvidence: ["Contact names", "Invoice numbers", "Amounts due", "Approval audit trail"]
        }
      ],
      traceHint: agentNarrative
        ? "OpenAI Agents SDK run completed; inspect traces in the OpenAI dashboard when tracing is enabled."
        : "OPENAI_API_KEY is not set, so deterministic fallback text is active while agent scaffolding remains ready."
    }
  };
}
