# CashPilot

CashPilot is an AI revenue and cash-flow agent for Xero. It helps a small business owner answer the daily operating question:

> What should I do today to increase revenue and avoid a future cash crunch?

The app reads Xero accounting records, forecasts the next 30-90 days, detects revenue leaks, maps messy external sales data back to Xero contacts, and queues human-approved actions such as invoice follow-ups, draft invoices, supplier timing changes, and integration sync tasks.

## Core Demo Story

Northstar Design Studio has a CRM deal called `Brightside Studio Ltd - Conversion Sprint` for GBP 6,500. In Xero, the customer is called `Brightside Studios`. A rigid integration would miss the match.

CashPilot:

1. Normalises and matches `Brightside Studio Ltd` to the Xero contact `Brightside Studios`.
2. Checks Xero invoices and finds no matching invoice for the closed-won deal.
3. Creates a revenue-leak recommendation: draft a Xero invoice for GBP 6,500.
4. Shows the cash impact in the forecast and the approval queue.
5. Logs the source IDs `CRM-DEAL-6500` and `contact-bright` in the audit log.

## What It Builds

- Cash-flow forecast with 30, 60, and 90 day horizons.
- Monte Carlo crunch probability shown as a simple risk percentage.
- Forecast explainability with ranked business drivers, model cards, and sensitivity analysis.
- Revenue Leak Detector for closed-won-not-invoiced, dormant customers, upsell, subscription conversion, late payment recovery, and underperforming services.
- Smart Mapping Review for CRM/e-commerce records that do not perfectly match Xero names.
- Human approval queue for cash actions, growth actions, productivity automations, and integration syncs.
- Audit log with source-record traceability for every approved recommendation.
- Xero API footprint panel showing the Accounting API endpoints, scopes, SDK, MCP, and agent-toolkit pattern.

## Bounty Fit

**Revenue and Cash Flow Growth**
CashPilot analyses Xero accounting data, surfaces actionable revenue opportunities, and recommends proactive steps to improve cash flow.

**Small Business Productivity Powerhouse**
CashPilot automates painful workflows such as receipt-to-expense, invoice reconciliation, duplicate bill checks, contractor payment prep, and subscription expense control, with human approval.

**Vibe Integrator**
CashPilot connects Xero with messy CRM, e-commerce, payments, SaaS, and spreadsheet records. The AI-style mapping layer interprets names, fields, amounts, and missing data instead of relying on brittle exact-match rules.

## Xero Integration

The live path uses Xero OAuth 2.0 through the official `xero-node` SDK. The app can run in seeded demo mode when Xero login is unavailable, but the data model, endpoints, and UI are built around Xero as the system of record.

### OAuth Scopes

```text
openid
profile
email
offline_access
accounting.invoices
accounting.invoices.read
accounting.payments.read
accounting.banktransactions.read
accounting.reports.aged.read
accounting.reports.balancesheet.read
accounting.reports.profitandloss.read
accounting.reports.trialbalance.read
accounting.contacts
accounting.contacts.read
accounting.settings
accounting.settings.read
accounting.reports.read
```

### Accounting API Endpoints

```text
GET /connections
GET /Organisations
GET /Contacts?summaryOnly=true
GET /Invoices?Statuses=AUTHORISED,PAID
GET /Accounts
GET /Items
GET /Payments
GET /Quotes
GET /BankTransactions
GET /RepeatingInvoices
GET /TrackingCategories
GET /Reports/BankSummary
GET /Reports/ProfitAndLoss
GET /Reports/BalanceSheet
GET /Reports/TrialBalance
GET /Reports/AgedReceivablesByContact
GET /Reports/AgedPayablesByContact
```

The approval queue is deliberately read-first for the hackathon demo. Approved actions describe the planned writeback, such as creating a draft invoice or contact note, but do not send messages or mutate live accounting data without owner confirmation.

## Agent and Model Design

CashPilot separates numeric calculation from agent reasoning:

- Deterministic code handles forecasting, Monte Carlo simulation, payment-delay scoring, smart matching, and ranking.
- The OpenAI Agents SDK path is used for CFO narrative and agent orchestration when `OPENAI_API_KEY` is configured.
- The Xero MCP bridge is scaffolded through `@xeroapi/xero-mcp-server`.
- The agent-toolkit pattern follows `XeroAPI/xero-agent-toolkit`: central provider, OAuth token handling, scoped Xero tools, and human-approved writes.

## Tech Stack

- React 19 + Vite frontend
- Express + TypeScript backend
- `xero-node` official Xero SDK
- `@openai/agents` for narrative orchestration
- Optional Xero MCP bridge
- Recharts and SVG for forecast visualisation
- Lightweight TypeScript tests with `tsx`

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open:

```text
http://127.0.0.1:5173/?source=xero
```

## Environment

```env
OPENAI_API_KEY=
XERO_DEMO_AUTH=false
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=
XERO_REDIRECT_URI=http://localhost:8787/auth/xero/callback
XERO_TENANT_ID=
XERO_TOKEN_PATH=.cashpilot/xero-token.json
XERO_USE_DEMO_ON_API_FAILURE=true
XERO_MCP_ENABLED=false
XERO_MCP_COMMAND=npx
XERO_MCP_PACKAGE=@xeroapi/xero-mcp-server@latest
XERO_CLIENT_BEARER_TOKEN=
XERO_SCOPES=
PORT=8787
```

For hackathon demos where Xero login is unavailable, set `XERO_DEMO_AUTH=true`. The app then presents the seeded Xero-style data as a connected local "Xero Demo Company" while still labelling the path as demo mode.

## Scripts

```bash
pnpm dev        # run Vite UI and Express API
pnpm test       # run CashPilot core model tests
pnpm typecheck  # TypeScript validation
pnpm build      # production build
pnpm preview    # preview built frontend
```

## Docs

- [Architecture](docs/architecture.md)
- [Design Decisions](docs/decisions.md)
- [Demo Script](docs/demo_script.md)
- [User Guide](docs/USER_GUIDE.md)
- [Developer and Xero Setup](docs/DEVELOPER_GUIDE.md)
- [Hackathon Submission Notes](docs/HACKATHON_SUBMISSION.md)

## Safety Model

CashPilot is intentionally human-in-the-loop. It does not send customer messages, alter invoices, create quotes, or delay bills automatically. Approved actions are queued with Xero evidence, execution intent, and a human-control note.
