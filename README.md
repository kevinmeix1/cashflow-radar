# CashFlow Radar

CashFlow Radar is a Xero-powered revenue and cash-flow action cockpit for small businesses.

Most accounting tools tell owners what already happened. CashFlow Radar uses Xero invoices, contacts, payments, bills, reports, and line items to answer a more urgent question:

> What should I do today to grow revenue and avoid a future cash crunch?

The app forecasts the next 30-90 days, detects risk windows, finds revenue opportunities, and queues agent-drafted actions for human approval.

## What It Does

- Forecasts daily cash position across 30, 60, and 90 day horizons.
- Detects future cash crunches before they happen.
- Finds revenue opportunities from Xero activity:
  - dormant high-value customers
  - upsell and cross-sell opportunities
  - repeat-purchase subscription conversions
  - late-payment recovery
  - underperforming service/package fixes
- Shows a before-vs-after forecast when recommended actions are selected.
- Drafts customer and supplier messages with human approval.
- Explains every action with Xero-backed evidence and an approval plan.

## Why It Matters

Small business owners often know they have overdue invoices, but not which action will move the business most. CashFlow Radar ranks actions by impact and turns accounting records into a controlled operating plan:

- who to chase
- what offer to send
- which invoice or bill is driving risk
- whether an early-payment incentive is worth it
- which repeat customers could become recurring revenue

## Tech Stack

- React + Vite frontend
- Express + TypeScript backend
- `xero-node` official Xero Accounting SDK
- OpenAI Agents SDK for narrative/agent orchestration when `OPENAI_API_KEY` is configured
- Optional Xero MCP bridge scaffolding via `@xeroapi/xero-mcp-server`
- Deterministic forecast, ranking, and revenue-opportunity engines

## Xero Integration

The app has a full OAuth path for live Xero data:

- `GET /auth/xero/start`
- `GET /auth/xero/callback`
- token storage under `.cashflow-radar/`
- Xero Accounting API reads for invoices, contacts, accounts, items, payments, quotes, bank transactions, repeating invoices, tracking categories, and reports

Without Xero credentials, the app runs on a seeded demo snapshot that mirrors realistic Xero records.

For hackathon demos where Xero login is unavailable, set `XERO_DEMO_AUTH=true`. This presents the seeded Xero-style data as a connected local "Xero Demo Company" while clearly labelling it as demo mode.

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
XERO_TOKEN_PATH=.cashflow-radar/xero-token.json
XERO_USE_DEMO_ON_API_FAILURE=true
XERO_MCP_ENABLED=false
XERO_MCP_COMMAND=npx
XERO_MCP_PACKAGE=@xeroapi/xero-mcp-server@latest
XERO_CLIENT_BEARER_TOKEN=
XERO_SCOPES=
PORT=8787
```

## Guides

- [User Guide](docs/USER_GUIDE.md)
- [Developer and Xero Setup](docs/DEVELOPER_GUIDE.md)
- [Hackathon Submission Notes](docs/HACKATHON_SUBMISSION.md)

## Scripts

```bash
pnpm dev        # run Vite UI and Express API
pnpm typecheck  # TypeScript validation
pnpm build      # production build
pnpm preview    # preview built frontend
```

## Safety Model

CashFlow Radar is intentionally human-in-the-loop. It does not send customer messages, alter invoices, create quotes, or delay bills automatically. Approved actions are queued for reviewed execution.
