# CashPilot Demo Script

## 30 Second Pitch

CashPilot is an AI revenue and cash-flow agent for Xero. Most tools tell small businesses what already happened. CashPilot uses Xero data to forecast what is about to happen, finds revenue opportunities, and queues the highest-impact actions for human approval.

## Demo Walkthrough

### 1. Start With The Pain

"A small business owner does not just need to know an invoice is overdue. They need to know whether cash becomes dangerous next month, which customer or supplier action changes that forecast, and what to do today."

Point to:

- Baseline breach date
- Cash crunch probability
- After-actions result
- Protected cash

### 2. Show Xero As The Core

"CashPilot uses Xero as the accounting system of record. It reads contacts, invoices, payments, bills, bank transactions, repeating invoices, tracking categories, and reports."

Point to:

- Xero API footprint panel
- endpoint list
- scopes
- SDK/MCP/toolkit status

Say:

"The demo can run without live login, but the data contract and integration path are Xero-first."

### 3. Show Smart Mapping Review

"Here is where the Vibe Integrator bounty comes in. Real business data is messy. The CRM says `Brightside Studio Ltd`, but Xero has `Brightside Studios`."

Point to:

- Smart Mapping Review
- confidence score
- evidence chips
- source system and record type

Say:

"CashPilot does not trust exact matching. It normalises names, checks email-domain evidence, and asks for human approval when the match matters."

### 4. Show Revenue Leak Detector

"Because that deal is closed-won and no matching Xero invoice exists, CashPilot finds a revenue leak."

Point to:

- `Invoice closed-won Conversion Sprint`
- GBP 6,500 expected revenue
- matched Xero contact
- evidence containing `CRM-DEAL-6500`

Say:

"This is not generic advice. It is a specific action grounded in external sales data and verified against Xero."

### 5. Show Forecast Intelligence

"The forecast is not just a chart. CashPilot explains the business factors moving cash."

Point to:

- cash risk fan chart
- model cards
- cash drivers
- sensitivity notes

Explain Monte Carlo simply:

"We simulate many realistic payment-timing futures. If the dashboard says 72 percent crunch probability, it means 72 out of 100 simulated futures fell below the safe cash line."

### 6. Show Approval Queue

"Every recommendation has an approval plan. The owner can review the evidence, edit the message, and decide what should happen."

Point to:

- cash-flow actions
- revenue actions
- productivity automations
- integration candidates
- human-control note

Say:

"The app is proactive, but not reckless. No message or accounting writeback happens without approval."

### 7. Approve Actions

Click `Approve`.

Say:

"Approved items are queued for execution and logged with source IDs."

### 8. Show Audit Log

Point to:

- `REVENUE_RECOMMENDATION_APPROVED`
- `CRM-DEAL-6500`
- `contact-bright`
- status transition

Say:

"This matters for trust. A business owner can see where the recommendation came from and what decision was made."

## Submission Form Language

### What We Built

CashPilot, an AI revenue and cash-flow agent for Xero that forecasts cash risk, detects revenue leaks, maps messy external sales data to Xero records, and queues owner-approved actions.

### How We Use Xero API

Xero is the system of record for contacts, invoices, payments, bank transactions, bills, items, repeating invoices, tracking categories, and reports. CashPilot reads those records through OAuth 2.0 and the official `xero-node` SDK, then uses them to validate revenue opportunities, forecast cash, rank actions, and provide audit evidence.

### Development Platform

React, Vite, TypeScript, Express, Xero Node SDK, OpenAI Agents SDK, optional Xero MCP server, Recharts, and SVG forecast visualisation.

### Tracks

- Revenue and Cash Flow Growth
- Small Business Productivity Powerhouse
- Vibe Integrator
