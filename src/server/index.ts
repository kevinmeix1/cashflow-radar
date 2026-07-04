import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import cors from "cors";
import express from "express";
import { buildDashboardPayload } from "./dashboard";
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
    service: "CashFlow Radar API",
    generatedAt: new Date().toISOString()
  });
});

app.get("/api/integrations/xero/status", async (_request, response) => {
  response.json(await getXeroIntegrationStatus());
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
        <p>${state.tenantName ?? "Tenant"} is now available to CashFlow Radar.</p>
        <p><a style="color: #48d6c3;" href="http://127.0.0.1:5173/?source=xero">Return to CashFlow Radar</a></p>
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

app.post("/api/actions/approve", (request, response) => {
  const cashActionIds = Array.isArray(request.body?.cashActionIds) ? request.body.cashActionIds : [];
  const revenueOpportunityIds = Array.isArray(request.body?.revenueOpportunityIds)
    ? request.body.revenueOpportunityIds
    : [];
  const legacyActionIds = Array.isArray(request.body?.actionIds) ? request.body.actionIds : [];
  const actionIds = legacyActionIds.length > 0 ? legacyActionIds : [...cashActionIds, ...revenueOpportunityIds];

  response.json({
    approvedAt: new Date().toISOString(),
    status: "queued-for-human-reviewed-execution",
    source: request.body?.source === "xero" ? "xero" : "demo",
    actionIds,
    counts: {
      cashActions: cashActionIds.length || Math.min(3, actionIds.length),
      revenueOpportunities: revenueOpportunityIds.length || Math.max(0, actionIds.length - 3)
    },
    note: "Approved items are queued for reviewed Xero execution: draft quotes, contact notes, invoice follow-ups, retainer templates, and payment-plan notes."
  });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`CashFlow Radar API listening on http://127.0.0.1:${port}`);
});
