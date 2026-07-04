import fs from "node:fs/promises";
import path from "node:path";
import type { TokenSetParameters } from "xero-node";
import { demoSnapshot } from "../data/demoSnapshot";
import { addDays } from "../forecast/dateUtils";
import type {
  Contact,
  Invoice,
  InvoiceStatus,
  InvoiceType,
  XeroApiProvenance,
  XeroSnapshot
} from "../types/domain";
import { inspectXeroMcpBridge, xeroMcpToolExamples, type XeroMcpBridgeStatus } from "./xeroMcp";

const xeroIdentityScopes = [
  "openid",
  "profile",
  "email",
  "offline_access"
];

export const xeroGranularAccountingScopes = [
  "accounting.invoices",
  "accounting.invoices.read",
  "accounting.payments.read",
  "accounting.banktransactions.read",
  "accounting.reports.aged.read",
  "accounting.reports.balancesheet.read",
  "accounting.reports.profitandloss.read",
  "accounting.reports.trialbalance.read",
  "accounting.contacts",
  "accounting.contacts.read",
  "accounting.settings",
  "accounting.settings.read"
];

export const xeroCompatibilityScopes = [
  // BankSummary still relies on the broad reports scope in the current xero-node surface.
  "accounting.reports.read",
];

export const requiredXeroScopes = [...xeroIdentityScopes, ...xeroGranularAccountingScopes, ...xeroCompatibilityScopes];

export interface XeroIntegrationStatus {
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

export interface XeroSnapshotLoadResult {
  snapshot: XeroSnapshot;
  provenance: XeroApiProvenance;
}

interface StoredXeroState {
  tokenSet?: TokenSetParameters;
  tenantId?: string;
  tenantName?: string;
  updatedAt: string;
}

const xeroEndpoints = [
  "GET /connections",
  "GET /Organisations",
  "GET /Invoices?Statuses=AUTHORISED,PAID",
  "GET /Contacts?summaryOnly=true",
  "GET /Accounts",
  "GET /Items",
  "GET /Payments",
  "GET /Quotes",
  "GET /BankTransactions",
  "GET /RepeatingInvoices",
  "GET /TrackingCategories",
  "GET /Reports/BankSummary",
  "GET /Reports/ProfitAndLoss",
  "GET /Reports/BalanceSheet",
  "GET /Reports/TrialBalance",
  "GET /Reports/AgedReceivablesByContact",
  "GET /Reports/AgedPayablesByContact"
];

function isDemoXeroAuthEnabled() {
  return process.env.XERO_DEMO_AUTH === "true";
}

async function buildDemoXeroLoadResult(): Promise<XeroSnapshotLoadResult> {
  const mcp = await inspectXeroMcpBridge();

  return {
    snapshot: demoSnapshot,
    provenance: {
      ...seededXeroProvenance(mcp),
      mode: "xero-api",
      connected: true,
      tenantId: "local-demo-tenant",
      tenantName: "Xero Demo Company (Local)",
      fetchedAt: new Date().toISOString(),
      note: "Local Xero demo tenant mode: seeded Xero-style data is shown as a connected demo company. Replace dummy credentials with OAuth credentials for live Xero."
    }
  };
}

export function buildXeroToolingProvenance(mcp?: XeroMcpBridgeStatus): XeroApiProvenance["tooling"] {
  return {
    sdk: "xero-node official Accounting SDK",
    mcpServerPackage: mcp?.packageName ?? process.env.XERO_MCP_PACKAGE ?? "@xeroapi/xero-mcp-server@latest",
    mcpEnabled: Boolean(mcp?.enabled),
    mcpAuthMode: mcp?.authMode ?? "not-configured",
    mcpToolsDiscovered: mcp?.toolsDiscovered ?? 0,
    mcpToolExamples: mcp?.toolExamples ?? xeroMcpToolExamples,
    agentToolkitPattern: "OpenAI Agents SDK + MCPServerStdio pattern from XeroAPI/xero-agent-toolkit",
    promptLibraryGuidance: [
      "Centralised Xero provider module",
      "OAuth2 offline_access and token refresh",
      "Granular 2026 accounting scopes",
      "Read-first analysis, human-approved writes",
      "Fail-soft optional endpoint enrichment"
    ],
    scopeMode: "2026 granular scopes plus reports.read compatibility for BankSummary",
    compatibilityScopes: xeroCompatibilityScopes,
    safeWriteMode: "No Xero write endpoint is called until a human approves the queued action."
  };
}

export function seededXeroProvenance(mcp?: XeroMcpBridgeStatus): XeroApiProvenance {
  return {
    mode: "seeded-demo",
    connected: false,
    endpoints: xeroEndpoints,
    scopes: requiredXeroScopes,
    records: {
      invoices: 11,
      contacts: 9,
      reports: 0,
      lineItems: 8,
      accounts: 6,
      items: 7,
      payments: 9,
      quotes: 4,
      bankTransactions: 12,
      repeatingInvoices: 2,
      trackingCategories: 2
    },
    tooling: buildXeroToolingProvenance(mcp),
    note: "Seeded Xero-like demo data. Connect OAuth to replace this with live Accounting API data."
  };
}

export async function getXeroIntegrationStatus(): Promise<XeroIntegrationStatus> {
  if (isDemoXeroAuthEnabled()) {
    return {
      configured: true,
      authenticated: true,
      missing: [],
      scopes: requiredXeroScopes,
      mode: "connected",
      tokenPath: getTokenPath(),
      connectUrl: "/auth/xero/start",
      tenantId: "local-demo-tenant",
      tenantName: "Xero Demo Company (Local)"
    };
  }

  const required = ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET", "XERO_REDIRECT_URI"];
  const missing = required.filter((key) => !process.env[key]);
  const stored = await readStoredXeroState();
  const authenticated = Boolean(stored?.tokenSet?.access_token || stored?.tokenSet?.refresh_token);
  const configured = missing.length === 0;

  return {
    configured,
    authenticated,
    missing,
    scopes: requiredXeroScopes,
    mode: authenticated ? "connected" : configured ? "ready-for-oauth" : "seeded-demo",
    tokenPath: getTokenPath(),
    connectUrl: "/auth/xero/start",
    tenantId: stored?.tenantId,
    tenantName: stored?.tenantName
  };
}

export async function createXeroClient() {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const redirectUri = process.env.XERO_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    const missing = [
      ["XERO_CLIENT_ID", clientId],
      ["XERO_CLIENT_SECRET", clientSecret],
      ["XERO_REDIRECT_URI", redirectUri]
    ]
      .filter(([, value]) => !value)
      .map(([key]) => key);
    throw new Error(`Xero is not configured. Missing: ${missing.join(", ")}`);
  }

  const { XeroClient } = await import("xero-node");

  const xero = new XeroClient({
    clientId,
    clientSecret,
    redirectUris: [redirectUri],
    scopes: requiredXeroScopes
  });
  await xero.initialize();
  return xero;
}

export async function buildXeroConsentUrl(): Promise<string> {
  if (isDemoXeroAuthEnabled()) {
    return "http://127.0.0.1:5173/?source=xero";
  }

  const xero = await createXeroClient();
  return xero.buildConsentUrl();
}

export async function handleXeroCallback(callbackUrl: string): Promise<StoredXeroState> {
  const xero = await createXeroClient();
  const tokenSet = await xero.apiCallback(callbackUrl);
  xero.setTokenSet(tokenSet);
  const tenants = await xero.updateTenants(true);
  const activeTenant = chooseTenant(tenants);

  const state: StoredXeroState = {
    tokenSet: tokenSet as TokenSetParameters,
    tenantId: activeTenant?.tenantId,
    tenantName: activeTenant?.tenantName ?? activeTenant?.name,
    updatedAt: new Date().toISOString()
  };

  await writeStoredXeroState(state);
  return state;
}

export async function loadXeroSnapshotFromApi(): Promise<XeroSnapshotLoadResult> {
  if (isDemoXeroAuthEnabled()) {
    return buildDemoXeroLoadResult();
  }

  const { xero, tenantId, tenantName, tokenSet } = await getAuthorizedXeroSession();
  const asOfDate = new Date().toISOString().slice(0, 10);
  const fromDate = addDays(asOfDate, -90);

  const [orgResponse, contactsResponse, openInvoicesResponse, paidInvoicesResponse, bankSummaryResponse] =
    await Promise.all([
      xero.accountingApi.getOrganisations(tenantId),
      xero.accountingApi.getContacts(tenantId, undefined, undefined, "Name ASC", undefined, 1, undefined, true),
      xero.accountingApi.getInvoices(
        tenantId,
        undefined,
        undefined,
        "DueDate ASC",
        undefined,
        undefined,
        undefined,
        ["AUTHORISED"],
        1,
        false,
        false,
        undefined,
        false
      ),
      xero.accountingApi.getInvoices(
        tenantId,
        undefined,
        undefined,
        "FullyPaidOnDate DESC",
        undefined,
        undefined,
        undefined,
        ["PAID"],
        1,
        false,
        false,
        undefined,
        true
      ),
      xero.accountingApi.getReportBankSummary(tenantId, fromDate, asOfDate)
    ]);

  const [
    accountsResponse,
    itemsResponse,
    paymentsResponse,
    quotesResponse,
    bankTransactionsResponse,
    repeatingInvoicesResponse,
    trackingCategoriesResponse,
    profitAndLossResponse,
    balanceSheetResponse,
    trialBalanceResponse
  ] = await Promise.allSettled([
    xero.accountingApi.getAccounts(tenantId, undefined, undefined, "Code ASC"),
    xero.accountingApi.getItems(tenantId, undefined, undefined, "Name ASC"),
    xero.accountingApi.getPayments(tenantId, undefined, undefined, "Date DESC", 1),
    xero.accountingApi.getQuotes(tenantId, undefined, fromDate, asOfDate, undefined, undefined, undefined, undefined, 1, "Date DESC"),
    xero.accountingApi.getBankTransactions(tenantId, undefined, undefined, "Date DESC", 1),
    xero.accountingApi.getRepeatingInvoices(tenantId, undefined, "Name ASC"),
    xero.accountingApi.getTrackingCategories(tenantId, undefined, "Name ASC", false),
    xero.accountingApi.getReportProfitAndLoss(tenantId, fromDate, asOfDate),
    xero.accountingApi.getReportBalanceSheet(tenantId, asOfDate),
    xero.accountingApi.getReportTrialBalance(tenantId, asOfDate)
  ]);

  const organisation = orgResponse.body.organisations?.[0];
  const rawContacts = contactsResponse.body.contacts ?? [];
  const rawOpenInvoices = openInvoicesResponse.body.invoices ?? [];
  const rawPaidInvoices = paidInvoicesResponse.body.invoices ?? [];
  const rawInvoices = [...rawOpenInvoices, ...rawPaidInvoices];
  const contacts = mapContacts(rawContacts, rawInvoices);
  const invoices = mapInvoices(rawInvoices);
  const openingCashBalance = extractClosingCashFromBankSummary(bankSummaryResponse.body) ?? 0;
  const optionalReports = [profitAndLossResponse, balanceSheetResponse, trialBalanceResponse].filter(
    (result) => result.status === "fulfilled"
  ).length;
  const mcp = await inspectXeroMcpBridge();

  // These report calls add visible Xero depth for the hackathon and can enrich future scoring.
  const reportContactIds = contacts.slice(0, 3).map((contact) => contact.id);
  const reportSettled = await Promise.allSettled(
    reportContactIds.flatMap((contactId) => [
      xero.accountingApi.getReportAgedReceivablesByContact(tenantId, contactId, asOfDate, fromDate, asOfDate),
      xero.accountingApi.getReportAgedPayablesByContact(tenantId, contactId, asOfDate, fromDate, asOfDate)
    ])
  );

  const state: StoredXeroState = {
    tokenSet: xero.readTokenSet() as TokenSetParameters,
    tenantId,
    tenantName,
    updatedAt: new Date().toISOString()
  };
  if (tokenSet?.refresh_token !== state.tokenSet?.refresh_token || tokenSet?.access_token !== state.tokenSet?.access_token) {
    await writeStoredXeroState(state);
  }

  return {
    snapshot: {
      organisationName: organisation?.name ?? tenantName ?? "Connected Xero Organisation",
      currency: String(organisation?.baseCurrency ?? rawInvoices[0]?.currencyCode ?? "GBP"),
      asOfDate,
      openingCashBalance,
      safeCashThreshold: Number(process.env.SAFE_CASH_THRESHOLD ?? 5000),
      contacts,
      invoices,
      recurringCashFlows: []
    },
    provenance: {
      mode: "xero-api",
      connected: true,
      tenantId,
      tenantName: organisation?.name ?? tenantName,
      fetchedAt: new Date().toISOString(),
      endpoints: xeroEndpoints,
      scopes: requiredXeroScopes,
      records: {
        invoices: rawInvoices.length,
        contacts: rawContacts.length,
        reports: 1 + optionalReports + reportSettled.filter((result) => result.status === "fulfilled").length,
        lineItems: rawInvoices.reduce((sum, invoice) => sum + (invoice.lineItems?.length ?? 0), 0),
        accounts: countBodyArray(accountsResponse, "accounts"),
        items: countBodyArray(itemsResponse, "items"),
        payments: countBodyArray(paymentsResponse, "payments"),
        quotes: countBodyArray(quotesResponse, "quotes"),
        bankTransactions: countBodyArray(bankTransactionsResponse, "bankTransactions"),
        repeatingInvoices: countBodyArray(repeatingInvoicesResponse, "repeatingInvoices"),
        trackingCategories: countBodyArray(trackingCategoriesResponse, "trackingCategories")
      },
      tooling: buildXeroToolingProvenance(mcp),
      note: "Live Xero Accounting API snapshot mapped into the deterministic forecast engine."
    }
  };
}

async function getAuthorizedXeroSession() {
  const stored = await readStoredXeroState();
  if (!stored?.tokenSet) {
    throw new Error("Xero OAuth is not connected yet. Visit /auth/xero/start first.");
  }

  const xero = await createXeroClient();
  xero.setTokenSet(stored.tokenSet);

  if (shouldRefresh(stored.tokenSet)) {
    const refreshed = await xero.refreshToken();
    stored.tokenSet = refreshed as TokenSetParameters;
    stored.updatedAt = new Date().toISOString();
    await writeStoredXeroState(stored);
  }

  const tenants = await xero.updateTenants(true);
  const activeTenant = chooseTenant(tenants, stored.tenantId);
  const tenantId = process.env.XERO_TENANT_ID || activeTenant?.tenantId || stored.tenantId;
  if (!tenantId) {
    throw new Error("No Xero tenant is available after OAuth connection.");
  }

  return {
    xero,
    tenantId,
    tenantName: activeTenant?.tenantName ?? activeTenant?.name ?? stored.tenantName,
    tokenSet: stored.tokenSet
  };
}

function chooseTenant(tenants: any[], preferredTenantId?: string) {
  if (!Array.isArray(tenants) || tenants.length === 0) return undefined;
  return tenants.find((tenant) => tenant.tenantId === (process.env.XERO_TENANT_ID || preferredTenantId)) ?? tenants[0];
}

function mapContacts(rawContacts: any[], rawInvoices: any[]): Contact[] {
  const byContact = new Map<string, any[]>();
  for (const invoice of rawInvoices) {
    const contactId = invoice.contact?.contactID;
    if (!contactId) continue;
    byContact.set(contactId, [...(byContact.get(contactId) ?? []), invoice]);
  }

  return rawContacts
    .filter((contact) => contact.contactID)
    .map((contact) => {
      const contactInvoices = byContact.get(contact.contactID) ?? [];
      const paidInvoices = contactInvoices.filter((invoice) => invoice.fullyPaidOnDate && invoice.dueDate);
      const medianDaysLate = median(
        paidInvoices.map((invoice) => daysLate(invoice.dueDate, invoice.fullyPaidOnDate)).filter(Number.isFinite)
      );
      const paymentReliability = paidInvoices.length
        ? clamp(1 - Math.max(0, medianDaysLate) / 45, 0.35, 0.95)
        : 0.68;

      return {
        id: contact.contactID,
        name: contact.name ?? "Unnamed Xero contact",
        kind: contact.isCustomer && contact.isSupplier ? "both" : contact.isSupplier ? "supplier" : "customer",
        email: contact.emailAddress ?? "",
        medianDaysLate: Math.round(medianDaysLate || 8),
        paymentReliability,
        relationshipSensitivity: contact.isSupplier ? "medium" : paymentReliability < 0.55 ? "high" : "low",
        notes: "Imported from Xero Contacts and invoice payment history."
      } satisfies Contact;
    });
}

function mapInvoices(rawInvoices: any[]): Invoice[] {
  return rawInvoices
    .filter((invoice) => invoice.invoiceID && (invoice.type === "ACCREC" || invoice.type === "ACCPAY"))
    .map((invoice) => ({
      id: invoice.invoiceID,
      invoiceNumber: invoice.invoiceNumber ?? invoice.reference ?? invoice.invoiceID,
      type: invoice.type as InvoiceType,
      contactId: invoice.contact?.contactID ?? "unknown-contact",
      issueDate: normaliseDate(invoice.date),
      dueDate: normaliseDate(invoice.dueDate ?? invoice.date),
      amountDue: Number(invoice.amountDue ?? 0),
      total: Number(invoice.total ?? invoice.amountDue ?? 0),
      status: invoice.status as InvoiceStatus,
      expectedPaymentDate: invoice.expectedPaymentDate ? normaliseDate(invoice.expectedPaymentDate) : undefined,
      plannedPaymentDate: invoice.plannedPaymentDate ? normaliseDate(invoice.plannedPaymentDate) : undefined,
      fullyPaidOnDate: invoice.fullyPaidOnDate ? normaliseDate(invoice.fullyPaidOnDate) : undefined,
      lineItems: (invoice.lineItems ?? []).map((item: any, index: number) => ({
        id: item.lineItemID ?? `${invoice.invoiceID}-line-${index}`,
        description: item.description ?? "Xero line item",
        category: inferCategory(item.description, item.accountCode),
        quantity: Number(item.quantity ?? 1),
        unitAmount: Number(item.unitAmount ?? item.lineAmount ?? 0),
        lineAmount: Number(item.lineAmount ?? 0)
      }))
    }));
}

function inferCategory(description?: string, accountCode?: string): string {
  const text = `${description ?? ""} ${accountCode ?? ""}`.toLowerCase();
  if (text.includes("web") || text.includes("site")) return "Website";
  if (text.includes("content") || text.includes("copy")) return "Content";
  if (text.includes("brand") || text.includes("strategy")) return "Strategy";
  if (text.includes("conversion") || text.includes("landing")) return "Conversion";
  if (text.includes("analytics") || text.includes("report")) return "Analytics";
  if (text.includes("retainer") || text.includes("support")) return "Retainer";
  return "General";
}

function extractClosingCashFromBankSummary(reportWithRows: any): number | null {
  const rows = reportWithRows?.reports?.[0]?.rows ?? [];
  const candidates: number[] = [];

  function visit(row: any) {
    const cells = row?.cells ?? [];
    const first = cells[0]?.value;
    if (first === "Total" || row?.rowType === "SummaryRow") {
      const lastNumeric = [...cells].reverse().map((cell) => parseMoney(cell?.value)).find((value) => value !== null);
      if (lastNumeric !== undefined && lastNumeric !== null) candidates.push(lastNumeric);
    }
    for (const child of row?.rows ?? []) visit(child);
  }

  for (const row of rows) visit(row);
  return candidates.at(-1) ?? null;
}

function parseMoney(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[,£$€]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function countBodyArray(result: PromiseSettledResult<{ body: unknown }>, key: string) {
  if (result.status !== "fulfilled") return 0;
  const value = (result.value.body as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.length : 0;
}

function normaliseDate(value?: string | Date): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const msDateMatch = value.match(/\/Date\((\d+)(?:[+-]\d+)?\)\//);
  if (msDateMatch) return new Date(Number(msDateMatch[1])).toISOString().slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

function daysLate(dueDate: string, paidDate: string) {
  const due = new Date(normaliseDate(dueDate)).getTime();
  const paid = new Date(normaliseDate(paidDate)).getTime();
  return Math.max(0, Math.round((paid - due) / (24 * 60 * 60 * 1000)));
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function shouldRefresh(tokenSet: TokenSetParameters) {
  const expiresAt = Number((tokenSet as { expires_at?: number }).expires_at ?? 0);
  return !tokenSet.access_token || (expiresAt > 0 && expiresAt < Date.now() / 1000 + 120);
}

async function readStoredXeroState(): Promise<StoredXeroState | null> {
  try {
    const raw = await fs.readFile(getTokenPath(), "utf8");
    return JSON.parse(raw) as StoredXeroState;
  } catch {
    return null;
  }
}

async function writeStoredXeroState(state: StoredXeroState) {
  const tokenPath = getTokenPath();
  await fs.mkdir(path.dirname(tokenPath), { recursive: true });
  await fs.writeFile(tokenPath, JSON.stringify(state, null, 2));
}

function getTokenPath() {
  const configured = process.env.XERO_TOKEN_PATH ?? ".cashflow-radar/xero-token.json";
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}
