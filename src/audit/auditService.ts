import type { AuditLogEntry } from "../types/domain";

export type ApprovalDecision = "APPROVED" | "EDITED" | "REJECTED";

interface ApprovalAuditInput {
  source: "demo" | "xero";
  decision?: ApprovalDecision;
  /** Recommendation IDs whose draft message was edited before approval. */
  editedMessages?: Record<string, string>;
  cashActionIds: string[];
  revenueOpportunityIds: string[];
  productivityTaskIds: string[];
  integrationCandidateIds: string[];
}

const seedAuditLog: AuditLogEntry[] = [
  {
    auditId: "audit-seed-mapping-brightside",
    eventType: "SMART_MAPPING_REVIEWED",
    sourceRecordIds: ["CRM-DEAL-6500", "contact-bright"],
    payload: {
      matchId: "match-crm-deal-6500",
      previousStatus: "NEW",
      newStatus: "PENDING_REVIEW",
      confidence: 0.92,
      explanation: "Brightside Studio Ltd matched to Brightside Studios using normalised name and email domain."
    },
    createdAt: "2026-07-04T09:05:00.000Z"
  },
  {
    auditId: "audit-seed-risk-run",
    eventType: "FORECAST_RUN_CREATED",
    sourceRecordIds: ["forecast-run-demo-30d", "BILL-077", "INV-4018"],
    payload: {
      previousStatus: "NOT_STARTED",
      newStatus: "COMPLETED",
      note: "30-day crunch probability calculated from deterministic cash-flow simulation."
    },
    createdAt: "2026-07-04T09:07:00.000Z"
  }
];

const auditLog: AuditLogEntry[] = [...seedAuditLog];

export function getAuditLog(): AuditLogEntry[] {
  return [...auditLog].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 12);
}

export function recordApprovalAudit(input: ApprovalAuditInput): AuditLogEntry[] {
  const createdAt = new Date().toISOString();
  const decision = input.decision ?? "APPROVED";
  const groups = [
    ["CASH_ACTION", input.cashActionIds],
    ["REVENUE_RECOMMENDATION", input.revenueOpportunityIds],
    ["PRODUCTIVITY_AUTOMATION", input.productivityTaskIds],
    ["ADAPTIVE_INTEGRATION", input.integrationCandidateIds]
  ] as const;

  const entries = groups.flatMap(([group, ids]) =>
    ids.map((id) => {
      const editedMessage = input.editedMessages?.[id];
      const itemDecision: ApprovalDecision = editedMessage && decision === "APPROVED" ? "EDITED" : decision;
      const eventType = `${group}_${itemDecision}`;
      return {
        auditId: `audit-${eventType.toLowerCase()}-${id}-${Date.now()}`,
        eventType,
        sourceRecordIds: inferSourceRecordIds(id),
        payload: {
          recommendationId: id,
          source: input.source,
          decision: itemDecision,
          previousStatus: "PENDING",
          newStatus: itemDecision,
          ...(editedMessage ? { editedMessage } : {}),
          reviewedExecution: itemDecision !== "REJECTED"
        },
        createdAt
      };
    })
  );

  auditLog.unshift(...entries);
  return entries;
}

export interface MappingDecisionInput {
  matchId: string;
  decision: "APPROVED" | "REJECTED" | "NEEDS_NEW_CONTACT";
  externalRecordId: string;
  xeroContactId?: string;
  xeroContactName?: string;
  confidence?: number;
}

const mappingDecisions = new Map<string, MappingDecisionInput["decision"]>();

export function getMappingDecisions(): Record<string, MappingDecisionInput["decision"]> {
  return Object.fromEntries(mappingDecisions);
}

export function recordMappingDecision(input: MappingDecisionInput): AuditLogEntry {
  mappingDecisions.set(input.matchId, input.decision);
  const entry: AuditLogEntry = {
    auditId: `audit-mapping-${input.matchId}-${Date.now()}`,
    eventType: `SMART_MAPPING_${input.decision}`,
    sourceRecordIds: [input.externalRecordId, input.xeroContactId].filter((value): value is string => Boolean(value)),
    payload: {
      matchId: input.matchId,
      decision: input.decision,
      previousStatus: "PENDING_REVIEW",
      newStatus: input.decision,
      xeroContactName: input.xeroContactName ?? null,
      confidence: input.confidence ?? null
    },
    createdAt: new Date().toISOString()
  };
  auditLog.unshift(entry);
  return entry;
}

export function resetRuntimeAuditState(): void {
  auditLog.splice(0, auditLog.length, ...seedAuditLog);
  mappingDecisions.clear();
}

function inferSourceRecordIds(id: string): string[] {
  if (id.includes("CRM-DEAL-6500") || id.includes("crm-bright") || id.includes("closed-won")) {
    return ["CRM-DEAL-6500", "contact-bright"];
  }
  if (id.includes("acme") || id.includes("4012")) return ["INV-4012", "contact-acme"];
  if (id.includes("bright") || id.includes("4018")) return ["INV-4018", "contact-bright"];
  if (id.includes("printco") || id.includes("188")) return ["BILL-188", "contact-printco"];
  if (id.includes("cloudlane") || id.includes("733")) return ["BILL-733", "contact-cloudlane"];
  if (id.includes("contractor") || id.includes("077")) return ["BILL-077", "GOOGLE-SHEET-TAB-JULY-CONTRACTORS"];
  if (id.includes("stripe") || id.includes("luna")) return ["STRIPE-PO-2026-07-02", "contact-luna"];
  if (id.includes("shopify") || id.includes("harbor")) return ["SHOPIFY-ORDER-1098", "contact-harbor"];
  if (id.includes("saas") || id.includes("retainer")) return ["RETENTION-APP-RENEWAL-221", "contact-bright"];
  return [id];
}
