import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import cors from "cors";
import express from "express";
import { recordApprovalDecisions, resetApprovalDecisionStore } from "../approvals/decisionStore";
import { buildDashboardPayload } from "./dashboard";
import { getAuditLog, recordApprovalAudit, recordMappingDecision, resetRuntimeAuditState } from "../audit/auditService";
import type { ApprovalDecision } from "../audit/auditService";
import type { QueuedWritebackPreview } from "../types/domain";
import {
  buildXeroConsentUrl,
  getXeroIntegrationStatus,
  handleXeroCallback,
  loadXeroSnapshotFromApi
} from "../integrations/xero";

if (existsSync(".env")) {
  loadEnvFile(".env");
}

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(cors());
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "CashPilot API",
    generatedAt: new Date().toISOString()
  });
});

app.get("/api/integrations/xero/status", async (_request, response) => {
  response.json(await getXeroIntegrationStatus());
});

app.get("/api/audit-log", (_request, response) => {
  response.json({
    auditLog: getAuditLog()
  });
});

app.post("/api/demo/reset", async (_request, response) => {
  await resetApprovalDecisionStore();
  resetRuntimeAuditState();
  response.json({
    resetAt: new Date().toISOString(),
    status: "demo-state-reset"
  });
});

app.get("/auth/xero/start", async (_request, response) => {
  try {
    response.redirect(await buildXeroConsentUrl());
  } catch (error) {
    response.status(500).send(error instanceof Error ? error.message : "Unable to start Xero OAuth");
  }
});

app.get("/auth/xero/callback", async (request, response) => {
  try {
    const callbackUrl = `${request.protocol}://${request.get("host")}${request.originalUrl}`;
    const state = await handleXeroCallback(callbackUrl);
    response.send(`
      <!doctype html>
      <title>Xero connected</title>
      <body style="font-family: system-ui; padding: 40px; background: #071314; color: white;">
        <h1>Xero connected</h1>
        <p>${state.tenantName ?? "Tenant"} is now available to CashPilot.</p>
        <p><a style="color: #48d6c3;" href="http://127.0.0.1:5173/?source=xero">Return to CashPilot</a></p>
      </body>
    `);
  } catch (error) {
    response.status(500).send(error instanceof Error ? error.message : "Unable to complete Xero OAuth");
  }
});

app.get("/api/dashboard", async (request, response) => {
  try {
    const source = request.query.source === "xero" ? "xero" : "demo";
    const live = source === "xero" ? await loadXeroSnapshotFromApi() : undefined;
    const payload = await buildDashboardPayload(live?.snapshot, {
      source: live ? "xero-api" : "seeded-demo",
      xero: live?.provenance
    });

    response.json(payload);
  } catch (error) {
    const shouldFallback = process.env.XERO_USE_DEMO_ON_API_FAILURE !== "false";
    if (shouldFallback && request.query.source === "xero") {
      const payload = await buildDashboardPayload();
      response.json({
        ...payload,
        xero: {
          ...payload.xero,
          note: `Live Xero request failed, so demo data is shown. ${
            error instanceof Error ? error.message : "Unknown dashboard error"
          }`
        }
      });
      return;
    }
    response.status(500).json({ error: error instanceof Error ? error.message : "Unknown dashboard error" });
  }
});

function handleActionDecision(decision: ApprovalDecision) {
  return async (request: express.Request, response: express.Response) => {
    const cashActionIds = Array.isArray(request.body?.cashActionIds) ? request.body.cashActionIds : [];
    const revenueOpportunityIds = Array.isArray(request.body?.revenueOpportunityIds)
      ? request.body.revenueOpportunityIds
      : [];
    const productivityTaskIds = Array.isArray(request.body?.productivityTaskIds) ? request.body.productivityTaskIds : [];
    const integrationCandidateIds = Array.isArray(request.body?.integrationCandidateIds)
      ? request.body.integrationCandidateIds
      : [];
    const editedMessages =
      request.body?.editedMessages && typeof request.body.editedMessages === "object"
        ? (request.body.editedMessages as Record<string, string>)
        : undefined;
    const writebackPreviews = Array.isArray(request.body?.writebackPreviews)
      ? (request.body.writebackPreviews as QueuedWritebackPreview[])
      : [];
    const actionIds = [...cashActionIds, ...revenueOpportunityIds, ...productivityTaskIds, ...integrationCandidateIds];
    const source = request.body?.source === "xero" ? "xero" : "demo";
    const auditEntries = recordApprovalAudit({
      source,
      decision,
      editedMessages,
      cashActionIds,
      revenueOpportunityIds,
      productivityTaskIds,
      integrationCandidateIds
    });
    const storedDecisions = await recordApprovalDecisions({
      source,
      decision,
      editedMessages,
      idsByGroup: {
        cash: cashActionIds,
        revenue: revenueOpportunityIds,
        productivity: productivityTaskIds,
        integration: integrationCandidateIds
      },
      writebackPreviews: decision === "REJECTED" ? [] : writebackPreviews
    });

    response.json({
      decidedAt: new Date().toISOString(),
      decision,
      status: decision === "REJECTED" ? "rejected-and-logged" : "queued-for-human-reviewed-execution",
      source,
      actionIds,
      decisionsStored: storedDecisions.length,
      counts: {
        cashActions: cashActionIds.length,
        revenueOpportunities: revenueOpportunityIds.length,
        productivityTasks: productivityTaskIds.length,
        integrationCandidates: integrationCandidateIds.length
      },
      auditLog: auditEntries,
      note:
        decision === "REJECTED"
          ? "Rejected items are logged with source records and removed from the pending queue. No Xero writeback occurs."
          : "Approved items are queued for reviewed Xero execution: draft quotes, contact notes, invoice follow-ups, retainer templates, reconciliation prep, bill coding, and adaptive integration sync drafts."
    });
  };
}

app.post("/api/actions/approve", handleActionDecision("APPROVED"));
app.post("/api/actions/reject", handleActionDecision("REJECTED"));

app.post("/api/mappings/:matchId/decision", (request, response) => {
  const decision = request.body?.decision;
  if (decision !== "APPROVED" && decision !== "REJECTED" && decision !== "NEEDS_NEW_CONTACT") {
    response.status(400).json({ error: "decision must be APPROVED, REJECTED, or NEEDS_NEW_CONTACT" });
    return;
  }

  const entry = recordMappingDecision({
    matchId: request.params.matchId,
    decision,
    externalRecordId: String(request.body?.externalRecordId ?? request.params.matchId),
    xeroContactId: typeof request.body?.xeroContactId === "string" ? request.body.xeroContactId : undefined,
    xeroContactName: typeof request.body?.xeroContactName === "string" ? request.body.xeroContactName : undefined,
    confidence: typeof request.body?.confidence === "number" ? request.body.confidence : undefined
  });

  response.json({
    matchId: request.params.matchId,
    matchStatus: decision,
    auditEntry: entry,
    note:
      decision === "APPROVED"
        ? "Match confirmed. The external record is now linked to the Xero contact for revenue-leak detection."
        : decision === "REJECTED"
          ? "Match rejected and logged. The external record returns to the unmatched pool."
          : "A new Xero contact draft will be prepared for owner review before anything is created."
  });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`CashPilot API listening on http://127.0.0.1:${port}`);
});
