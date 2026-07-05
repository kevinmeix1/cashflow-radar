export type ISODate = string;

export type InvoiceType = "ACCREC" | "ACCPAY";

export type InvoiceStatus = "DRAFT" | "SUBMITTED" | "AUTHORISED" | "PAID" | "VOIDED";

export type ContactKind = "customer" | "supplier" | "both";

export type RiskLevel = "low" | "medium" | "high";

export interface ApprovalPlan {
  xeroRecords: string[];
  approvedExecution: string;
  humanControl: string;
}

export interface Contact {
  id: string;
  name: string;
  kind: ContactKind;
  email: string;
  medianDaysLate: number;
  paymentReliability: number;
  relationshipSensitivity: RiskLevel;
  notes: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  type: InvoiceType;
  contactId: string;
  issueDate: ISODate;
  dueDate: ISODate;
  amountDue: number;
  total: number;
  status: InvoiceStatus;
  expectedPaymentDate?: ISODate;
  plannedPaymentDate?: ISODate;
  fullyPaidOnDate?: ISODate;
  lineItems?: InvoiceLineItem[];
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  category: string;
  quantity: number;
  unitAmount: number;
  lineAmount: number;
}

export interface RecurringCashFlow {
  id: string;
  label: string;
  direction: "inflow" | "outflow";
  amount: number;
  nextDate: ISODate;
  cadenceDays: number;
  category: string;
}

export interface XeroSnapshot {
  organisationName: string;
  currency: string;
  asOfDate: ISODate;
  openingCashBalance: number;
  safeCashThreshold: number;
  contacts: Contact[];
  invoices: Invoice[];
  recurringCashFlows: RecurringCashFlow[];
}

export interface DataQualityIssue {
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
}

export interface DataQualityResult {
  score: number;
  status: "forecast-ready" | "usable-with-caveats" | "needs-cleanup";
  issues: DataQualityIssue[];
}

export interface ForecastPoint {
  date: ISODate;
  openingBalance: number;
  customerInflows: number;
  supplierOutflows: number;
  recurringInflows: number;
  recurringOutflows: number;
  closingBalance: number;
}

export interface ScenarioSummary {
  firstThresholdBreachDate: ISODate | null;
  minimumCashDate: ISODate;
  minimumCashBalance: number;
  crunchProbability: number;
}

export interface ForecastBandPoint {
  date: ISODate;
  pessimisticBalance: number;
  expectedBalance: number;
  optimisticBalance: number;
}

export interface ForecastScenario {
  name: string;
  threshold: number;
  horizonDays: number;
  points: ForecastPoint[];
  /** Monte Carlo p10/p50/p90 daily balances; absent when the simulation is skipped. */
  bands?: ForecastBandPoint[];
  summary: ScenarioSummary;
}

export type ForecastModelType = "time_series" | "payment_delay" | "monte_carlo" | "driver_attribution";

export interface ForecastModelInsight {
  id: string;
  name: string;
  type: ForecastModelType;
  purpose: string;
  xeroInputs: string[];
  method: string;
  output: string;
  confidence: RiskLevel;
}

export interface CashDriverInsight {
  id: string;
  label: string;
  direction: "positive" | "negative" | "risk";
  impactAmount: number;
  impactLabel: string;
  explanation: string;
  evidence: string[];
  sensitivity: string;
  confidence: RiskLevel;
}

export interface ForecastDecisionCallout {
  id: string;
  title: string;
  answer: string;
  evidence: string[];
  businessDecision: string;
}

export interface TimeSeriesDiagnostic {
  id: string;
  label: string;
  value: string;
  detail: string;
  method: string;
}

export interface ForecastIntelligence {
  explainabilitySummary: string;
  biggestRisk: string;
  biggestOpportunity: string;
  decisionCallouts: ForecastDecisionCallout[];
  timeSeriesDiagnostics: TimeSeriesDiagnostic[];
  models: ForecastModelInsight[];
  cashDrivers: CashDriverInsight[];
}

export type CashActionType =
  | "chase_invoice"
  | "early_payment_incentive"
  | "delay_supplier_payment";

export interface CashAction {
  id: string;
  type: CashActionType;
  title: string;
  contactId: string;
  contactName: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  grossAmount: number;
  estimatedCost: number;
  cashImpactBeforeCrunch: number;
  actionDate: ISODate;
  expectedCashDate: ISODate;
  confidence: RiskLevel;
  relationshipRisk: RiskLevel;
  rationale: string;
  messageDraft: string;
  approvalPlan: ApprovalPlan;
}

export interface AgentNarrative {
  headline: string;
  summary: string;
  boardLevelNarrative: string;
  assumptions: string[];
}

export type RevenueOpportunityType =
  | "closed_won_not_invoiced"
  | "dormant_customer_reactivation"
  | "upsell_cross_sell"
  | "subscription_conversion"
  | "late_payment_recovery"
  | "unmatched_external_order"
  | "underperforming_service_fix";

export interface RevenueOpportunity {
  id: string;
  type: RevenueOpportunityType;
  title: string;
  contactId?: string;
  contactName?: string;
  serviceCategory?: string;
  expectedRevenueImpact: number;
  expectedCashFlowImpact: number;
  confidence: RiskLevel;
  urgency: RiskLevel;
  recommendedAction: string;
  evidence: string[];
  modelSignals: Array<{
    label: string;
    value: string;
  }>;
  messageDraft: string;
  approvalPlan: ApprovalPlan;
}

export interface RevenueGrowthSummary {
  totalExpectedRevenue: number;
  totalExpectedCashFlow: number;
  opportunitiesDetected: number;
  topOpportunityType: RevenueOpportunityType | null;
}

export type ExternalRecordType = "DEAL" | "ORDER";

export interface ExternalDeal {
  externalDealId: string;
  sourceSystem: string;
  companyName: string;
  contactEmail?: string;
  dealName: string;
  amount: number;
  closeDate: ISODate;
  stage: "closed_won" | "open" | "lost";
  productOrService?: string;
  rawPayload: Record<string, unknown>;
}

export interface ExternalOrder {
  externalOrderId: string;
  sourceSystem: string;
  customerName: string;
  customerEmail?: string;
  orderDate: ISODate;
  amount: number;
  productNames: string[];
  status: "paid" | "pending" | "refunded";
  rawPayload: Record<string, unknown>;
}

export interface EntityMatch {
  matchId: string;
  externalRecordId: string;
  externalRecordType: ExternalRecordType;
  sourceSystem: string;
  externalName: string;
  externalTitle: string;
  externalAmount: number;
  xeroContactId?: string;
  xeroContactName?: string;
  confidence: number;
  matchStatus: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "NEEDS_NEW_CONTACT";
  evidence: string[];
  sourceRecordIds: string[];
}

export interface SmartMappingSummary {
  totalMatches: number;
  highConfidenceMatches: number;
  needsReview: number;
  bestMatch: string | null;
}

export interface AuditLogEntry {
  auditId: string;
  eventType: string;
  sourceRecordIds: string[];
  payload: Record<string, unknown>;
  createdAt: string;
}

export type ProductivityAutomationType =
  | "receipt_to_expense"
  | "smart_reconciliation"
  | "duplicate_bill_guard"
  | "contractor_payment_prep"
  | "subscription_expense_control";

export interface ProductivityAutomationTask {
  id: string;
  type: ProductivityAutomationType;
  title: string;
  sourceRecord: string;
  workflow: string;
  xeroTarget: string;
  confidenceScore: number;
  confidence: RiskLevel;
  timeSavedMinutes: number;
  businessImpact: string;
  messySignals: string[];
  automationSteps: string[];
  recommendedAction: string;
  approvalPlan: ApprovalPlan;
}

export interface ProductivityAutomationSummary {
  tasksDetected: number;
  autoResolvableTasks: number;
  exceptionTasks: number;
  estimatedMinutesSaved: number;
  highestImpactTask: string | null;
  xeroTouchpoints: string[];
}

export type IntegrationSourceSystem =
  | "CRM"
  | "E-commerce"
  | "Payments"
  | "Payroll"
  | "Spreadsheet"
  | "SaaS";

export type XeroMappedObject =
  | "Contact"
  | "Invoice"
  | "Bill"
  | "Payment"
  | "Item"
  | "Account"
  | "TrackingCategory"
  | "RepeatingInvoice";

export interface AdaptiveFieldMapping {
  sourceField: string;
  sourceValue: string;
  xeroField: string;
  mappedValue: string;
  confidence: RiskLevel;
}

export interface AdaptiveIntegrationCandidate {
  id: string;
  sourceSystem: IntegrationSourceSystem;
  sourceRecordId: string;
  title: string;
  rawSignal: string;
  mappedXeroObject: XeroMappedObject;
  targetXeroRecord: string;
  confidenceScore: number;
  confidence: RiskLevel;
  expectedValue: number;
  syncAction: string;
  fieldMappings: AdaptiveFieldMapping[];
  missingFields: string[];
  resilienceNotes: string[];
  approvalPlan: ApprovalPlan;
}

export interface AdaptiveIntegrationSummary {
  candidatesDetected: number;
  readyToSync: number;
  needsReview: number;
  totalMappedValue: number;
  sourceSystems: IntegrationSourceSystem[];
  topSyncAction: string | null;
}

export type OwnerPriorityType =
  | "cash_runway"
  | "late_payment_stress"
  | "revenue_leakage"
  | "predictable_revenue"
  | "supplier_trust";

export interface OwnerPriority {
  id: string;
  type: OwnerPriorityType;
  title: string;
  practicalImpact: string;
  recommendedMove: string;
  metricLabel: string;
  metricValue: string;
  urgency: RiskLevel;
  effort: "low" | "medium" | "high";
  ownerOutcome: string;
}

export interface XeroApiProvenance {
  mode: "seeded-demo" | "xero-api";
  connected: boolean;
  tenantId?: string;
  tenantName?: string;
  fetchedAt?: string;
  endpoints: string[];
  scopes: string[];
  records: {
    invoices: number;
    contacts: number;
    reports: number;
    lineItems: number;
    accounts: number;
    items: number;
    payments: number;
    quotes: number;
    bankTransactions: number;
    repeatingInvoices: number;
    trackingCategories: number;
  };
  tooling: {
    sdk: string;
    mcpServerPackage: string;
    mcpEnabled: boolean;
    mcpAuthMode: "custom-connection" | "bearer-token" | "oauth-token" | "not-configured";
    mcpToolsDiscovered: number;
    mcpToolExamples: string[];
    agentToolkitPattern: string;
    promptLibraryGuidance: string[];
    scopeMode: string;
    compatibilityScopes: string[];
    safeWriteMode: string;
  };
  note: string;
}

export type ApprovalGroup = "cash" | "revenue" | "productivity" | "integration";

export interface QueuedWritebackPreview {
  id: string;
  title: string;
  group: ApprovalGroup;
  method: "POST" | "PUT";
  endpoint: string;
  object: string;
  payload: Record<string, unknown>;
  humanGate: string;
}

export interface AgentTraceStep {
  id: string;
  agentName: string;
  status: "ready" | "ran" | "fallback";
  input: string;
  reasoning: string;
  output: string;
  xeroEvidence: string[];
}

export interface AgentLayerStatus {
  mode: "deterministic-fallback" | "openai-agents-sdk";
  specialists: Array<{
    name: string;
    role: string;
    status: "ready" | "ran" | "fallback";
  }>;
  traceSteps: AgentTraceStep[];
  traceHint: string;
}

export interface DashboardPayload {
  source: "seeded-demo" | "xero-api";
  generatedAt: string;
  snapshot: Pick<
    XeroSnapshot,
    "organisationName" | "currency" | "asOfDate" | "openingCashBalance" | "safeCashThreshold"
  >;
  dataQuality: DataQualityResult;
  baseline: ForecastScenario;
  afterActions: ForecastScenario;
  forecastIntelligence: ForecastIntelligence;
  recommendedActions: CashAction[];
  revenueGrowth: RevenueGrowthSummary;
  revenueOpportunities: RevenueOpportunity[];
  smartMappingSummary: SmartMappingSummary;
  entityMatches: EntityMatch[];
  productivitySummary: ProductivityAutomationSummary;
  productivityTasks: ProductivityAutomationTask[];
  integrationSummary: AdaptiveIntegrationSummary;
  integrationCandidates: AdaptiveIntegrationCandidate[];
  auditLog: AuditLogEntry[];
  ownerPriorities: OwnerPriority[];
  narrative: AgentNarrative;
  xero: XeroApiProvenance;
  queuedWritebacks: QueuedWritebackPreview[];
  agentLayer: AgentLayerStatus;
}
