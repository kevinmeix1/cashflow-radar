from __future__ import annotations

import os
from pathlib import Path
from textwrap import wrap

from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output"
PDF_OUT = OUT / "pdf" / "CashPilot_3_Minute_Demo_Presentation.pdf"
SCREENSHOT_DIR = OUT / "screenshots"

SLIDE_W, SLIDE_H = landscape((13.333 * inch, 7.5 * inch))

BG = colors.HexColor("#050817")
PANEL = colors.HexColor("#0d1024")
PANEL_2 = colors.HexColor("#10162d")
TEXT = colors.HexColor("#f5f7ff")
MUTED = colors.HexColor("#9aa4c7")
TEAL = colors.HexColor("#41d8c5")
PURPLE = colors.HexColor("#6d6cff")
PINK = colors.HexColor("#ff4d6d")
AMBER = colors.HexColor("#f5b64c")


def draw_wrapped(c: canvas.Canvas, text: str, x: float, y: float, width_chars: int, leading: float, font: str, size: int, color=TEXT):
    c.setFillColor(color)
    c.setFont(font, size)
    cursor = y
    for paragraph in text.split("\n"):
        lines = wrap(paragraph, width=width_chars) or [""]
        for line in lines:
            c.drawString(x, cursor, line)
            cursor -= leading
        cursor -= leading * 0.35
    return cursor


def draw_label(c: canvas.Canvas, text: str, x: float, y: float, color=TEAL):
    c.setFillColor(color)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y, text.upper())


def draw_title(c: canvas.Canvas, title: str, subtitle: str | None = None):
    draw_label(c, "Xero Hackathon 2026", 0.55 * inch, SLIDE_H - 0.58 * inch)
    c.setFillColor(TEXT)
    c.setFont("Helvetica-Bold", 34)
    c.drawString(0.55 * inch, SLIDE_H - 1.08 * inch, title)
    if subtitle:
        draw_wrapped(c, subtitle, 0.58 * inch, SLIDE_H - 1.48 * inch, 86, 14, "Helvetica", 11, MUTED)


def draw_footer(c: canvas.Canvas, page: int, timing: str):
    c.setFillColor(colors.HexColor("#111833"))
    c.roundRect(0.55 * inch, 0.28 * inch, 1.45 * inch, 0.32 * inch, 8, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(1.275 * inch, 0.39 * inch, timing)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawRightString(SLIDE_W - 0.55 * inch, 0.39 * inch, f"CashPilot demo - {page}/8")


def draw_card(c: canvas.Canvas, x: float, y: float, w: float, h: float, title: str, body: str, accent=PURPLE):
    c.setFillColor(PANEL)
    c.setStrokeColor(colors.HexColor("#20284b"))
    c.roundRect(x, y, w, h, 12, fill=1, stroke=1)
    c.setFillColor(accent)
    c.roundRect(x, y, 0.06 * inch, h, 4, fill=1, stroke=0)
    c.setFillColor(TEXT)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(x + 0.22 * inch, y + h - 0.35 * inch, title)
    draw_wrapped(c, body, x + 0.22 * inch, y + h - 0.65 * inch, 44, 13, "Helvetica", 10, MUTED)


def draw_screenshot(c: canvas.Canvas, name: str, x: float, y: float, w: float, h: float):
    path = SCREENSHOT_DIR / name
    c.setFillColor(PANEL_2)
    c.setStrokeColor(colors.HexColor("#20284b"))
    c.roundRect(x - 0.04 * inch, y - 0.04 * inch, w + 0.08 * inch, h + 0.08 * inch, 14, fill=1, stroke=1)
    c.drawImage(str(path), x, y, width=w, height=h, preserveAspectRatio=True, anchor="c")


def draw_pill(c: canvas.Canvas, text: str, x: float, y: float, color=TEAL):
    c.setFillColor(colors.Color(color.red, color.green, color.blue, alpha=0.15))
    c.setStrokeColor(colors.Color(color.red, color.green, color.blue, alpha=0.45))
    width = max(1.1 * inch, len(text) * 4.8)
    c.roundRect(x, y, width, 0.3 * inch, 8, fill=1, stroke=1)
    c.setFillColor(color)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(x + width / 2, y + 0.105 * inch, text)
    return x + width + 0.12 * inch


def slide_1(c: canvas.Canvas):
    draw_title(c, "CashPilot", "AI revenue and cash-flow agent for Xero-powered small businesses.")
    c.setFont("Helvetica-Bold", 20)
    c.setFillColor(TEXT)
    c.drawString(0.6 * inch, 4.95 * inch, "What should I do today to grow revenue and avoid a cash crunch?")
    draw_wrapped(
        c,
        "CashPilot reads Xero data, forecasts the next 30-90 days, detects revenue leaks, maps messy external sales records, and queues owner-approved actions.",
        0.62 * inch,
        4.48 * inch,
        68,
        16,
        "Helvetica",
        13,
        MUTED,
    )
    draw_card(c, 0.65 * inch, 1.45 * inch, 3.4 * inch, 1.25 * inch, "Forecast", "Baseline breach on 18 Jul. After actions: no breach.", PINK)
    draw_card(c, 4.25 * inch, 1.45 * inch, 3.4 * inch, 1.25 * inch, "Revenue", "GBP 25,460 revenue upside from Xero-backed opportunities.", TEAL)
    draw_card(c, 7.85 * inch, 1.45 * inch, 3.9 * inch, 1.25 * inch, "Approval", "18 actions across cash, growth, productivity, and integrations.", PURPLE)
    draw_footer(c, 1, "0:00-0:20")


def slide_2(c: canvas.Canvas):
    draw_title(c, "Small Business Pain", "Owners do not need another chart. They need the next best action.")
    draw_card(c, 0.7 * inch, 4.25 * inch, 3.55 * inch, 1.15 * inch, "Pain 1", "Closed-won work is not always invoiced quickly.", PINK)
    draw_card(c, 0.7 * inch, 2.75 * inch, 3.55 * inch, 1.15 * inch, "Pain 2", "Cash can look fine until one bill and one late payer collide.", AMBER)
    draw_card(c, 0.7 * inch, 1.25 * inch, 3.55 * inch, 1.15 * inch, "Pain 3", "Integrations break when company names and fields are messy.", PURPLE)
    draw_screenshot(c, "01_overview.jpg", 4.65 * inch, 1.15 * inch, 7.9 * inch, 4.45 * inch)
    draw_footer(c, 2, "0:20-0:40")


def slide_3(c: canvas.Canvas):
    draw_title(c, "Xero Is The System Of Record", "External signals create possibilities. Xero verifies whether they are real and actionable.")
    endpoints = [
        "GET /Contacts",
        "GET /Invoices",
        "GET /Payments",
        "GET /BankTransactions",
        "GET /RepeatingInvoices",
        "GET /Reports/BankSummary",
        "GET /Reports/AgedReceivablesByContact",
        "GET /Reports/ProfitAndLoss",
    ]
    x, y = 0.75 * inch, 4.75 * inch
    for endpoint in endpoints:
        x = draw_pill(c, endpoint, x, y, TEAL if "Reports" not in endpoint else PURPLE)
        if x > 5.5 * inch:
            x = 0.75 * inch
            y -= 0.48 * inch
    draw_wrapped(
        c,
        "OAuth scopes include offline_access plus granular accounting scopes for invoices, contacts, payments, bank transactions, reports, and settings. Demo mode mirrors the live API shape when login is unavailable.",
        0.78 * inch,
        2.48 * inch,
        54,
        14,
        "Helvetica",
        11,
        MUTED,
    )
    draw_screenshot(c, "04_xero_footprint.jpg", 6.1 * inch, 1.03 * inch, 6.55 * inch, 4.95 * inch)
    draw_footer(c, 3, "0:40-1:00")


def slide_4(c: canvas.Canvas):
    draw_title(c, "Vibe Integrator: Smart Mapping", "CashPilot handles messy CRM/e-commerce records before they become missed revenue.")
    draw_screenshot(c, "02_smart_mapping.jpg", 0.65 * inch, 1.05 * inch, 7.1 * inch, 4.75 * inch)
    draw_card(c, 8.05 * inch, 4.45 * inch, 4.25 * inch, 1.2 * inch, "Demo Story", "CRM has Brightside Studio Ltd. Xero has Brightside Studios.", PURPLE)
    draw_card(c, 8.05 * inch, 3.0 * inch, 4.25 * inch, 1.2 * inch, "AI Mapping", "Name normalisation plus email-domain evidence gives 98% confidence.", TEAL)
    draw_card(c, 8.05 * inch, 1.55 * inch, 4.25 * inch, 1.2 * inch, "Human Review", "Owner can approve, reject, or create a new Xero contact.", AMBER)
    draw_footer(c, 4, "1:00-1:25")


def slide_5(c: canvas.Canvas):
    draw_title(c, "Revenue Leak Detector", "Closed-won, not invoiced is the killer moment.")
    draw_screenshot(c, "05_revenue_actions.jpg", 5.35 * inch, 1.02 * inch, 7.0 * inch, 4.9 * inch)
    draw_card(c, 0.7 * inch, 4.55 * inch, 4.15 * inch, 1.1 * inch, "Signal", "CRM-DEAL-6500 is closed-won for GBP 6,500.", TEAL)
    draw_card(c, 0.7 * inch, 3.15 * inch, 4.15 * inch, 1.1 * inch, "Xero Check", "No similar Xero invoice exists for the matched contact, amount, and close-date window.", PURPLE)
    draw_card(c, 0.7 * inch, 1.75 * inch, 4.15 * inch, 1.1 * inch, "Action", "Create a draft Xero invoice and queue owner-approved outreach.", PINK)
    draw_footer(c, 5, "1:25-1:50")


def slide_6(c: canvas.Canvas):
    draw_title(c, "Forecast Intelligence", "The app explains why cash changes, not only where the line goes.")
    draw_screenshot(c, "03_forecast_intelligence.jpg", 0.65 * inch, 0.9 * inch, 7.35 * inch, 4.62 * inch)
    draw_wrapped(
        c,
        "Monte Carlo in plain English: CashPilot simulates many realistic payment-timing futures. The crunch probability is how often cash falls below the safe line.",
        8.38 * inch,
        5.15 * inch,
        43,
        15,
        "Helvetica-Bold",
        12,
        TEXT,
    )
    draw_card(c, 8.35 * inch, 2.9 * inch, 3.95 * inch, 0.95 * inch, "Main Risk", "Supplier payment timing creates the cash pressure.", AMBER)
    draw_card(c, 8.35 * inch, 1.68 * inch, 3.95 * inch, 0.95 * inch, "Control Lever", "Revenue opportunity pipeline is the strongest controllable lift.", TEAL)
    draw_footer(c, 6, "1:50-2:15")


def slide_7(c: canvas.Canvas):
    draw_title(c, "Human Approval And Audit", "Proactive does not mean reckless.")
    draw_screenshot(c, "06_audit_log.jpg", 5.15 * inch, 1.0 * inch, 7.2 * inch, 4.95 * inch)
    draw_card(c, 0.7 * inch, 4.45 * inch, 3.95 * inch, 1.05 * inch, "Approval Queue", "Owner reviews tone, timing, tax/VAT details, and commercial context.", PURPLE)
    draw_card(c, 0.7 * inch, 3.08 * inch, 3.95 * inch, 1.05 * inch, "Traceability", "Audit entries keep external and Xero source IDs together.", TEAL)
    draw_card(c, 0.7 * inch, 1.72 * inch, 3.95 * inch, 1.05 * inch, "Safe Writeback", "Draft invoices and contact notes are future write actions after approval.", PINK)
    draw_footer(c, 7, "2:15-2:40")


def slide_8(c: canvas.Canvas):
    draw_title(c, "Bounty Fit And Close", "CashPilot combines data analysis and autonomous action with Xero at the centre.")
    draw_card(c, 0.72 * inch, 4.55 * inch, 3.75 * inch, 1.0 * inch, "Revenue Growth", "Predict late payments, detect missed invoices, find upsells and subscriptions.", TEAL)
    draw_card(c, 4.78 * inch, 4.55 * inch, 3.75 * inch, 1.0 * inch, "Productivity", "Automate receipts, reconciliation, duplicate bills, and contractor payment prep.", PURPLE)
    draw_card(c, 8.84 * inch, 4.55 * inch, 3.75 * inch, 1.0 * inch, "Vibe Integrator", "Adaptively map messy CRM, e-commerce, SaaS, and spreadsheet data into Xero.", AMBER)
    draw_wrapped(
        c,
        "Closing line: CashPilot turns Xero from a record of what happened into an approved action plan for what should happen next.",
        1.05 * inch,
        3.0 * inch,
        92,
        18,
        "Helvetica-Bold",
        18,
        TEXT,
    )
    draw_wrapped(
        c,
        "Demo checklist: show baseline breach, Brightside mapping, missing invoice recommendation, 3D forecast intelligence, Xero API footprint, approval queue, and audit log.",
        1.05 * inch,
        2.0 * inch,
        96,
        14,
        "Helvetica",
        12,
        MUTED,
    )
    draw_footer(c, 8, "2:40-3:00")


def build_pdf():
    PDF_OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(PDF_OUT), pagesize=(SLIDE_W, SLIDE_H))
    for page, slide in enumerate([slide_1, slide_2, slide_3, slide_4, slide_5, slide_6, slide_7, slide_8], start=1):
        c.setFillColor(BG)
        c.rect(0, 0, SLIDE_W, SLIDE_H, fill=1, stroke=0)
        c.setFillColor(colors.Color(0.43, 0.42, 1, alpha=0.12))
        c.circle(SLIDE_W - 1.0 * inch, SLIDE_H - 0.6 * inch, 2.4 * inch, fill=1, stroke=0)
        c.setFillColor(colors.Color(0.25, 0.85, 0.77, alpha=0.08))
        c.circle(1.0 * inch, 0.15 * inch, 2.0 * inch, fill=1, stroke=0)
        slide(c)
        c.showPage()
    c.save()
    print(PDF_OUT)


if __name__ == "__main__":
    build_pdf()
