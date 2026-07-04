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

export interface ForecastScenario {
  name: string;
  threshold: number;
  horizonDays: number;
  points: ForecastPoint[];
  summary: ScenarioSummary;
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
  | "dormant_customer_reactivation"
  | "upsell_cross_sell"
  | "subscription_conversion"
  | "late_payment_recovery"
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

export interface AgentLayerStatus {
  mode: "deterministic-fallback" | "openai-agents-sdk";
  specialists: Array<{
    name: string;
    role: string;
    status: "ready" | "ran" | "fallback";
  }>;
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
  recommendedActions: CashAction[];
  revenueGrowth: RevenueGrowthSummary;
  revenueOpportunities: RevenueOpportunity[];
  ownerPriorities: OwnerPriority[];
  narrative: AgentNarrative;
  xero: XeroApiProvenance;
  agentLayer: AgentLayerStatus;
}
