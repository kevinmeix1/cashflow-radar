# Developer and Xero Setup

## Local Development

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Frontend:

```text
http://127.0.0.1:5173/
```

Backend:

```text
http://127.0.0.1:8787/
```

## Xero OAuth Setup

1. Sign up or log in at the Xero Developer portal.
2. Enable the Xero demo company.
3. Create an OAuth 2.0 app using the standard Auth Code flow.
4. Use this redirect URI:

```text
http://localhost:8787/auth/xero/callback
```

5. Copy the Client ID and Client Secret into `.env`:

```env
XERO_CLIENT_ID=your_client_id
XERO_CLIENT_SECRET=your_client_secret
XERO_REDIRECT_URI=http://localhost:8787/auth/xero/callback
```

6. Restart the dev server:

```bash
pnpm dev
```

7. In the app, click **Connect Xero** and choose the demo company.

## API Routes

- `GET /api/health`
- `GET /api/dashboard?source=demo`
- `GET /api/dashboard?source=xero`
- `GET /api/integrations/xero/status`
- `GET /auth/xero/start`
- `GET /auth/xero/callback`
- `POST /api/actions/approve`

## Data Flow

```text
Xero OAuth/API or seeded snapshot
  -> data quality checks
  -> deterministic cash-flow forecast
  -> Monte Carlo crunch probability
  -> revenue opportunity engine
  -> cash action ranking
  -> optional OpenAI Agents SDK narrative
  -> dashboard approval queue
```

## Agent Layer

When `OPENAI_API_KEY` is set, the app uses OpenAI Agents SDK specialists for narrative interpretation:

- Data Quality Agent
- Forecast Agent
- Cash Action Agent
- Revenue Growth Agent
- Communication Agent
- CFO Narrative Agent

If no key is present, deterministic fallback copy is used so the demo still runs.

## Xero MCP Bridge

The project includes optional scaffolding for the Xero MCP server. It is disabled by default:

```env
XERO_MCP_ENABLED=false
XERO_MCP_COMMAND=npx
XERO_MCP_PACKAGE=@xeroapi/xero-mcp-server@latest
```

Enable it only when valid Xero MCP auth is available.

## Verification

```bash
pnpm typecheck
pnpm build
```
