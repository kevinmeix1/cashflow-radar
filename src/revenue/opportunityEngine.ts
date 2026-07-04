import { daysBetween } from "../forecast/dateUtils";
import type { Contact, Invoice, RevenueGrowthSummary, RevenueOpportunity, XeroSnapshot } from "../types/domain";

export function buildRevenueOpportunities(snapshot: XeroSnapshot): RevenueOpportunity[] {
  const contacts = new Map(snapshot.contacts.map((contact) => [contact.id, contact]));
  const receivables = snapshot.invoices.filter((invoice) => invoice.type === "ACCREC");
  const opportunities = [
    ...detectDormantCustomers(snapshot, receivables, contacts),
    ...detectSubscriptionConversions(snapshot, receivables, contacts),
    ...detectUpsellCrossSell(snapshot, receivables, contacts),
    ...detectLatePaymentRecovery(snapshot, receivables, contacts),
    ...detectUnderperformingServices(snapshot, receivables)
  ];

  return dedupe(opportunities)
    .sort((left, right) => score(right) - score(left))
    .slice(0, 5);
}

export function summariseRevenueGrowth(opportunities: RevenueOpportunity[]): RevenueGrowthSummary {
  return {
    totalExpectedRevenue: Math.round(opportunities.reduce((sum, opportunity) => sum + opportunity.expectedRevenueImpact, 0)),
    totalExpectedCashFlow: Math.round(opportunities.reduce((sum, opportunity) => sum + opportunity.expectedCashFlowImpact, 0)),
    opportunitiesDetected: opportunities.length,
    topOpportunityType: opportunities[0]?.type ?? null
  };
}

function detectDormantCustomers(
  snapshot: XeroSnapshot,
  invoices: Invoice[],
  contacts: Map<string, Contact>
): RevenueOpportunity[] {
  return Array.from(groupBy(invoices.filter((invoice) => invoice.status === "PAID"), (invoice) => invoice.contactId).entries())
    .map(([contactId, customerInvoices]): RevenueOpportunity | null => {
      const contact = contacts.get(contactId);
      if (!contact || contact.kind === "supplier") return null;
      const lastPaid = latestInvoiceDate(customerInvoices);
      const daysSinceLastPurchase = daysBetween(lastPaid, snapshot.asOfDate);
      const lifetimeRevenue = sumInvoices(customerInvoices);
      const averageInvoice = lifetimeRevenue / Math.max(1, customerInvoices.length);

      if (lifetimeRevenue < 6000 || daysSinceLastPurchase < 75) return null;

      return {
        id: `reactivate-${contactId}`,
        type: "dormant_customer_reactivation",
        title: `Reactivate ${contact.name}`,
        contactId,
        contactName: contact.name,
        expectedRevenueImpact: Math.round(averageInvoice * 0.65),
        expectedCashFlowImpact: Math.round(averageInvoice * 0.5),
        confidence: contact.paymentReliability > 0.82 ? "high" : "medium",
        urgency: "medium",
        recommendedAction: "Send a personalised check-in with a relevant follow-on offer from their last purchase.",
        evidence: [
          `${contact.name} previously generated ${money(lifetimeRevenue, snapshot.currency)} of revenue.`,
          `No paid invoice has landed for ${daysSinceLastPurchase} days.`,
          `Average historical invoice value is ${money(averageInvoice, snapshot.currency)}.`
        ],
        modelSignals: [
          { label: "Last paid invoice", value: shortDate(lastPaid) },
          { label: "Days inactive", value: String(daysSinceLastPurchase) },
          { label: "Payment reliability", value: `${Math.round(contact.paymentReliability * 100)}%` }
        ],
        messageDraft: `Hi ${contact.name}, we loved working with you on the last project. We spotted a few quick wins that could build on that work and would be happy to share a short plan this week.`,
        approvalPlan: {
          xeroRecords: [
            `Contact ${contact.name}`,
            `${customerInvoices.length} paid invoice(s)`,
            `Last paid ${shortDate(lastPaid)}`
          ],
          approvedExecution:
            "Create a contact note, queue a reactivation task, and attach the owner-approved outreach draft.",
          humanControl: "Owner approves the offer angle before the customer is contacted."
        }
      };
    })
    .filter((opportunity): opportunity is RevenueOpportunity => Boolean(opportunity));
}

function detectSubscriptionConversions(
  snapshot: XeroSnapshot,
  invoices: Invoice[],
  contacts: Map<string, Contact>
): RevenueOpportunity[] {
  const paidInvoices = invoices.filter((invoice) => invoice.status === "PAID");
  const byCustomer = groupBy(paidInvoices, (invoice) => invoice.contactId);
  const opportunities: RevenueOpportunity[] = [];

  for (const [contactId, customerInvoices] of byCustomer.entries()) {
    const contact = contacts.get(contactId);
    if (!contact || contact.kind === "supplier") continue;
    const categoryCounts = new Map<string, Invoice[]>();
    for (const invoice of customerInvoices) {
      for (const category of categories(invoice)) {
        categoryCounts.set(category, [...(categoryCounts.get(category) ?? []), invoice]);
      }
    }

    for (const [category, categoryInvoices] of categoryCounts.entries()) {
      if (categoryInvoices.length < 3) continue;
      const recentInvoices = categoryInvoices.filter((invoice) => daysBetween(invoice.issueDate, snapshot.asOfDate) <= 110);
      if (recentInvoices.length < 3) continue;
      const averageInvoice = sumInvoices(recentInvoices) / recentInvoices.length;

      opportunities.push({
        id: `subscription-${contactId}-${slug(category)}`,
        type: "subscription_conversion",
        title: `Convert ${contact.name} to a ${category} retainer`,
        contactId,
        contactName: contact.name,
        serviceCategory: category,
        expectedRevenueImpact: Math.round(averageInvoice * 3),
        expectedCashFlowImpact: Math.round(averageInvoice),
        confidence: "high",
        urgency: "medium",
        recommendedAction: "Offer a quarterly retainer that turns repeated ad-hoc invoices into predictable recurring revenue.",
        evidence: [
          `${contact.name} bought ${category} work ${recentInvoices.length} times recently.`,
          `Average invoice value is ${money(averageInvoice, snapshot.currency)}.`,
          "A subscription improves revenue predictability and cash-flow visibility."
        ],
        modelSignals: [
          { label: "Repeat purchases", value: `${recentInvoices.length} in 110 days` },
          { label: "Suggested retainer", value: money(Math.round(averageInvoice), snapshot.currency) + "/mo" },
          { label: "Confidence", value: "High" }
        ],
        messageDraft: `Hi ${contact.name}, we noticed the monthly ${category.toLowerCase()} work has become a regular rhythm. Would a fixed monthly retainer make planning and approvals easier on your side?`,
        approvalPlan: {
          xeroRecords: [
            `Contact ${contact.name}`,
            `${recentInvoices.length} ${category} invoices`,
            `Average ${money(averageInvoice, snapshot.currency)}`
          ],
          approvedExecution:
            "Draft a retainer proposal and prepare a Xero repeating-invoice template for owner review.",
          humanControl: "Owner confirms scope, price, and cadence before any recurring invoice is created."
        }
      });
    }
  }

  return opportunities;
}

function detectUpsellCrossSell(
  snapshot: XeroSnapshot,
  invoices: Invoice[],
  contacts: Map<string, Contact>
): RevenueOpportunity[] {
  const paidOrOpen = invoices.filter((invoice) => invoice.status === "PAID" || invoice.status === "AUTHORISED");
  const byCustomer = groupBy(paidOrOpen, (invoice) => invoice.contactId);
  const opportunities: RevenueOpportunity[] = [];

  for (const [contactId, customerInvoices] of byCustomer.entries()) {
    const contact = contacts.get(contactId);
    if (!contact || contact.kind === "supplier") continue;
    const bought = new Set(customerInvoices.flatMap(categories));
    const recentRevenue = sumInvoices(customerInvoices.filter((invoice) => daysBetween(invoice.issueDate, snapshot.asOfDate) <= 90));
    if (recentRevenue < 3500) continue;

    const missingOffer = bought.has("Website") && !bought.has("Conversion")
      ? "Conversion"
      : bought.has("Strategy") && !bought.has("Content")
        ? "Content"
        : bought.has("Conversion") && !bought.has("Analytics")
          ? "Analytics"
          : null;

    if (!missingOffer) continue;
    const expectedRevenue = missingOffer === "Analytics" ? 2600 : missingOffer === "Content" ? 3200 : 3800;

    opportunities.push({
      id: `upsell-${contactId}-${slug(missingOffer)}`,
      type: "upsell_cross_sell",
      title: `Cross-sell ${missingOffer} to ${contact.name}`,
      contactId,
      contactName: contact.name,
      serviceCategory: missingOffer,
      expectedRevenueImpact: expectedRevenue,
      expectedCashFlowImpact: Math.round(expectedRevenue * contact.paymentReliability),
      confidence: contact.paymentReliability > 0.8 ? "high" : "medium",
      urgency: "low",
      recommendedAction: "Send a value-led recommendation connected to the service they already bought.",
      evidence: [
        `${contact.name} has recent revenue of ${money(recentRevenue, snapshot.currency)}.`,
        `They bought ${Array.from(bought).join(", ")} but not ${missingOffer}.`,
        "Cross-sell is tied to an adjacent service, not a generic promotion."
      ],
      modelSignals: [
        { label: "Existing categories", value: Array.from(bought).join(", ") },
        { label: "Next best offer", value: missingOffer },
        { label: "Expected value", value: money(expectedRevenue, snapshot.currency) }
      ],
      messageDraft: `Hi ${contact.name}, based on the recent work, the next highest-leverage step is a focused ${missingOffer.toLowerCase()} sprint. We can keep it lightweight and tie it directly to the outcomes from the current project.`,
      approvalPlan: {
        xeroRecords: [
          `Contact ${contact.name}`,
          `Bought ${Array.from(bought).join(", ")}`,
          `Missing ${missingOffer}`
        ],
        approvedExecution:
          "Prepare a draft Xero quote for the next-best service and queue the personalised recommendation.",
        humanControl: "Owner approves pricing and scope before the quote is sent."
      }
    });
  }

  return opportunities;
}

function detectLatePaymentRecovery(
  snapshot: XeroSnapshot,
  invoices: Invoice[],
  contacts: Map<string, Contact>
): RevenueOpportunity[] {
  return invoices
    .filter((invoice) => invoice.status === "AUTHORISED" && invoice.amountDue > 0)
    .map((invoice): RevenueOpportunity | null => {
      const contact = contacts.get(invoice.contactId);
      if (!contact) return null;
      const daysUntilDue = daysBetween(snapshot.asOfDate, invoice.dueDate);
      const predictedLate = contact.medianDaysLate > 7 || daysUntilDue < 0;
      if (!predictedLate) return null;

      return {
        id: `recover-${invoice.id}`,
        type: "late_payment_recovery",
        title: `Protect booked revenue from ${contact.name}`,
        contactId: contact.id,
        contactName: contact.name,
        expectedRevenueImpact: 0,
        expectedCashFlowImpact: invoice.amountDue,
        confidence: contact.paymentReliability > 0.75 ? "medium" : "low",
        urgency: daysUntilDue < 0 ? "high" : "medium",
        recommendedAction: "Trigger a customer-specific follow-up before the payment delay hits the forecast.",
        evidence: [
          `${invoice.invoiceNumber} has ${money(invoice.amountDue, snapshot.currency)} still due.`,
          `${contact.name} typically pays ${contact.medianDaysLate} days late.`,
          `Due date is ${invoice.dueDate}.`
        ],
        modelSignals: [
          { label: "Invoice", value: invoice.invoiceNumber },
          { label: "Amount due", value: money(invoice.amountDue, snapshot.currency) },
          { label: "Median days late", value: String(contact.medianDaysLate) }
        ],
        messageDraft: `Hi ${contact.name}, a quick note on ${invoice.invoiceNumber}. Could you confirm the payment date so we can keep our schedule aligned?`,
        approvalPlan: {
          xeroRecords: [
            `Invoice ${invoice.invoiceNumber}`,
            `Contact ${contact.name}`,
            `${money(invoice.amountDue, snapshot.currency)} due`
          ],
          approvedExecution:
            "Queue an invoice follow-up and add a contact note with the requested payment-date confirmation.",
          humanControl: "Owner can soften the tone for sensitive customer relationships."
        }
      };
    })
    .filter((opportunity): opportunity is RevenueOpportunity => Boolean(opportunity));
}

function detectUnderperformingServices(snapshot: XeroSnapshot, invoices: Invoice[]): RevenueOpportunity[] {
  const categoryRevenue = new Map<string, number>();
  const categoryInvoices = new Map<string, Set<string>>();

  for (const invoice of invoices.filter((candidate) => candidate.type === "ACCREC")) {
    for (const item of invoice.lineItems ?? []) {
      categoryRevenue.set(item.category, (categoryRevenue.get(item.category) ?? 0) + item.lineAmount);
      categoryInvoices.set(item.category, new Set([...(categoryInvoices.get(item.category) ?? new Set()), invoice.id]));
    }
  }

  const entries = Array.from(categoryRevenue.entries()).filter(([, revenue]) => revenue > 0);
  if (entries.length < 3) return [];
  const averageRevenue = entries.reduce((sum, [, revenue]) => sum + revenue, 0) / entries.length;
  const underperformer = entries
    .filter(([, revenue]) => revenue < averageRevenue * 0.62)
    .sort(([, left], [, right]) => left - right)[0];

  if (!underperformer) return [];
  const [category, revenue] = underperformer;
  const expectedLift = Math.round(Math.max(2200, averageRevenue * 0.35));

  return [
    {
      id: `service-fix-${slug(category)}`,
      type: "underperforming_service_fix",
      title: `Repackage underperforming ${category} offer`,
      serviceCategory: category,
      expectedRevenueImpact: expectedLift,
      expectedCashFlowImpact: Math.round(expectedLift * 0.65),
      confidence: "medium",
      urgency: "low",
      recommendedAction: "Bundle the underperforming offer with a better-selling adjacent service and test it with recent buyers.",
      evidence: [
        `${category} revenue is ${money(revenue, snapshot.currency)}, below the portfolio average of ${money(averageRevenue, snapshot.currency)}.`,
        `${categoryInvoices.get(category)?.size ?? 0} invoice(s) include this service.`,
        "The action is a pricing/packaging experiment, not an accounting adjustment."
      ],
      modelSignals: [
        { label: "Service", value: category },
        { label: "Current revenue", value: money(revenue, snapshot.currency) },
        { label: "Target lift", value: money(expectedLift, snapshot.currency) }
      ],
      messageDraft: `Internal action: repackage ${category.toLowerCase()} as an add-on to a proven service, then test the offer with customers who recently bought adjacent work.`,
      approvalPlan: {
        xeroRecords: [
          `Service category ${category}`,
          `${categoryInvoices.get(category)?.size ?? 0} invoice(s)`,
          `Current revenue ${money(revenue, snapshot.currency)}`
        ],
        approvedExecution:
          "Create an internal pricing task and prepare a draft Xero item/quote bundle for review.",
        humanControl: "Owner decides whether the service should be repriced, bundled, or retired."
      }
    }
  ];
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function latestInvoiceDate(invoices: Invoice[]) {
  return invoices
    .map((invoice) => invoice.fullyPaidOnDate ?? invoice.issueDate)
    .sort()
    .at(-1) ?? "1970-01-01";
}

function sumInvoices(invoices: Invoice[]) {
  return invoices.reduce((sum, invoice) => sum + invoice.total, 0);
}

function categories(invoice: Invoice) {
  return Array.from(new Set((invoice.lineItems ?? []).map((item) => item.category).filter(Boolean)));
}

function score(opportunity: RevenueOpportunity) {
  const urgencyBoost = opportunity.urgency === "high" ? 1.25 : opportunity.urgency === "medium" ? 1.1 : 1;
  const confidenceBoost = opportunity.confidence === "high" ? 1.18 : opportunity.confidence === "medium" ? 1 : 0.82;
  return (opportunity.expectedRevenueImpact + opportunity.expectedCashFlowImpact * 0.7) * urgencyBoost * confidenceBoost;
}

function dedupe(opportunities: RevenueOpportunity[]) {
  const seen = new Set<string>();
  return opportunities.filter((opportunity) => {
    const key = `${opportunity.type}-${opportunity.contactId ?? opportunity.serviceCategory}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

function shortDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short"
  });
}
