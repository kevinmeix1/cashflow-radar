# Hackathon Submission Notes

## One-Liner

CashFlow Radar turns Xero accounting data into a human-approved revenue and cash-flow action plan.

## Problem

Small businesses do not just need to track money. They need to grow it and avoid painful cash timing surprises.

Most tools show overdue invoices or historical reports. Owners still have to decide:

- who should I chase first?
- which customer is likely to return?
- what offer should I make?
- will this action actually change next month's cash position?

## Solution

CashFlow Radar combines Xero data, deterministic forecasting, revenue-opportunity models, and AI agent narratives to recommend the highest-impact actions.

The product shows a before-vs-after cash forecast so an owner can see whether selected actions prevent a future breach.

## Xero Usage

The app uses Xero as the system of record:

- contacts
- invoices
- invoice line items
- payments
- accounts
- items
- quotes
- bank transactions
- repeating invoices
- tracking categories
- bank summary
- profit and loss
- balance sheet
- trial balance
- aged receivables/payables

The live path uses OAuth 2.0 through the official `xero-node` SDK. Seeded demo data mirrors these Xero records when credentials are unavailable.

## Agentic Layer

The numerical forecast is deterministic. Agents are used for interpretation, planning, and communication:

- explain forecast risk windows
- rank owner priorities
- draft customer and supplier messages
- produce CFO-style narrative
- explain evidence behind each recommended action

## Human Control

No external action is sent automatically. Every item goes through a human approval queue with:

- Xero evidence
- approved execution plan
- human-control note

## Demo Flow

1. Open the dashboard.
2. Show the baseline cash breach date.
3. Show revenue upside from Xero-backed opportunities.
4. Open pending approval and explain the evidence for each action.
5. Toggle actions and show the after-action forecast.
6. Approve selected items to queue reviewed execution.
7. Show Xero API footprint and agent orchestration sections.

## Future Extensions

- Make scenarios for approved outreach/payment workflows.
- Lovable-hosted polished frontend.
- Xero write actions for approved draft quotes, contact notes, and repeating invoice templates.
- Multi-tenant database and authenticated customer workspace.
