import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Check,
  CircleDollarSign,
  Clock3,
  DatabaseZap,
  Eye,
  FileClock,
  FileJson,
  Link2,
  ListChecks,
  Mail,
  RadioTower,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Workflow,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { ForecastRiskScene } from "./components/ForecastRiskScene";
import type {
  AdaptiveIntegrationCandidate,
  AuditLogEntry,
  CashAction,
  DashboardPayload,
  EntityMatch,
  ForecastPoint,
  ProductivityAutomationTask,
  QueuedWritebackPreview,
  RevenueOpportunity
} from "./types/domain";

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

type StaticDecision = "APPROVED" | "REJECTED";

interface StaticDecisionRecord {
  id: string;
  group: QueuedWritebackPreview["group"];
  decision: StaticDecision;
  editedMessage?: string;
  writeback?: QueuedWritebackPreview;
  createdAt: string;
}

const staticDecisionStorageKey = "cashpilot-static-decisions-v1";
const staticMappingStorageKey = "cashpilot-static-mapping-decisions-v1";

const staticXeroStatus: XeroStatus = {
  configured: false,
  authenticated: false,
  missing: ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET", "XERO_REDIRECT_URI"],
  scopes: [
    "offline_access",
    "openid",
    "profile",
    "email",
    "accounting.transactions.read",
    "accounting.contacts.read",
    "accounting.settings.read",
    "accounting.reports.read",
    "accounting.transactions",
    "accounting.contacts"
  ],
  mode: "seeded-demo",
  tokenPath: "Browser demo mode",
  connectUrl: "https://developer.xero.com/"
};

const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0
});

const navSections = [
  { id: "overview", label: "Overview" },
  { id: "approvals", label: "Pending approval" },
  { id: "writebacks", label: "Writeback queue" },
  { id: "mapping", label: "Smart mapping" },
  { id: "priorities", label: "Owner priorities" },
  { id: "productivity", label: "Productivity" },
  { id: "integrations", label: "Integrations" },
  { id: "forecast", label: "Cash forecast" },
  { id: "intelligence", label: "Forecast intelligence" },
  { id: "xero", label: "Xero footprint" },
  { id: "agent-trace", label: "Agent trace" },
  { id: "opportunities", label: "Revenue opportunities" },
  { id: "actions", label: "Action simulator" },
  { id: "messages", label: "Draft messages" },
  { id: "audit", label: "Audit log" }
] as const;

type SectionId = (typeof navSections)[number]["id"];

interface ApprovalSelection {
  cashActionIds: string[];
  revenueOpportunityIds: string[];
  productivityTaskIds: string[];
  integrationCandidateIds: string[];
}

interface EvidenceDrawerData {
  id: string;
  title: string;
  family: string;
  summary: string;
  records: string[];
  endpoints: string[];
  fields: string[];
  writeback: QueuedWritebackPreview;
  humanControl: string;
}

export function App() {
  const initialSource = new URLSearchParams(window.location.search).get("source") === "xero" ? "xero" : "demo";
  const [source, setSource] = useState<SourceMode>(initialSource);
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [xeroStatus, setXeroStatus] = useState<XeroStatus | null>(null);
  const [horizon, setHorizon] = useState<Horizon>(30);
  const [selectedActionIds, setSelectedActionIds] = useState<string[]>([]);
  const [selectedOpportunityIds, setSelectedOpportunityIds] = useState<string[]>([]);
  const [selectedProductivityTaskIds, setSelectedProductivityTaskIds] = useState<string[]>([]);
  const [selectedIntegrationCandidateIds, setSelectedIntegrationCandidateIds] = useState<string[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [mappingStatuses, setMappingStatuses] = useState<Record<string, EntityMatch["matchStatus"]>>({});
  const [editedMessages, setEditedMessages] = useState<Record<string, string>>({});
  const [evidenceDrawer, setEvidenceDrawer] = useState<EvidenceDrawerData | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh(nextSource = source) {
    setLoading(true);
    setError(null);
    try {
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
      loadDashboardState(dashboard, xero);
    } catch (caught) {
      const dashboard = await loadStaticDashboardPayload();
      loadDashboardState(applyStaticDashboardState(dashboard), {
        ...staticXeroStatus,
        mode: nextSource === "xero" ? "ready-for-oauth" : "seeded-demo"
      });
      setApprovalStatus("Live demo mode: using packaged Xero demo data because the API server is not running.");
    }
  }

  function loadDashboardState(dashboard: DashboardPayload, xero: XeroStatus) {
    const defaultSelection = buildDefaultApprovalSelection(dashboard);
    setPayload(dashboard);
    setXeroStatus(xero);
    setSelectedActionIds(defaultSelection.cashActionIds);
    setSelectedOpportunityIds(defaultSelection.revenueOpportunityIds);
    setSelectedProductivityTaskIds(defaultSelection.productivityTaskIds);
    setSelectedIntegrationCandidateIds(defaultSelection.integrationCandidateIds);
    setAuditEntries(dashboard.auditLog);
    setMappingStatuses(
      Object.fromEntries(dashboard.entityMatches.map((match) => [match.matchId, match.matchStatus]))
    );
    setEditedMessages({});
    setLoading(false);
  }

  useEffect(() => {
    refresh().catch((caught) => {
      setError(caught instanceof Error ? caught.message : "Unable to load dashboard");
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!payload) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
        if (visible[0]) setActiveSection(visible[0].target.id as SectionId);
      },
      { rootMargin: "-15% 0px -65% 0px" }
    );
    for (const section of navSections) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [payload]);

  const chartData = useMemo(() => {
    if (!payload) return [];
    return payload.baseline.points.slice(0, horizon).map((point, index) => {
      const band = payload.baseline.bands?.[index];
      return {
        date: formatShortDate(point.date),
        fullDate: point.date,
        before: Math.round(point.closingBalance),
        after: Math.round(payload.afterActions.points[index]?.closingBalance ?? point.closingBalance),
        simulationRange: band ? [band.pessimisticBalance, band.optimisticBalance] : undefined,
        threshold: payload.snapshot.safeCashThreshold
      };
    });
  }, [horizon, payload]);

  function jumpToSection(id: SectionId) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(id);
  }

  async function switchSource(nextSource: SourceMode) {
    setSource(nextSource);
    window.history.replaceState(null, "", nextSource === "xero" ? "?source=xero" : window.location.pathname);
    await refresh(nextSource);
  }

  async function resetDemoState() {
    setApprovalStatus("Resetting demo state...");
    clearStaticDemoState();
    try {
      const response = await fetch("/api/demo/reset", { method: "POST" });
      if (!response.ok) throw new Error("Unable to reset API demo state.");
      await refresh(source);
      setApprovalStatus("Demo approvals, mappings, and writeback queue reset.");
    } catch {
      await refresh(source);
      setApprovalStatus("Demo approvals, mappings, and writeback queue reset for this browser.");
    }
  }

  async function submitDecision(decision: "approve" | "reject") {
    if (approvalCount === 0 || approving) return;
    setApproving(true);
    setApprovalStatus(decision === "approve" ? "Submitting approval..." : "Submitting rejection...");
    const selectedEdits = Object.fromEntries(
      Object.entries(editedMessages).filter(
        ([id]) => selectedActionIds.includes(id) || selectedOpportunityIds.includes(id)
      )
    );
    const writebackPreviews = payload
      ? buildSelectedWritebacks(payload, {
          cashActionIds: selectedActionIds,
          revenueOpportunityIds: selectedOpportunityIds,
          productivityTaskIds: selectedProductivityTaskIds,
          integrationCandidateIds: selectedIntegrationCandidateIds
        })
      : [];
    const decidedIds = new Set([
      ...selectedActionIds,
      ...selectedOpportunityIds,
      ...selectedProductivityTaskIds,
      ...selectedIntegrationCandidateIds
    ]);
    try {
      const response = await fetch(`/api/actions/${decision}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashActionIds: selectedActionIds,
          revenueOpportunityIds: selectedOpportunityIds,
          productivityTaskIds: selectedProductivityTaskIds,
          integrationCandidateIds: selectedIntegrationCandidateIds,
          editedMessages: decision === "approve" ? selectedEdits : undefined,
          writebackPreviews: decision === "approve" ? writebackPreviews : [],
          source
        })
      });

      if (!response.ok) throw new Error("Approval queue request failed");

      const result = await response.json();
      const newAuditEntries = Array.isArray(result.auditLog) ? (result.auditLog as AuditLogEntry[]) : [];
      setAuditEntries((current) => [...newAuditEntries, ...current].slice(0, 12));
      const editedCount = decision === "approve" ? Object.keys(selectedEdits).length : 0;
      setApprovalStatus(
        `${result.counts.cashActions} cash-flow, ${result.counts.revenueOpportunities} growth, ${result.counts.productivityTasks} productivity, and ${result.counts.integrationCandidates} integration action(s) ${
          decision === "approve" ? "queued" : "rejected and logged"
        }${editedCount > 0 ? ` (${editedCount} with edited drafts)` : ""}.`
      );
      if (decision === "approve") {
        setPayload((current) =>
          current
            ? {
                ...current,
                queuedWritebacks: [...writebackPreviews, ...current.queuedWritebacks].slice(0, 12)
              }
            : current
        );
      }
      setPayload((current) => (current ? removeDecidedItemsFromPayload(current, decidedIds) : current));
      setSelectedActionIds([]);
      setSelectedOpportunityIds([]);
      setSelectedProductivityTaskIds([]);
      setSelectedIntegrationCandidateIds([]);
      setEditedMessages((current) => removeKeys(current, decidedIds));
    } catch (caught) {
      const localRecords = persistStaticDecision({
        decision: decision === "approve" ? "APPROVED" : "REJECTED",
        editedMessages: selectedEdits,
        selection: {
          cashActionIds: selectedActionIds,
          revenueOpportunityIds: selectedOpportunityIds,
          productivityTaskIds: selectedProductivityTaskIds,
          integrationCandidateIds: selectedIntegrationCandidateIds
        },
        writebacks: decision === "approve" ? writebackPreviews : []
      });
      const localAuditEntries = localRecords.map(staticDecisionToAuditEntry);
      setAuditEntries((current) => [...localAuditEntries, ...current].slice(0, 12));
      setPayload((current) =>
        current
          ? removeDecidedItemsFromPayload(
              {
                ...current,
                queuedWritebacks:
                  decision === "approve"
                    ? [...writebackPreviews, ...current.queuedWritebacks].slice(0, 12)
                    : current.queuedWritebacks
              },
              decidedIds
            )
          : current
      );
      setApprovalStatus(
        `${selectedActionIds.length} cash-flow, ${selectedOpportunityIds.length} growth, ${selectedProductivityTaskIds.length} productivity, and ${selectedIntegrationCandidateIds.length} integration action(s) ${
          decision === "approve" ? "queued in live demo mode" : "rejected and logged in live demo mode"
        }.`
      );
      setSelectedActionIds([]);
      setSelectedOpportunityIds([]);
      setSelectedProductivityTaskIds([]);
      setSelectedIntegrationCandidateIds([]);
      setEditedMessages((current) => removeKeys(current, decidedIds));
    } finally {
      setApproving(false);
    }
  }

  async function decideMapping(match: EntityMatch, decision: "APPROVED" | "REJECTED" | "NEEDS_NEW_CONTACT") {
    try {
      const response = await fetch(`/api/mappings/${match.matchId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          externalRecordId: match.externalRecordId,
          xeroContactId: match.xeroContactId,
          xeroContactName: match.xeroContactName,
          confidence: match.confidence
        })
      });
      if (!response.ok) throw new Error("Mapping decision request failed");
      const result = await response.json();
      setMappingStatuses((current) => ({ ...current, [match.matchId]: decision }));
      if (result.auditEntry) {
        setAuditEntries((current) => [result.auditEntry as AuditLogEntry, ...current].slice(0, 12));
      }
    } catch (caught) {
      persistStaticMappingDecision(match.matchId, decision);
      const auditEntry = staticMappingDecisionToAuditEntry(match, decision);
      setMappingStatuses((current) => ({ ...current, [match.matchId]: decision }));
      setAuditEntries((current) => [auditEntry, ...current].slice(0, 12));
      setApprovalStatus("Mapping decision saved in live demo mode.");
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

  function toggleProductivityTask(taskId: string) {
    setApprovalStatus(null);
    setSelectedProductivityTaskIds((current) =>
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]
    );
  }

  function toggleIntegrationCandidate(candidateId: string) {
    setApprovalStatus(null);
    setSelectedIntegrationCandidateIds((current) =>
      current.includes(candidateId)
        ? current.filter((id) => id !== candidateId)
        : [...current, candidateId]
    );
  }

  if (loading && !payload) {
    return (
      <main className="loadingShell">
        <RefreshCw className="spin" aria-hidden="true" />
        <span>Booting CashPilot</span>
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
  const activeProductivityTasks = payload.productivityTasks.filter((task) =>
    selectedProductivityTaskIds.includes(task.id)
  );
  const activeIntegrationCandidates = payload.integrationCandidates.filter((candidate) =>
    selectedIntegrationCandidateIds.includes(candidate.id)
  );
  const approvalCount =
    selectedActionIds.length +
    selectedOpportunityIds.length +
    selectedProductivityTaskIds.length +
    selectedIntegrationCandidateIds.length;
  const totalAvailableActions =
    payload.recommendedActions.length +
    payload.revenueOpportunities.length +
    payload.productivityTasks.length +
    payload.integrationCandidates.length;
  const optionalBacklogCount = Math.max(0, totalAvailableActions - approvalCount);
  const selectedPlanCashImpact = activeActions.reduce((sum, action) => sum + action.cashImpactBeforeCrunch, 0);
  const selectedPlanRevenueImpact = activeOpportunities.reduce(
    (sum, opportunity) => sum + opportunity.expectedRevenueImpact,
    0
  );
  const heroDecision = payload.baseline.summary.firstThresholdBreachDate
    ? `Cash crunch on ${breachDate}. Approve ${approvalCount} selected action${
        approvalCount === 1 ? "" : "s"
      } to protect ${money(selectedPlanCashImpact || minimumCashImprovement)} and unlock ${money(
        payload.revenueGrowth.totalExpectedRevenue
      )} revenue upside.`
    : `No immediate breach. Approve ${approvalCount} selected action${
        approvalCount === 1 ? "" : "s"
      } to convert ${money(selectedPlanRevenueImpact || payload.revenueGrowth.totalExpectedRevenue)} of growth upside.`;
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
            <strong>CashPilot</strong>
            <span>Xero revenue agent</span>
          </div>
        </div>

        <nav className="railSection railNav" aria-label="Dashboard sections">
          <span className="railLabel">Sections</span>
          {navSections.map((section) => (
            <button
              key={section.id}
              className={`railNavLink ${activeSection === section.id ? "active" : ""}`}
              type="button"
              onClick={() => jumpToSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>

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
          {xeroStatus?.authenticated ? (
            <div className="connectReady">
              <Check size={16} aria-hidden="true" />
              <span>{xeroStatus.tenantName ?? "Xero connected"}</span>
            </div>
          ) : xeroStatus?.configured ? (
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
              AI revenue and cashflow agent for Xero
            </div>
            <h1>
              CashPilot <em>agent</em>
            </h1>
            <p>{payload.snapshot.organisationName} · Xero, messy CRM/e-commerce data, forecast risk, and approved actions</p>
            <div className="heroDecision">
              <strong>{heroDecision}</strong>
              <span>
                Agent preselected the highest-impact plan; {optionalBacklogCount} optional action
                {optionalBacklogCount === 1 ? "" : "s"} remain in the backlog.
              </span>
            </div>
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
              <button className="ghostButton" type="button" onClick={resetDemoState}>
                <RotateCcw size={16} aria-hidden="true" />
                Reset demo
              </button>
              <button
                className="ghostButton rejectButton"
                type="button"
                onClick={() => submitDecision("reject")}
                disabled={approvalCount === 0 || approving}
              >
                <AlertTriangle size={16} aria-hidden="true" />
                Reject {approvalCount}
              </button>
              <button
                className="primaryButton"
                type="button"
                onClick={() => submitDecision("approve")}
                disabled={approvalCount === 0 || approving}
              >
                <Check size={16} aria-hidden="true" />
                {approving ? "Queuing..." : `Approve ${approvalCount}`}
              </button>
            </div>
          </div>
        </header>

        <section className="signalBand" id="overview">
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
            value={money(selectedPlanCashImpact || minimumCashImprovement)}
            helper={`${activeActions.length} cash-flow actions selected`}
            tone="neutral"
          />
          <MetricTile
            icon={<ArrowUpRight size={18} aria-hidden="true" />}
            label="Growth actions"
            value={String(activeOpportunities.length)}
            helper={`${money(
              activeOpportunities.reduce((sum, opportunity) => sum + opportunity.expectedCashFlowImpact, 0)
            )} selected cash-flow lift`}
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

        <section className="approvalSummaryPanel" id="approvals">
          <div className="panelHeader compact">
            <div>
              <span className="sectionLabel">Pending approval</span>
              <h2>
                {approvalCount} preselected action(s) ready for approval; {optionalBacklogCount} optional backlog item(s)
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
                    <ApprovalCashItem
                      key={action.id}
                      action={action}
                      onEvidence={() => setEvidenceDrawer(buildCashEvidence(action))}
                      onToggle={() => toggleAction(action.id)}
                    />
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
                      onEvidence={() => setEvidenceDrawer(buildRevenueEvidence(opportunity))}
                      onToggle={() => toggleOpportunity(opportunity.id)}
                    />
                  ))
                ) : (
                  <EmptyApprovalState label="No growth actions selected" />
                )}
              </div>
            </div>

            <div className="approvalGroup">
              <div className="approvalGroupHeader">
                <strong>Productivity automations</strong>
                <span>{formatDuration(activeProductivityTasks.reduce((sum, task) => sum + task.timeSavedMinutes, 0))}</span>
              </div>
              <div className="approvalList">
                {activeProductivityTasks.length > 0 ? (
                  activeProductivityTasks.map((task) => (
                    <ApprovalProductivityItem
                      key={task.id}
                      task={task}
                      onEvidence={() => setEvidenceDrawer(buildProductivityEvidence(task))}
                      onToggle={() => toggleProductivityTask(task.id)}
                    />
                  ))
                ) : (
                  <EmptyApprovalState label="No productivity automations selected" />
                )}
              </div>
            </div>

            <div className="approvalGroup">
              <div className="approvalGroupHeader">
                <strong>Adaptive integrations</strong>
                <span>{money(activeIntegrationCandidates.reduce((sum, candidate) => sum + candidate.expectedValue, 0))}</span>
              </div>
              <div className="approvalList">
                {activeIntegrationCandidates.length > 0 ? (
                  activeIntegrationCandidates.map((candidate) => (
                    <ApprovalIntegrationItem
                      key={candidate.id}
                      candidate={candidate}
                      onEvidence={() => setEvidenceDrawer(buildIntegrationEvidence(candidate))}
                      onToggle={() => toggleIntegrationCandidate(candidate.id)}
                    />
                  ))
                ) : (
                  <EmptyApprovalState label="No integration syncs selected" />
                )}
              </div>
            </div>
          </div>
        </section>

        <QueuedWritebackPanel writebacks={payload.queuedWritebacks} />

        <SmartMappingReviewPanel
          matches={payload.entityMatches}
          statuses={mappingStatuses}
          summary={payload.smartMappingSummary}
          onDecide={decideMapping}
        />

        <section className="ownerPanel" id="priorities">
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

        <ProductivityPowerhousePanel
          selectedIds={selectedProductivityTaskIds}
          summary={payload.productivitySummary}
          tasks={payload.productivityTasks}
          onEvidence={(task) => setEvidenceDrawer(buildProductivityEvidence(task))}
          onToggle={toggleProductivityTask}
        />

        <AdaptiveIntegrationHubPanel
          candidates={payload.integrationCandidates}
          selectedIds={selectedIntegrationCandidateIds}
          summary={payload.integrationSummary}
          onEvidence={(candidate) => setEvidenceDrawer(buildIntegrationEvidence(candidate))}
          onToggle={toggleIntegrationCandidate}
        />

        <section className="mainGrid" id="forecast">
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
                <ComposedChart data={chartData} margin={{ top: 12, right: 16, bottom: 12, left: 0 }}>
                  <CartesianGrid stroke="#dce5e2" strokeDasharray="4 4" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#6b7a75", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={22}
                  />
                  <YAxis
                    tickFormatter={(value) => `£${Math.round(Number(value) / 1000)}k`}
                    tick={{ fill: "#6b7a75", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={54}
                  />
                  <Tooltip
                    formatter={(value) =>
                      Array.isArray(value)
                        ? `${money(Number(value[0]))} to ${money(Number(value[1]))}`
                        : money(Number(value))
                    }
                    labelFormatter={(_, rows) => rows?.[0]?.payload?.fullDate ?? ""}
                    contentStyle={{
                      background: "#0c1024",
                      border: "1px solid #252d55",
                      borderRadius: 8,
                      color: "#eef2ff"
                    }}
                    labelStyle={{ color: "#9aa4c7" }}
                  />
                  <ReferenceLine
                    y={payload.snapshot.safeCashThreshold}
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
                  <Area
                    name="Simulated range (p10-p90)"
                    dataKey="simulationRange"
                    stroke="none"
                    fill="#8e8cff"
                    fillOpacity={0.14}
                    isAnimationActive={false}
                  />
                  <Line type="monotone" name="Before actions" dataKey="before" stroke="#ff4d6d" strokeWidth={3} dot={false} />
                  <Line type="monotone" name="After actions" dataKey="after" stroke="#6d6cff" strokeWidth={3} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="chartLegend" aria-label="Forecast chart legend">
              <span className="range">Simulated range</span>
              <span className="before">Before actions</span>
              <span className="after">After actions</span>
              <span className="threshold">Safe threshold</span>
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

        <ForecastIntelligencePanel
          afterActions={payload.afterActions}
          baseline={payload.baseline}
          intelligence={payload.forecastIntelligence}
          threshold={payload.snapshot.safeCashThreshold}
        />

        <section className="pipelineGrid" id="xero">
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

        <AgentTracePanel payload={payload} />

        <section className="growthPanel" id="opportunities">
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
                onEvidence={() => setEvidenceDrawer(buildRevenueEvidence(opportunity))}
                onToggle={() => toggleOpportunity(opportunity.id)}
              />
            ))}
          </div>
        </section>

        <section className="actionsPanel" id="actions">
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
                onEvidence={() => setEvidenceDrawer(buildCashEvidence(action))}
                onToggle={() => toggleAction(action.id)}
              />
            ))}
          </div>
        </section>

        <section className="messagePanel" id="messages">
          <div className="panelHeader compact">
            <div>
              <span className="sectionLabel">Human approval queue</span>
              <h2>Agent-drafted communications — edit before approving</h2>
            </div>
            <Mail size={20} aria-hidden="true" />
          </div>
          <div className="messageGrid">
            {payload.revenueOpportunities.slice(0, 3).map((opportunity) => (
              <EditableMessageCard
                key={opportunity.id}
                className="growthMessage"
                draft={editedMessages[opportunity.id] ?? opportunity.messageDraft}
                edited={editedMessages[opportunity.id] !== undefined}
                metaLeft={opportunity.contactName ?? opportunity.serviceCategory ?? "Internal growth action"}
                metaRight={opportunity.type.replaceAll("_", " ")}
                onEdit={(value) =>
                  setEditedMessages((current) =>
                    value === opportunity.messageDraft
                      ? removeKey(current, opportunity.id)
                      : { ...current, [opportunity.id]: value }
                  )
                }
              />
            ))}
            {payload.recommendedActions.map((action) => (
              <EditableMessageCard
                key={action.id}
                draft={editedMessages[action.id] ?? action.messageDraft}
                edited={editedMessages[action.id] !== undefined}
                metaLeft={action.contactName}
                metaRight={action.invoiceNumber}
                onEdit={(value) =>
                  setEditedMessages((current) =>
                    value === action.messageDraft ? removeKey(current, action.id) : { ...current, [action.id]: value }
                  )
                }
              />
            ))}
          </div>
        </section>

        <AuditLogPanel entries={auditEntries} />
      </section>

      {approvalCount > 0 || approvalStatus ? (
        <div className="approvalDock" role="status">
          <div className="dockSummary">
            <FileClock size={16} aria-hidden="true" />
            {approvalStatus ? (
              <span className="dockStatus">{approvalStatus}</span>
            ) : (
              <span>
                <strong>{approvalCount}</strong> action{approvalCount === 1 ? "" : "s"} pending your decision
                {Object.keys(editedMessages).length > 0
                  ? ` · ${Object.keys(editedMessages).length} draft(s) edited`
                  : ""}
              </span>
            )}
          </div>
          {approvalCount > 0 ? (
            <div className="dockButtons">
              <button
                className="ghostButton rejectButton"
                type="button"
                onClick={() => submitDecision("reject")}
                disabled={approving}
              >
                Reject
              </button>
              <button
                className="primaryButton"
                type="button"
                onClick={() => submitDecision("approve")}
                disabled={approving}
              >
                <Check size={15} aria-hidden="true" />
                {approving ? "Queuing..." : "Approve"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {evidenceDrawer ? (
        <EvidenceDrawer data={evidenceDrawer} onClose={() => setEvidenceDrawer(null)} />
      ) : null}
    </main>
  );
}

function QueuedWritebackPanel({ writebacks }: { writebacks: QueuedWritebackPreview[] }) {
  return (
    <section className="writebackPanel" id="writebacks">
      <div className="panelHeader compact">
        <div>
          <span className="sectionLabel">Human-approved writeback queue</span>
          <h2>
            {writebacks.length > 0
              ? `${writebacks.length} Xero writeback preview(s) queued`
              : "No approved Xero writebacks queued yet"}
          </h2>
        </div>
        <FileJson size={20} aria-hidden="true" />
      </div>
      {writebacks.length > 0 ? (
        <div className="writebackGrid">
          {writebacks.map((writeback) => (
            <article key={`${writeback.id}-${writeback.endpoint}`} className="writebackCard">
              <div className="writebackTop">
                <strong>{writeback.title}</strong>
                <span>{writeback.group}</span>
              </div>
              <div className="writebackEndpoint">
                <code>{writeback.method}</code>
                <span>{writeback.endpoint}</span>
              </div>
              <p>{writeback.object}</p>
              <pre>{JSON.stringify(writeback.payload, null, 2)}</pre>
              <em>{writeback.humanGate}</em>
            </article>
          ))}
        </div>
      ) : (
        <div className="writebackEmpty">
          <ListChecks size={18} aria-hidden="true" />
          <span>Approve the selected plan to show draft Xero payloads here. Nothing is written without review.</span>
        </div>
      )}
    </section>
  );
}

function AgentTracePanel({ payload }: { payload: DashboardPayload }) {
  return (
    <section className="agentTracePanel" id="agent-trace">
      <div className="panelHeader compact">
        <div>
          <span className="sectionLabel">Agent trace</span>
          <h2>Specialists explain, rank, and draft; deterministic code calculates the numbers</h2>
        </div>
        <Workflow size={20} aria-hidden="true" />
      </div>
      <div className="traceHint">{payload.agentLayer.traceHint}</div>
      <div className="traceGrid">
        {payload.agentLayer.traceSteps.map((step) => (
          <article key={step.id} className={`traceCard ${step.status}`}>
            <div className="traceTop">
              <strong>{step.agentName}</strong>
              <span>{step.status}</span>
            </div>
            <dl>
              <div>
                <dt>Input</dt>
                <dd>{step.input}</dd>
              </div>
              <div>
                <dt>Reasoning</dt>
                <dd>{step.reasoning}</dd>
              </div>
              <div>
                <dt>Output</dt>
                <dd>{step.output}</dd>
              </div>
            </dl>
            <div className="driverEvidence">
              {step.xeroEvidence.map((item) => (
                <span key={`${step.id}-${item}`}>{item}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function EvidenceDrawer({ data, onClose }: { data: EvidenceDrawerData; onClose: () => void }) {
  return (
    <div className="drawerOverlay" role="dialog" aria-modal="true" aria-label={`${data.title} Xero evidence`}>
      <aside className="evidenceDrawer">
        <div className="drawerHeader">
          <div>
            <span className="sectionLabel">{data.family}</span>
            <h2>{data.title}</h2>
          </div>
          <button className="iconButton" type="button" onClick={onClose} aria-label="Close evidence drawer">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="drawerSummary">{data.summary}</p>
        <div className="drawerSection">
          <strong>Xero source records</strong>
          <div className="approvalEvidence">
            {data.records.map((record) => (
              <strong key={record}>{record}</strong>
            ))}
          </div>
        </div>
        <div className="drawerSection">
          <strong>API endpoints used</strong>
          <div className="endpointGrid compactEndpoints">
            {data.endpoints.map((endpoint) => (
              <span key={endpoint}>{endpoint}</span>
            ))}
          </div>
        </div>
        <div className="drawerSection">
          <strong>Fields inspected</strong>
          <div className="pillGrid">
            {data.fields.map((field) => (
              <span key={field}>{field}</span>
            ))}
          </div>
        </div>
        <div className="drawerSection">
          <strong>Human-approved writeback preview</strong>
          <div className="writebackEndpoint">
            <code>{data.writeback.method}</code>
            <span>{data.writeback.endpoint}</span>
          </div>
          <pre>{JSON.stringify(data.writeback.payload, null, 2)}</pre>
          <em>{data.humanControl}</em>
        </div>
      </aside>
    </div>
  );
}

function SmartMappingReviewPanel({
  summary,
  matches,
  statuses,
  onDecide
}: {
  summary: DashboardPayload["smartMappingSummary"];
  matches: EntityMatch[];
  statuses: Record<string, EntityMatch["matchStatus"]>;
  onDecide: (match: EntityMatch, decision: "APPROVED" | "REJECTED" | "NEEDS_NEW_CONTACT") => void;
}) {
  const pendingReview = matches.filter((match) => (statuses[match.matchId] ?? match.matchStatus) === "PENDING_REVIEW").length;

  return (
    <section className="bountyPanel mappingPanel" id="mapping">
      <div className="panelHeader compact">
        <div>
          <span className="sectionLabel">Smart Mapping Review</span>
          <h2>Messy external records matched to Xero contacts with evidence</h2>
        </div>
        <Link2 size={20} aria-hidden="true" />
      </div>

      <div className="bountySummaryGrid">
        <Stat label="Matches" value={String(summary.totalMatches)} />
        <Stat label="High confidence" value={String(summary.highConfidenceMatches)} />
        <Stat label="Needs review" value={String(pendingReview)} />
        <Stat label="Best match" value={summary.bestMatch ?? "None"} />
      </div>

      <div className="mappingGrid">
        {matches.slice(0, 6).map((match) => {
          const status = statuses[match.matchId] ?? match.matchStatus;
          return (
            <article key={match.matchId} className={`mappingCard ${match.confidence >= 0.86 ? "high" : "medium"}`}>
              <div className="mappingTop">
                <div>
                  <strong>{match.externalName}</strong>
                  <span>
                    {match.sourceSystem} · {match.externalRecordType} · {money(match.externalAmount)}
                  </span>
                </div>
                <em>{percent(match.confidence)}</em>
              </div>
              <div className="mappingArrow">
                <span>{match.externalTitle}</span>
                <strong>{match.xeroContactName ?? "Needs new Xero contact"}</strong>
              </div>
              <div className="driverEvidence">
                {match.evidence.map((item) => (
                  <span key={`${match.matchId}-${item}`}>{item}</span>
                ))}
              </div>
              {status === "PENDING_REVIEW" ? (
                <div className="mappingActions">
                  <button type="button" onClick={() => onDecide(match, "APPROVED")}>
                    Approve match
                  </button>
                  <button type="button" onClick={() => onDecide(match, "REJECTED")}>
                    Reject
                  </button>
                  <button type="button" onClick={() => onDecide(match, "NEEDS_NEW_CONTACT")}>
                    New contact
                  </button>
                </div>
              ) : (
                <div className={`mappingDecision ${status.toLowerCase()}`}>
                  <Check size={14} aria-hidden="true" />
                  <span>
                    {status === "APPROVED"
                      ? "Match approved and logged to the audit trail"
                      : status === "REJECTED"
                        ? "Match rejected and logged to the audit trail"
                        : "Queued for a new Xero contact draft"}
                  </span>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ForecastIntelligencePanel({
  afterActions,
  baseline,
  threshold,
  intelligence
}: {
  afterActions: DashboardPayload["afterActions"];
  baseline: DashboardPayload["baseline"];
  threshold: number;
  intelligence: DashboardPayload["forecastIntelligence"];
}) {
  return (
    <section className="forecastIntelPanel" id="intelligence">
      <div className="panelHeader compact">
        <div>
          <span className="sectionLabel">Forecast intelligence</span>
          <h2>Business factors driving the cash forecast</h2>
        </div>
        <TrendingUp size={20} aria-hidden="true" />
      </div>
      <p className="intelSummary">{intelligence.explainabilitySummary}</p>

      <div className="decisionCalloutGrid">
        {intelligence.decisionCallouts.map((callout) => (
          <article key={callout.id} className="decisionCallout">
            <strong>{callout.title}</strong>
            <p>{callout.answer}</p>
            <div className="driverEvidence">
              {callout.evidence.map((item) => (
                <span key={`${callout.id}-${item}`}>{item}</span>
              ))}
            </div>
            <em>{callout.businessDecision}</em>
          </article>
        ))}
      </div>

      <div className="timeSeriesGrid">
        {intelligence.timeSeriesDiagnostics.map((diagnostic) => (
          <article key={diagnostic.id} className="timeSeriesCard">
            <span>{diagnostic.label}</span>
            <strong>{diagnostic.value}</strong>
            <p>{diagnostic.detail}</p>
            <em>{diagnostic.method}</em>
          </article>
        ))}
      </div>

      <ForecastRiskScene
        afterActions={afterActions}
        baseline={baseline}
        drivers={intelligence.cashDrivers}
        threshold={threshold}
      />

      <div className="intelGrid">
        <div className="modelPanel">
          <div className="subPanelHeader">
            <strong>Models running</strong>
            <span>{intelligence.models.length} model layers</span>
          </div>
          <div className="modelList">
            {intelligence.models.map((model) => (
              <article key={model.id} className="modelCard">
                <div className="modelTop">
                  <strong>{model.name}</strong>
                  <span>{model.type.replaceAll("_", " ")}</span>
                </div>
                <p>{model.purpose}</p>
                <div className="modelInputs">
                  {model.xeroInputs.map((input) => (
                    <span key={`${model.id}-${input}`}>{input}</span>
                  ))}
                </div>
                <div className="modelOutput">
                  <span>{model.method}</span>
                  <strong>{model.output}</strong>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="driverPanel">
          <div className="subPanelHeader">
            <strong>Cash drivers</strong>
            <span>Risk: {intelligence.biggestRisk}</span>
          </div>
          <div className="driverList">
            {intelligence.cashDrivers.map((driver) => (
              <article key={driver.id} className={`driverCard ${driver.direction}`}>
                <div className="driverTop">
                  <div>
                    <strong>{driver.label}</strong>
                    <span>{driver.direction}</span>
                  </div>
                  <strong>{driver.impactLabel}</strong>
                </div>
                <p>{driver.explanation}</p>
                <div className="driverEvidence">
                  {driver.evidence.map((item) => (
                    <span key={`${driver.id}-${item}`}>{item}</span>
                  ))}
                </div>
                <div className="driverSensitivity">{driver.sensitivity}</div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function AuditLogPanel({ entries }: { entries: AuditLogEntry[] }) {
  return (
    <section className="bountyPanel auditPanel" id="audit">
      <div className="panelHeader compact">
        <div>
          <span className="sectionLabel">Audit Log</span>
          <h2>Every recommendation keeps source record traceability</h2>
        </div>
        <ShieldCheck size={20} aria-hidden="true" />
      </div>
      <div className="auditList">
        {entries.map((entry) => (
          <article key={entry.auditId} className="auditItem">
            <div>
              <strong>{entry.eventType.replaceAll("_", " ")}</strong>
              <span>{new Date(entry.createdAt).toLocaleString("en-GB")}</span>
            </div>
            <div className="approvalEvidence">
              {entry.sourceRecordIds.map((id) => (
                <strong key={`${entry.auditId}-${id}`}>{id}</strong>
              ))}
            </div>
            <p>
              {String(entry.payload.previousStatus ?? "PENDING")}
              {" -> "}
              {String(entry.payload.newStatus ?? "RECORDED")}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductivityPowerhousePanel({
  summary,
  tasks,
  selectedIds,
  onEvidence,
  onToggle
}: {
  summary: DashboardPayload["productivitySummary"];
  tasks: ProductivityAutomationTask[];
  selectedIds: string[];
  onEvidence: (task: ProductivityAutomationTask) => void;
  onToggle: (taskId: string) => void;
}) {
  return (
    <section className="bountyPanel productivityPanel" id="productivity">
      <div className="panelHeader compact">
        <div>
          <span className="sectionLabel">Bounty 01 · Productivity Powerhouse</span>
          <h2>Automates messy finance admin with Xero as the workflow centre</h2>
        </div>
        <Workflow size={20} aria-hidden="true" />
      </div>

      <div className="bountySummaryGrid">
        <Stat label="Tasks found" value={String(summary.tasksDetected)} />
        <Stat label="Auto-resolvable" value={String(summary.autoResolvableTasks)} />
        <Stat label="Needs review" value={String(summary.exceptionTasks)} />
        <Stat label="Time saved" value={formatDuration(summary.estimatedMinutesSaved)} />
      </div>

      <div className="bountySubhead">
        <strong>{summary.highestImpactTask ?? "No task detected"}</strong>
        <span>{summary.xeroTouchpoints.join(" · ")}</span>
      </div>

      <div className="automationGrid">
        {tasks.map((task) => (
          <article key={task.id} className={`automationCard ${task.confidence}`}>
            <div className="automationTop">
              <label className="actionSelector">
                <input type="checkbox" checked={selectedIds.includes(task.id)} onChange={() => onToggle(task.id)} />
                <span>{task.title}</span>
              </label>
              <strong>{percent(task.confidenceScore)}</strong>
            </div>
            <div className="automationWorkflow">
              <span>{task.workflow}</span>
              <strong>{task.xeroTarget}</strong>
            </div>
            <p>{task.businessImpact}</p>
            <div className="messySignalList">
              {task.messySignals.slice(0, 3).map((signal) => (
                <span key={`${task.id}-${signal}`}>{signal}</span>
              ))}
            </div>
            <div className="automationSteps">
              {task.automationSteps.slice(0, 4).map((step, index) => (
                <div key={`${task.id}-${step}`}>
                  <span>{index + 1}</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
            <div className="approvalPreview">
              <strong>{formatDuration(task.timeSavedMinutes)} saved</strong>
              <span>{task.recommendedAction}</span>
            </div>
            <button className="evidenceButton" type="button" onClick={() => onEvidence(task)}>
              <Eye size={14} aria-hidden="true" />
              Xero evidence and writeback
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function AdaptiveIntegrationHubPanel({
  summary,
  candidates,
  selectedIds,
  onEvidence,
  onToggle
}: {
  summary: DashboardPayload["integrationSummary"];
  candidates: AdaptiveIntegrationCandidate[];
  selectedIds: string[];
  onEvidence: (candidate: AdaptiveIntegrationCandidate) => void;
  onToggle: (candidateId: string) => void;
}) {
  return (
    <section className="bountyPanel integrationPanel" id="integrations">
      <div className="panelHeader compact">
        <div>
          <span className="sectionLabel">Bounty 02 · Vibe Integrator</span>
          <h2>AI-powered universal translator between messy business tools and Xero</h2>
        </div>
        <Link2 size={20} aria-hidden="true" />
      </div>

      <div className="bountySummaryGrid">
        <Stat label="Source systems" value={String(summary.sourceSystems.length)} />
        <Stat label="Sync candidates" value={String(summary.candidatesDetected)} />
        <Stat label="Ready to sync" value={String(summary.readyToSync)} />
        <Stat label="Mapped value" value={money(summary.totalMappedValue)} />
      </div>

      <div className="bountySubhead">
        <strong>{summary.topSyncAction ?? "No sync action detected"}</strong>
        <span>{summary.sourceSystems.join(" · ")}</span>
      </div>

      <div className="integrationGrid">
        {candidates.map((candidate) => (
          <article key={candidate.id} className={`integrationCard ${candidate.confidence}`}>
            <div className="integrationTop">
              <label className="actionSelector">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(candidate.id)}
                  onChange={() => onToggle(candidate.id)}
                />
                <span>{candidate.title}</span>
              </label>
              <div className="sourceBadge">{candidate.sourceSystem}</div>
            </div>
            <div className="rawSignal">{candidate.rawSignal}</div>
            <div className="mappingTarget">
              <span>{humanizeIdentifier(candidate.mappedXeroObject)}</span>
              <strong>{candidate.targetXeroRecord}</strong>
              <em>{percent(candidate.confidenceScore)} confidence</em>
            </div>
            <div className="fieldMapGrid">
              {candidate.fieldMappings.slice(0, 4).map((mapping) => (
                <div key={`${candidate.id}-${mapping.sourceField}`}>
                  <span>{mapping.sourceField}</span>
                  <strong>{mapping.xeroField}</strong>
                  <p>
                    {mapping.sourceValue}
                    {" -> "}
                    {mapping.mappedValue}
                  </p>
                </div>
              ))}
            </div>
            <div className="resilienceList">
              {candidate.resilienceNotes.slice(0, 3).map((note) => (
                <span key={`${candidate.id}-${note}`}>{note}</span>
              ))}
            </div>
            <div className="approvalPreview">
              <strong>{candidate.missingFields.length > 0 ? "Review required" : "Ready to sync"}</strong>
              <span>{candidate.syncAction}</span>
            </div>
            <button className="evidenceButton" type="button" onClick={() => onEvidence(candidate)}>
              <Eye size={14} aria-hidden="true" />
              Xero evidence and writeback
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function EditableMessageCard({
  className = "",
  draft,
  edited,
  metaLeft,
  metaRight,
  onEdit
}: {
  className?: string;
  draft: string;
  edited: boolean;
  metaLeft: string;
  metaRight: string;
  onEdit: (value: string) => void;
}) {
  return (
    <article className={`messageCard ${className}`}>
      <div className="messageMeta">
        <span>{metaLeft}</span>
        <span>{edited ? `${metaRight} · edited` : metaRight}</span>
      </div>
      <textarea
        aria-label={`Draft message for ${metaLeft}`}
        className="messageEditor"
        rows={5}
        value={draft}
        onChange={(event) => onEdit(event.target.value)}
      />
    </article>
  );
}

function removeKey(record: Record<string, string>, key: string): Record<string, string> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

function removeKeys(record: Record<string, string>, keys: Set<string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.has(key)));
}

async function loadStaticDashboardPayload(): Promise<DashboardPayload> {
  const response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}demo-dashboard.json`, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load packaged demo dashboard");
  return (await response.json()) as DashboardPayload;
}

function applyStaticDashboardState(dashboard: DashboardPayload): DashboardPayload {
  const decisions = readStaticDecisions();
  const decidedIds = new Set(decisions.map((decision) => decision.id));
  const approvedWritebacks = decisions
    .filter((decision) => decision.decision === "APPROVED" && decision.writeback)
    .map((decision) => decision.writeback as QueuedWritebackPreview);
  const mappingDecisions = readStaticMappingDecisions();
  const entityMatches = dashboard.entityMatches.map((match) =>
    mappingDecisions[match.matchId] ? { ...match, matchStatus: mappingDecisions[match.matchId] } : match
  );
  const pendingReview = entityMatches.filter((match) => match.matchStatus === "PENDING_REVIEW").length;

  return removeDecidedItemsFromPayload(
    {
      ...dashboard,
      source: "seeded-demo",
      generatedAt: new Date().toISOString(),
      entityMatches,
      smartMappingSummary: {
        ...dashboard.smartMappingSummary,
        needsReview: pendingReview
      },
      auditLog: [...decisions.map(staticDecisionToAuditEntry), ...dashboard.auditLog].slice(0, 12),
      queuedWritebacks: [...approvedWritebacks, ...dashboard.queuedWritebacks].slice(0, 12),
      xero: {
        ...dashboard.xero,
        note: "Packaged Xero demo data is running in the browser for the public live demo."
      }
    },
    decidedIds
  );
}

function removeDecidedItemsFromPayload(payload: DashboardPayload, decidedIds: Set<string>): DashboardPayload {
  return {
    ...payload,
    recommendedActions: payload.recommendedActions.filter((action) => !decidedIds.has(action.id)),
    revenueOpportunities: payload.revenueOpportunities.filter((opportunity) => !decidedIds.has(opportunity.id)),
    productivityTasks: payload.productivityTasks.filter((task) => !decidedIds.has(task.id)),
    integrationCandidates: payload.integrationCandidates.filter((candidate) => !decidedIds.has(candidate.id))
  };
}

function persistStaticDecision({
  decision,
  editedMessages,
  selection,
  writebacks
}: {
  decision: StaticDecision;
  editedMessages: Record<string, string>;
  selection: ApprovalSelection;
  writebacks: QueuedWritebackPreview[];
}): StaticDecisionRecord[] {
  const createdAt = new Date().toISOString();
  const writebacksById = new Map(writebacks.map((writeback) => [writeback.id, writeback]));
  const records: StaticDecisionRecord[] = [
    ...selection.cashActionIds.map((id) => ({
      id,
      group: "cash" as const,
      decision,
      editedMessage: editedMessages[id],
      writeback: writebacksById.get(id),
      createdAt
    })),
    ...selection.revenueOpportunityIds.map((id) => ({
      id,
      group: "revenue" as const,
      decision,
      editedMessage: editedMessages[id],
      writeback: writebacksById.get(id),
      createdAt
    })),
    ...selection.productivityTaskIds.map((id) => ({
      id,
      group: "productivity" as const,
      decision,
      writeback: writebacksById.get(id),
      createdAt
    })),
    ...selection.integrationCandidateIds.map((id) => ({
      id,
      group: "integration" as const,
      decision,
      writeback: writebacksById.get(id),
      createdAt
    }))
  ];

  writeStaticDecisions(records);
  return records;
}

function readStaticDecisions(): StaticDecisionRecord[] {
  try {
    const raw = window.localStorage.getItem(staticDecisionStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StaticDecisionRecord[]) : [];
  } catch {
    return [];
  }
}

function writeStaticDecisions(records: StaticDecisionRecord[]) {
  try {
    const current = readStaticDecisions();
    const next = new Map(current.map((record) => [record.id, record]));
    records.forEach((record) => next.set(record.id, record));
    window.localStorage.setItem(staticDecisionStorageKey, JSON.stringify([...next.values()]));
  } catch {
    // Local storage can be blocked in private browsing; the in-memory UI still updates.
  }
}

function persistStaticMappingDecision(matchId: string, decision: EntityMatch["matchStatus"]) {
  try {
    window.localStorage.setItem(
      staticMappingStorageKey,
      JSON.stringify({
        ...readStaticMappingDecisions(),
        [matchId]: decision
      })
    );
  } catch {
    // The visible UI state is still updated when browser persistence is unavailable.
  }
}

function readStaticMappingDecisions(): Record<string, EntityMatch["matchStatus"]> {
  try {
    const raw = window.localStorage.getItem(staticMappingStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, EntityMatch["matchStatus"]>) : {};
  } catch {
    return {};
  }
}

function clearStaticDemoState() {
  try {
    window.localStorage.removeItem(staticDecisionStorageKey);
    window.localStorage.removeItem(staticMappingStorageKey);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

function staticDecisionToAuditEntry(record: StaticDecisionRecord): AuditLogEntry {
  return {
    auditId: `audit-static-${record.group}-${record.decision.toLowerCase()}-${record.id}`,
    eventType: `${record.group.toUpperCase()}_${record.decision}`,
    sourceRecordIds: record.writeback
      ? [record.writeback.id, record.writeback.endpoint]
      : [record.id, "packaged-xero-demo"],
    payload: {
      recommendationId: record.id,
      source: "github-pages-demo",
      decision: record.decision,
      previousStatus: "PENDING",
      newStatus: record.decision,
      editedMessage: record.editedMessage ?? null,
      reviewedExecution: record.decision !== "REJECTED"
    },
    createdAt: record.createdAt
  };
}

function staticMappingDecisionToAuditEntry(
  match: EntityMatch,
  decision: "APPROVED" | "REJECTED" | "NEEDS_NEW_CONTACT"
): AuditLogEntry {
  return {
    auditId: `audit-static-mapping-${match.matchId}-${Date.now()}`,
    eventType: `SMART_MAPPING_${decision}`,
    sourceRecordIds: [match.externalRecordId, match.xeroContactId].filter((value): value is string => Boolean(value)),
    payload: {
      matchId: match.matchId,
      decision,
      previousStatus: "PENDING_REVIEW",
      newStatus: decision,
      xeroContactName: match.xeroContactName ?? null,
      confidence: match.confidence
    },
    createdAt: new Date().toISOString()
  };
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

function ApprovalCashItem({
  action,
  onEvidence,
  onToggle
}: {
  action: CashAction;
  onEvidence: () => void;
  onToggle: () => void;
}) {
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
      <button className="evidenceButton" type="button" onClick={onEvidence}>
        <Eye size={14} aria-hidden="true" />
        Xero evidence
      </button>
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
  onEvidence,
  onToggle
}: {
  opportunity: RevenueOpportunity;
  onEvidence: () => void;
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
      <button className="evidenceButton" type="button" onClick={onEvidence}>
        <Eye size={14} aria-hidden="true" />
        Xero evidence
      </button>
      <ApprovalPlan plan={opportunity.approvalPlan} />
    </article>
  );
}

function ApprovalProductivityItem({
  task,
  onEvidence,
  onToggle
}: {
  task: ProductivityAutomationTask;
  onEvidence: () => void;
  onToggle: () => void;
}) {
  return (
    <article className="approvalItem productivity">
      <label className="approvalSelector">
        <input type="checkbox" checked onChange={onToggle} />
        <span>{task.title}</span>
      </label>
      <div className="approvalMeta">
        <span>{task.sourceRecord}</span>
        <span>{task.type.replaceAll("_", " ")}</span>
        <strong>{formatDuration(task.timeSavedMinutes)}</strong>
      </div>
      <p>{task.recommendedAction}</p>
      <button className="evidenceButton" type="button" onClick={onEvidence}>
        <Eye size={14} aria-hidden="true" />
        Xero evidence
      </button>
      <ApprovalPlan plan={task.approvalPlan} />
    </article>
  );
}

function ApprovalIntegrationItem({
  candidate,
  onEvidence,
  onToggle
}: {
  candidate: AdaptiveIntegrationCandidate;
  onEvidence: () => void;
  onToggle: () => void;
}) {
  return (
    <article className="approvalItem integration">
      <label className="approvalSelector">
        <input type="checkbox" checked onChange={onToggle} />
        <span>{candidate.title}</span>
      </label>
      <div className="approvalMeta">
        <span>{candidate.sourceSystem}</span>
        <span>{humanizeIdentifier(candidate.mappedXeroObject)}</span>
        <strong>{money(candidate.expectedValue)}</strong>
      </div>
      <p>{candidate.syncAction}</p>
      <button className="evidenceButton" type="button" onClick={onEvidence}>
        <Eye size={14} aria-hidden="true" />
        Xero evidence
      </button>
      <ApprovalPlan plan={candidate.approvalPlan} />
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

function buildDefaultApprovalSelection(dashboard: DashboardPayload): ApprovalSelection {
  const selection: ApprovalSelection = {
    cashActionIds: [],
    revenueOpportunityIds: [],
    productivityTaskIds: [],
    integrationCandidateIds: []
  };
  const targetCount = 5;
  const add = (group: keyof ApprovalSelection, id: string) => {
    if (approvalSelectionCount(selection) >= targetCount) return;
    if (!selection[group].includes(id)) selection[group] = [...selection[group], id];
  };

  dashboard.recommendedActions.slice(0, 3).forEach((action) => add("cashActionIds", action.id));
  dashboard.revenueOpportunities.slice(0, 1).forEach((opportunity) => add("revenueOpportunityIds", opportunity.id));
  dashboard.productivityTasks.slice(0, 1).forEach((task) => add("productivityTaskIds", task.id));

  const backlog = [
    ...dashboard.integrationCandidates.map((candidate) => ({
      group: "integrationCandidateIds" as const,
      id: candidate.id,
      score: candidate.expectedValue
    })),
    ...dashboard.revenueOpportunities.slice(1).map((opportunity) => ({
      group: "revenueOpportunityIds" as const,
      id: opportunity.id,
      score: opportunity.expectedRevenueImpact
    })),
    ...dashboard.productivityTasks.slice(1).map((task) => ({
      group: "productivityTaskIds" as const,
      id: task.id,
      score: task.timeSavedMinutes * 100
    }))
  ].sort((left, right) => right.score - left.score);

  backlog.forEach((item) => add(item.group, item.id));
  return selection;
}

function approvalSelectionCount(selection: ApprovalSelection) {
  return (
    selection.cashActionIds.length +
    selection.revenueOpportunityIds.length +
    selection.productivityTaskIds.length +
    selection.integrationCandidateIds.length
  );
}

function buildSelectedWritebacks(payload: DashboardPayload, selection: ApprovalSelection): QueuedWritebackPreview[] {
  return [
    ...payload.recommendedActions
      .filter((action) => selection.cashActionIds.includes(action.id))
      .map((action) => buildCashEvidence(action).writeback),
    ...payload.revenueOpportunities
      .filter((opportunity) => selection.revenueOpportunityIds.includes(opportunity.id))
      .map((opportunity) => buildRevenueEvidence(opportunity).writeback),
    ...payload.productivityTasks
      .filter((task) => selection.productivityTaskIds.includes(task.id))
      .map((task) => buildProductivityEvidence(task).writeback),
    ...payload.integrationCandidates
      .filter((candidate) => selection.integrationCandidateIds.includes(candidate.id))
      .map((candidate) => buildIntegrationEvidence(candidate).writeback)
  ];
}

function buildCashEvidence(action: CashAction): EvidenceDrawerData {
  const endpoint =
    action.type === "chase_invoice"
      ? `/Invoices/${action.invoiceId}/Email`
      : `/Invoices/${action.invoiceId}/History`;
  const object =
    action.type === "delay_supplier_payment"
      ? "Bill payment-plan note and supplier extension request"
      : action.type === "early_payment_incentive"
        ? "Invoice history note plus early-payment email draft"
        : "Invoice follow-up email draft";
  const writeback: QueuedWritebackPreview = {
    id: action.id,
    title: action.title,
    group: "cash",
    method: "POST",
    endpoint,
    object,
    payload: {
      invoiceId: action.invoiceId,
      invoiceNumber: action.invoiceNumber,
      contactId: action.contactId,
      contactName: action.contactName,
      actionType: action.type,
      amount: action.amount,
      expectedCashDate: action.expectedCashDate,
      messageDraft: action.messageDraft,
      safeWriteMode: "queued_for_owner_review"
    },
    humanGate: action.approvalPlan.humanControl
  };

  return {
    id: action.id,
    title: action.title,
    family: "Cash-flow action",
    summary: action.rationale,
    records: action.approvalPlan.xeroRecords,
    endpoints: ["GET /Invoices?Statuses=AUTHORISED,PAID", "GET /Contacts?summaryOnly=true", "GET /Payments"],
    fields: [
      "Invoice.InvoiceID",
      "Invoice.InvoiceNumber",
      "Invoice.AmountDue",
      "Invoice.DueDate",
      "Contact.Name",
      "Contact.PaymentReliability"
    ],
    writeback,
    humanControl: action.approvalPlan.humanControl
  };
}

function buildRevenueEvidence(opportunity: RevenueOpportunity): EvidenceDrawerData {
  const endpointByType: Record<RevenueOpportunity["type"], string> = {
    closed_won_not_invoiced: "PUT /Invoices",
    dormant_customer_reactivation: "PUT /Quotes",
    upsell_cross_sell: "PUT /Quotes",
    subscription_conversion: "PUT /RepeatingInvoices",
    late_payment_recovery: "POST /Invoices/{InvoiceID}/Email",
    unmatched_external_order: "PUT /Contacts + PUT /Invoices",
    underperforming_service_fix: "PUT /Items"
  };
  const writeback: QueuedWritebackPreview = {
    id: opportunity.id,
    title: opportunity.title,
    group: "revenue",
    method: opportunity.type === "late_payment_recovery" ? "POST" : "PUT",
    endpoint: endpointByType[opportunity.type],
    object: opportunity.approvalPlan.approvedExecution,
    payload: {
      opportunityId: opportunity.id,
      type: opportunity.type,
      contactId: opportunity.contactId ?? null,
      contactName: opportunity.contactName ?? null,
      serviceCategory: opportunity.serviceCategory ?? null,
      expectedRevenueImpact: opportunity.expectedRevenueImpact,
      expectedCashFlowImpact: opportunity.expectedCashFlowImpact,
      messageDraft: opportunity.messageDraft,
      safeWriteMode: "draft_only_until_owner_approval"
    },
    humanGate: opportunity.approvalPlan.humanControl
  };

  return {
    id: opportunity.id,
    title: opportunity.title,
    family: "Revenue opportunity",
    summary: opportunity.recommendedAction,
    records: opportunity.approvalPlan.xeroRecords,
    endpoints: ["GET /Invoices", "GET /Contacts", "GET /Items", "GET /Quotes", "GET /RepeatingInvoices"],
    fields: [
      "Contact.Name",
      "Invoice.Total",
      "Invoice.Status",
      "Invoice.LineItems",
      ...opportunity.modelSignals.map((signal) => signal.label)
    ],
    writeback,
    humanControl: opportunity.approvalPlan.humanControl
  };
}

function buildProductivityEvidence(task: ProductivityAutomationTask): EvidenceDrawerData {
  const endpointByType: Record<ProductivityAutomationTask["type"], string> = {
    receipt_to_expense: "PUT /Invoices/{BillID}",
    smart_reconciliation: "PUT /Payments",
    duplicate_bill_guard: "POST /Invoices/{BillID}/History",
    contractor_payment_prep: "PUT /Invoices",
    subscription_expense_control: "PUT /BankTransactions"
  };
  const writeback: QueuedWritebackPreview = {
    id: task.id,
    title: task.title,
    group: "productivity",
    method: task.type === "duplicate_bill_guard" ? "POST" : "PUT",
    endpoint: endpointByType[task.type],
    object: task.xeroTarget,
    payload: {
      taskId: task.id,
      workflow: task.workflow,
      xeroTarget: task.xeroTarget,
      sourceRecord: task.sourceRecord,
      recommendedAction: task.recommendedAction,
      automationSteps: task.automationSteps,
      safeWriteMode: "reviewed_finance_admin_update"
    },
    humanGate: task.approvalPlan.humanControl
  };

  return {
    id: task.id,
    title: task.title,
    family: "Productivity automation",
    summary: task.businessImpact,
    records: task.approvalPlan.xeroRecords,
    endpoints: ["GET /BankTransactions", "GET /Invoices", "GET /Accounts", endpointByType[task.type]],
    fields: ["Source memo/raw text", "Amount", "Contact.Name", "Account.Code", "Invoice.Reference", "Attachment"],
    writeback,
    humanControl: task.approvalPlan.humanControl
  };
}

function buildIntegrationEvidence(candidate: AdaptiveIntegrationCandidate): EvidenceDrawerData {
  const endpoint = `PUT /${pluralXeroObject(candidate.mappedXeroObject)}`;
  const writeback: QueuedWritebackPreview = {
    id: candidate.id,
    title: candidate.title,
    group: "integration",
    method: "PUT",
    endpoint,
    object: candidate.targetXeroRecord,
    payload: {
      candidateId: candidate.id,
      sourceSystem: candidate.sourceSystem,
      sourceRecordId: candidate.sourceRecordId,
      mappedXeroObject: candidate.mappedXeroObject,
      targetXeroRecord: candidate.targetXeroRecord,
      fieldMappings: candidate.fieldMappings,
      missingFields: candidate.missingFields,
      safeWriteMode: "draft_sync_until_owner_approval"
    },
    humanGate: candidate.approvalPlan.humanControl
  };

  return {
    id: candidate.id,
    title: candidate.title,
    family: "Adaptive integration",
    summary: candidate.syncAction,
    records: candidate.approvalPlan.xeroRecords,
    endpoints: ["GET /Contacts", "GET /Invoices", "GET /Items", endpoint],
    fields: candidate.fieldMappings.map((mapping) => `${mapping.sourceField} -> ${mapping.xeroField}`),
    writeback,
    humanControl: candidate.approvalPlan.humanControl
  };
}

function pluralXeroObject(object: AdaptiveIntegrationCandidate["mappedXeroObject"]) {
  if (object === "RepeatingInvoice") return "RepeatingInvoices";
  if (object === "TrackingCategory") return "TrackingCategories";
  return `${object}s`;
}

function OpportunityCard({
  opportunity,
  onEvidence,
  selected,
  onToggle
}: {
  opportunity: RevenueOpportunity;
  onEvidence: () => void;
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
      <button className="evidenceButton" type="button" onClick={onEvidence}>
        <Eye size={14} aria-hidden="true" />
        Xero evidence and writeback
      </button>
    </article>
  );
}

function ActionRow({
  action,
  onEvidence,
  selected,
  onToggle
}: {
  action: CashAction;
  onEvidence: () => void;
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
      <button className="evidenceButton" type="button" onClick={onEvidence}>
        <Eye size={14} aria-hidden="true" />
        Xero evidence and writeback
      </button>
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

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function humanizeIdentifier(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
}

function formatShortDate(value: ForecastPoint["date"]) {
  const date = new Date(`${value}T00:00:00Z`);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function displayDate(value: ForecastPoint["date"] | null) {
  return value ? formatShortDate(value) : "No breach";
}
