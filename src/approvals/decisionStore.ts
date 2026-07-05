import fs from "node:fs/promises";
import path from "node:path";
import type { ApprovalDecision } from "../audit/auditService";
import type { ApprovalGroup, QueuedWritebackPreview } from "../types/domain";

export interface StoredApprovalDecision {
  id: string;
  group: ApprovalGroup;
  decision: ApprovalDecision;
  source: "demo" | "xero";
  decidedAt: string;
  editedMessage?: string;
  writebackPreview?: QueuedWritebackPreview;
}

interface DecisionStoreFile {
  decisions: StoredApprovalDecision[];
  updatedAt: string;
}

const emptyStore = (): DecisionStoreFile => ({
  decisions: [],
  updatedAt: new Date().toISOString()
});

export async function getApprovalDecisions(): Promise<Record<string, StoredApprovalDecision>> {
  const store = await readStore();
  return Object.fromEntries(store.decisions.map((decision) => [decision.id, decision]));
}

export async function getQueuedWritebacks(): Promise<QueuedWritebackPreview[]> {
  const store = await readStore();
  return store.decisions
    .filter((decision) => decision.decision !== "REJECTED" && decision.writebackPreview)
    .map((decision) => decision.writebackPreview as QueuedWritebackPreview)
    .slice(0, 12);
}

export async function recordApprovalDecisions(input: {
  source: "demo" | "xero";
  decision: ApprovalDecision;
  editedMessages?: Record<string, string>;
  idsByGroup: Record<ApprovalGroup, string[]>;
  writebackPreviews?: QueuedWritebackPreview[];
}): Promise<StoredApprovalDecision[]> {
  const decidedAt = new Date().toISOString();
  const previewById = new Map((input.writebackPreviews ?? []).map((preview) => [preview.id, preview]));
  const nextDecisions = Object.entries(input.idsByGroup).flatMap(([group, ids]) =>
    ids.map((id) => {
      const editedMessage = input.editedMessages?.[id];
      const decision: ApprovalDecision = editedMessage && input.decision === "APPROVED" ? "EDITED" : input.decision;
      return {
        id,
        group: group as ApprovalGroup,
        decision,
        source: input.source,
        decidedAt,
        ...(editedMessage ? { editedMessage } : {}),
        ...(previewById.has(id) ? { writebackPreview: previewById.get(id) } : {})
      } satisfies StoredApprovalDecision;
    })
  );

  const store = await readStore();
  const replacedIds = new Set(nextDecisions.map((decision) => decision.id));
  const decisions = [
    ...nextDecisions,
    ...store.decisions.filter((decision) => !replacedIds.has(decision.id))
  ];
  await writeStore({ decisions, updatedAt: decidedAt });
  return nextDecisions;
}

export async function resetApprovalDecisionStore(): Promise<void> {
  await writeStore(emptyStore());
}

async function readStore(): Promise<DecisionStoreFile> {
  try {
    const raw = await fs.readFile(getStorePath(), "utf8");
    const parsed = JSON.parse(raw) as DecisionStoreFile;
    return {
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString()
    };
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: DecisionStoreFile): Promise<void> {
  const storePath = getStorePath();
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(store, null, 2));
}

function getStorePath() {
  const configured = process.env.CASHPILOT_DECISION_STORE ?? ".cashpilot/decision-store.json";
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}
