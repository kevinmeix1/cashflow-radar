import { Agent, run } from "@openai/agents";
import { z } from "zod";
import type {
  AgentNarrative,
  CashAction,
  DataQualityResult,
  ForecastScenario,
  RevenueGrowthSummary,
  RevenueOpportunity,
  XeroSnapshot
} from "../types/domain";

const SpecialistInsightSchema = z.object({
  headline: z.string(),
  interpretation: z.string(),
  risks: z.array(z.string()),
  recommendedFocus: z.array(z.string())
});

const CommunicationInsightSchema = z.object({
  collectionTone: z.string(),
  supplierTone: z.string(),
  approvalWarning: z.string(),
  messagePrinciples: z.array(z.string())
});

const AgentNarrativeSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  boardLevelNarrative: z.string(),
  assumptions: z.array(z.string())
});

interface NarrativeInput {
  snapshot: Pick<XeroSnapshot, "organisationName" | "currency" | "asOfDate" | "safeCashThreshold">;
  dataQuality?: DataQualityResult;
  baseline: ForecastScenario["summary"];
  afterActions: ForecastScenario["summary"];
  revenueGrowth?: RevenueGrowthSummary;
  revenueOpportunities?: Array<
    Pick<
      RevenueOpportunity,
      | "id"
      | "type"
      | "title"
      | "contactName"
      | "serviceCategory"
      | "expectedRevenueImpact"
      | "expectedCashFlowImpact"
      | "confidence"
      | "urgency"
      | "recommendedAction"
      | "evidence"
    >
  >;
  recommendedActions: Array<
    Pick<
      CashAction,
      | "id"
      | "type"
      | "title"
      | "contactName"
      | "invoiceNumber"
      | "cashImpactBeforeCrunch"
      | "confidence"
      | "relationshipRisk"
      | "rationale"
      | "messageDraft"
    >
  >;
}

const sharedInstructions = [
  "You are part of CashFlow Radar, a Xero-powered revenue and cash-flow action system for small businesses.",
  "Never recalculate forecast numbers. Treat all numerical inputs as deterministic application outputs.",
  "Use cautious finance language. Recommend actions only with human approval.",
  "Be specific about Xero invoices, contacts, line items, due dates, cash windows, revenue opportunities, and confidence."
].join(" ");

const dataQualityAgent = new Agent({
  name: "Data Quality Agent",
  instructions: `${sharedInstructions} Check whether the Xero snapshot is reliable enough to forecast. Focus on missing contacts, due dates, opening cash, and payment history.`,
  model: process.env.OPENAI_MODEL,
  outputType: SpecialistInsightSchema
});

const forecastAgent = new Agent({
  name: "Forecast Agent",
  instructions: `${sharedInstructions} Interpret the baseline and after-action forecast summaries. Focus on threshold breaches, minimum cash, probability movement, and risk windows.`,
  model: process.env.OPENAI_MODEL,
  outputType: SpecialistInsightSchema
});

const cashActionAgent = new Agent({
  name: "Cash Action Agent",
  instructions: `${sharedInstructions} Evaluate the recommended customer and supplier actions. Explain why each intervention matters and where the tradeoff is.`,
  model: process.env.OPENAI_MODEL,
  outputType: SpecialistInsightSchema
});

const revenueGrowthAgent = new Agent({
  name: "Revenue Growth Agent",
  instructions: `${sharedInstructions} Identify revenue growth opportunities from Xero invoice, contact, payment, and line-item data. Focus on dormant high-value customers, upsells, subscriptions, and underperforming services.`,
  model: process.env.OPENAI_MODEL,
  outputType: SpecialistInsightSchema
});

const communicationAgent = new Agent({
  name: "Collections and Supplier Communication Agent",
  instructions: `${sharedInstructions} Set communication guidance for customer collections and supplier delay requests. Keep messages respectful and commercially credible.`,
  model: process.env.OPENAI_MODEL,
  outputType: CommunicationInsightSchema
});

const cfoNarrativeAgent = new Agent({
  name: "CFO Narrative Agent",
  instructions: `${sharedInstructions} Produce the final owner/CFO-facing explanation. Use the specialist insights as advisory context and keep it concise.`,
  model: process.env.OPENAI_MODEL,
  outputType: AgentNarrativeSchema
});

export async function generateAgentNarrative(input: NarrativeInput): Promise<AgentNarrative | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  try {
    const compactInput = JSON.stringify(input, null, 2);
    const [dataQuality, forecast, actions, revenue, communication] = await Promise.all([
      run(dataQualityAgent, `Assess forecast data readiness:\n${compactInput}`),
      run(forecastAgent, `Interpret this deterministic forecast result:\n${compactInput}`),
      run(cashActionAgent, `Evaluate and prioritise these cash actions:\n${compactInput}`),
      run(revenueGrowthAgent, `Evaluate these revenue growth opportunities and their commercial value:\n${compactInput}`),
      run(communicationAgent, `Guide human-approved communications for these actions:\n${compactInput}`)
    ]);

    const specialistPacket = {
      dataQuality: SpecialistInsightSchema.parse(dataQuality.finalOutput),
      forecast: SpecialistInsightSchema.parse(forecast.finalOutput),
      actions: SpecialistInsightSchema.parse(actions.finalOutput),
      revenue: SpecialistInsightSchema.parse(revenue.finalOutput),
      communication: CommunicationInsightSchema.parse(communication.finalOutput)
    };

    const final = await run(
      cfoNarrativeAgent,
      `Create a CFO-style narrative from this deterministic forecast and specialist packet:\n${JSON.stringify(
        {
          forecast: input,
          specialistPacket
        },
        null,
        2
      )}`
    );

    return AgentNarrativeSchema.parse(final.finalOutput);
  } catch (error) {
    console.warn("Agent narrative unavailable, using deterministic fallback.", error);
    return null;
  }
}
