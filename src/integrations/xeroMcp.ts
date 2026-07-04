import { MCPServerStdio } from "@openai/agents";

export const xeroMcpToolExamples = [
  "list-invoices",
  "list-contacts",
  "list-items",
  "list-payments",
  "list-bank-transactions",
  "list-profit-and-loss",
  "list-report-balance-sheet",
  "list-trial-balance",
  "list-aged-receivables-by-contact",
  "create-quote",
  "create-invoice",
  "update-contact"
];

export interface XeroMcpBridgeStatus {
  enabled: boolean;
  packageName: string;
  command: string;
  authMode: "custom-connection" | "bearer-token" | "oauth-token" | "not-configured";
  toolsDiscovered: number;
  toolExamples: string[];
  note: string;
}

export async function inspectXeroMcpBridge(): Promise<XeroMcpBridgeStatus> {
  const packageName = process.env.XERO_MCP_PACKAGE ?? "@xeroapi/xero-mcp-server@latest";
  const command = process.env.XERO_MCP_COMMAND ?? "npx";
  const authMode = detectMcpAuthMode();

  if (process.env.XERO_MCP_ENABLED !== "true") {
    return {
      enabled: false,
      packageName,
      command,
      authMode,
      toolsDiscovered: 0,
      toolExamples: xeroMcpToolExamples,
      note: "MCP bridge is ready but not started. Set XERO_MCP_ENABLED=true when credentials are available."
    };
  }

  if (authMode === "not-configured") {
    return {
      enabled: true,
      packageName,
      command,
      authMode,
      toolsDiscovered: 0,
      toolExamples: xeroMcpToolExamples,
      note: "XERO_MCP_ENABLED=true, but no supported MCP auth variables are configured."
    };
  }

  const server = new MCPServerStdio({
    name: "Xero",
    command,
    args: ["-y", packageName],
    env: buildMcpEnvironment()
  });

  try {
    await server.connect();
    const tools = await server.listTools();
    return {
      enabled: true,
      packageName,
      command,
      authMode,
      toolsDiscovered: tools.length,
      toolExamples: tools.slice(0, 12).map((tool) => tool.name),
      note: "Xero MCP server connected through OpenAI Agents SDK MCPServerStdio."
    };
  } catch (error) {
    return {
      enabled: true,
      packageName,
      command,
      authMode,
      toolsDiscovered: 0,
      toolExamples: xeroMcpToolExamples,
      note: `MCP bridge attempted but did not connect: ${error instanceof Error ? error.message : "Unknown MCP error"}`
    };
  } finally {
    await server.close().catch(() => undefined);
  }
}

function detectMcpAuthMode(): XeroMcpBridgeStatus["authMode"] {
  if (process.env.XERO_CLIENT_BEARER_TOKEN) return "bearer-token";
  if (process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET) return "custom-connection";
  if (process.env.XERO_MCP_USE_STORED_OAUTH_TOKEN === "true") return "oauth-token";
  return "not-configured";
}

function buildMcpEnvironment() {
  const env: Record<string, string> = {};
  for (const key of [
    "XERO_CLIENT_ID",
    "XERO_CLIENT_SECRET",
    "XERO_CLIENT_BEARER_TOKEN",
    "XERO_SCOPES",
    "XERO_TENANT_ID"
  ]) {
    if (process.env[key]) env[key] = process.env[key] as string;
  }
  return env;
}
