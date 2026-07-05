import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import {
  recordApprovalDecisions,
  resetApprovalDecisionStore
} from "../src/approvals/decisionStore";
import {
  getMappingDecisions,
  recordApprovalAudit,
  recordMappingDecision
} from "../src/audit/auditService";
import { demoSnapshot } from "../src/data/demoSnapshot";
import { buildForecastScenario, recommendCashActions } from "../src/forecast/forecastEngine";
import {
  buildEntityMatches,
  normaliseCompanyName,
  similarity
} from "../src/mapping/smartMappingService";
import { buildRevenueOpportunities } from "../src/revenue/opportunityEngine";
import { buildDashboardPayload } from "../src/server/dashboard";

function testSmartMapping() {
  assert.equal(normaliseCompanyName("Brightside Studio Ltd"), "brightside studio");
  assert.ok(similarity("Brightside Studio Ltd", "Brightside Studios") >= 0.86);

  const matches = buildEntityMatches(demoSnapshot);
  const brightsideMatch = matches.find((match) => match.externalRecordId === "CRM-DEAL-6500");

  assert.ok(brightsideMatch, "Brightside CRM deal should produce a smart mapping candidate");
  assert.equal(brightsideMatch.xeroContactId, "contact-bright");
  assert.ok(brightsideMatch.confidence >= 0.86);
  assert.deepEqual(brightsideMatch.sourceRecordIds, ["CRM-DEAL-6500", "contact-bright"]);
}

function testRevenueLeakDetection() {
  const matches = buildEntityMatches(demoSnapshot);
  const opportunities = buildRevenueOpportunities(demoSnapshot, matches);
  const closedWonLeak = opportunities.find((opportunity) => opportunity.type === "closed_won_not_invoiced");

  assert.ok(closedWonLeak, "Closed-won CRM deal without a matching Xero invoice should become a recommendation");
  assert.equal(closedWonLeak.contactId, "contact-bright");
  assert.equal(closedWonLeak.expectedRevenueImpact, 6500);
  assert.ok(closedWonLeak.evidence.some((item) => item.includes("CRM-DEAL-6500")));
}

function testForecastAndActions() {
  const baseline = buildForecastScenario(demoSnapshot, "Test baseline", {
    horizonDays: 30,
    monteCarloRuns: 40
  });
  const actions = recommendCashActions(demoSnapshot, baseline);
  const afterActions = buildForecastScenario(demoSnapshot, "Test after actions", {
    actions,
    horizonDays: 30,
    monteCarloRuns: 40
  });

  assert.equal(baseline.points.length, 30);
  assert.ok(baseline.summary.crunchProbability >= 0);
  assert.ok(baseline.summary.crunchProbability <= 100);
  assert.ok(actions.length >= 3);
  assert.ok(afterActions.summary.minimumCashBalance >= baseline.summary.minimumCashBalance);
  assert.ok(
    afterActions.summary.crunchProbability <= baseline.summary.crunchProbability,
    "Recommended actions should not increase crunch probability"
  );
}

function testForecastBands() {
  const baseline = buildForecastScenario(demoSnapshot, "Band test", {
    horizonDays: 30,
    monteCarloRuns: 60
  });

  assert.ok(baseline.bands, "Monte Carlo runs should produce forecast bands");
  assert.equal(baseline.bands.length, 30);
  for (const band of baseline.bands) {
    assert.ok(band.pessimisticBalance <= band.expectedBalance, "p10 must not exceed p50");
    assert.ok(band.expectedBalance <= band.optimisticBalance, "p50 must not exceed p90");
  }

  const skipped = buildForecastScenario(demoSnapshot, "No simulation", {
    horizonDays: 30,
    monteCarloRuns: 0
  });
  assert.equal(skipped.bands, undefined);
}

function testUnmatchedExternalOrderDetection() {
  const matches = buildEntityMatches(demoSnapshot);
  const opportunities = buildRevenueOpportunities(demoSnapshot, matches);
  const unmatched = opportunities.find((opportunity) => opportunity.type === "unmatched_external_order");

  assert.ok(unmatched, "A paid external order without a Xero contact match should surface as an opportunity");
  assert.equal(unmatched.expectedRevenueImpact, 720);
  assert.ok(unmatched.modelSignals.some((signal) => signal.value === "SHOPIFY-ORDER-1120"));
}

function testApprovalAudit() {
  const entries = recordApprovalAudit({
    source: "demo",
    cashActionIds: [],
    revenueOpportunityIds: ["closed-won-CRM-DEAL-6500"],
    productivityTaskIds: [],
    integrationCandidateIds: []
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].eventType, "REVENUE_RECOMMENDATION_APPROVED");
  assert.deepEqual(entries[0].sourceRecordIds, ["CRM-DEAL-6500", "contact-bright"]);
  assert.equal(entries[0].payload.previousStatus, "PENDING");
  assert.equal(entries[0].payload.newStatus, "APPROVED");
}

function testRejectionAndEditAudit() {
  const rejected = recordApprovalAudit({
    source: "demo",
    decision: "REJECTED",
    cashActionIds: ["chase-inv-acme-4012"],
    revenueOpportunityIds: [],
    productivityTaskIds: [],
    integrationCandidateIds: []
  });

  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].eventType, "CASH_ACTION_REJECTED");
  assert.equal(rejected[0].payload.newStatus, "REJECTED");
  assert.equal(rejected[0].payload.reviewedExecution, false);

  const edited = recordApprovalAudit({
    source: "demo",
    decision: "APPROVED",
    editedMessages: { "closed-won-CRM-DEAL-6500": "Hi Brightside, updated draft." },
    cashActionIds: [],
    revenueOpportunityIds: ["closed-won-CRM-DEAL-6500"],
    productivityTaskIds: [],
    integrationCandidateIds: []
  });

  assert.equal(edited[0].eventType, "REVENUE_RECOMMENDATION_EDITED");
  assert.equal(edited[0].payload.newStatus, "EDITED");
  assert.equal(edited[0].payload.editedMessage, "Hi Brightside, updated draft.");
}

function testMappingDecisionAudit() {
  const entry = recordMappingDecision({
    matchId: "match-crm-deal-6500",
    decision: "APPROVED",
    externalRecordId: "CRM-DEAL-6500",
    xeroContactId: "contact-bright",
    xeroContactName: "Brightside Studios",
    confidence: 0.98
  });

  assert.equal(entry.eventType, "SMART_MAPPING_APPROVED");
  assert.deepEqual(entry.sourceRecordIds, ["CRM-DEAL-6500", "contact-bright"]);
  assert.equal(entry.payload.previousStatus, "PENDING_REVIEW");
  assert.equal(entry.payload.newStatus, "APPROVED");
  assert.equal(getMappingDecisions()["match-crm-deal-6500"], "APPROVED");
}

async function testDecisionStoreAndDashboardFiltering() {
  process.env.CASHPILOT_DECISION_STORE = path.join(os.tmpdir(), `cashpilot-test-decisions-${Date.now()}.json`);
  await resetApprovalDecisionStore();

  const before = await buildDashboardPayload(demoSnapshot);
  const cashId = before.recommendedActions[0]?.id;
  const revenueId = before.revenueOpportunities[0]?.id;

  assert.ok(cashId, "Dashboard should expose a pending cash action before approval");
  assert.ok(revenueId, "Dashboard should expose a pending revenue action before approval");
  assert.ok(before.forecastIntelligence.decisionCallouts.length >= 4);
  assert.ok(before.forecastIntelligence.timeSeriesDiagnostics.length >= 4);

  await recordApprovalDecisions({
    source: "demo",
    decision: "APPROVED",
    idsByGroup: {
      cash: [cashId],
      revenue: [revenueId],
      productivity: [],
      integration: []
    },
    writebackPreviews: [
      {
        id: cashId,
        title: "Test writeback",
        group: "cash",
        method: "POST",
        endpoint: "/Invoices/test/History",
        object: "Invoice note",
        payload: { safeWriteMode: "test" },
        humanGate: "Owner approval required"
      }
    ]
  });

  const afterApproval = await buildDashboardPayload(demoSnapshot);
  assert.ok(!afterApproval.recommendedActions.some((action) => action.id === cashId));
  assert.ok(!afterApproval.revenueOpportunities.some((opportunity) => opportunity.id === revenueId));
  assert.ok(afterApproval.queuedWritebacks.some((writeback) => writeback.id === cashId));

  await resetApprovalDecisionStore();
  const afterReset = await buildDashboardPayload(demoSnapshot);
  assert.ok(afterReset.recommendedActions.some((action) => action.id === cashId));
}

async function main() {
  testSmartMapping();
  testRevenueLeakDetection();
  testForecastAndActions();
  testForecastBands();
  testUnmatchedExternalOrderDetection();
  testApprovalAudit();
  testRejectionAndEditAudit();
  testMappingDecisionAudit();
  await testDecisionStoreAndDashboardFiltering();
}

await main();

console.log("CashPilot core tests passed.");
