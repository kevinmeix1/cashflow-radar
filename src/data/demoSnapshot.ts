import type { XeroSnapshot } from "../types/domain";

export const demoSnapshot: XeroSnapshot = {
  organisationName: "Northstar Design Studio",
  currency: "GBP",
  asOfDate: "2026-07-04",
  openingCashBalance: 12600,
  safeCashThreshold: 5000,
  contacts: [
    {
      id: "contact-acme",
      name: "Acme Retail Group",
      kind: "customer",
      email: "ap@acmeretail.example",
      medianDaysLate: 16,
      paymentReliability: 0.74,
      relationshipSensitivity: "low",
      notes: "Usually pays after one reminder. High-value repeat customer."
    },
    {
      id: "contact-bright",
      name: "Bright Studio",
      kind: "customer",
      email: "finance@brightstudio.example",
      medianDaysLate: 5,
      paymentReliability: 0.86,
      relationshipSensitivity: "medium",
      notes: "Good relationship. Responds well to concise payment links."
    },
    {
      id: "contact-civic",
      name: "Civic Labs",
      kind: "customer",
      email: "ops@civiclabs.example",
      medianDaysLate: 18,
      paymentReliability: 0.58,
      relationshipSensitivity: "high",
      notes: "Newer customer. Avoid aggressive language."
    },
    {
      id: "contact-harbor",
      name: "Harbor Coffee Co",
      kind: "customer",
      email: "founders@harborcoffee.example",
      medianDaysLate: 2,
      paymentReliability: 0.91,
      relationshipSensitivity: "low",
      notes: "Previously bought a high-value brand sprint but has not returned recently."
    },
    {
      id: "contact-luna",
      name: "Luna Fitness",
      kind: "customer",
      email: "ops@lunafitness.example",
      medianDaysLate: 4,
      paymentReliability: 0.88,
      relationshipSensitivity: "low",
      notes: "Repeat buyer with monthly ad-hoc content refresh work."
    },
    {
      id: "contact-apex",
      name: "Apex Architects",
      kind: "customer",
      email: "studio@apexarchitects.example",
      medianDaysLate: 9,
      paymentReliability: 0.76,
      relationshipSensitivity: "medium",
      notes: "Bought web design but not ongoing analytics or conversion work."
    },
    {
      id: "contact-printco",
      name: "PrintCo Supplies",
      kind: "supplier",
      email: "accounts@printco.example",
      medianDaysLate: 0,
      paymentReliability: 0.9,
      relationshipSensitivity: "medium",
      notes: "Has previously accepted short payment extensions."
    },
    {
      id: "contact-cloudlane",
      name: "CloudLane Hosting",
      kind: "supplier",
      email: "billing@cloudlane.example",
      medianDaysLate: 0,
      paymentReliability: 0.95,
      relationshipSensitivity: "high",
      notes: "Critical operating supplier. Avoid delaying."
    },
    {
      id: "contact-payroll",
      name: "Payroll",
      kind: "supplier",
      email: "payroll@northstar.example",
      medianDaysLate: 0,
      paymentReliability: 1,
      relationshipSensitivity: "high",
      notes: "Do not delay payroll."
    }
  ],
  invoices: [
    {
      id: "inv-acme-4012",
      invoiceNumber: "INV-4012",
      type: "ACCREC",
      contactId: "contact-acme",
      issueDate: "2026-06-14",
      dueDate: "2026-07-04",
      amountDue: 4200,
      total: 4200,
      status: "AUTHORISED",
      lineItems: [
        {
          id: "li-acme-campaign",
          description: "Campaign landing page optimisation",
          category: "Conversion",
          quantity: 1,
          unitAmount: 4200,
          lineAmount: 4200
        }
      ]
    },
    {
      id: "inv-bright-4018",
      invoiceNumber: "INV-4018",
      type: "ACCREC",
      contactId: "contact-bright",
      issueDate: "2026-06-26",
      dueDate: "2026-07-21",
      amountDue: 7840,
      total: 7840,
      status: "AUTHORISED",
      lineItems: [
        {
          id: "li-bright-web",
          description: "Website launch package",
          category: "Website",
          quantity: 1,
          unitAmount: 7840,
          lineAmount: 7840
        }
      ]
    },
    {
      id: "inv-civic-3997",
      invoiceNumber: "INV-3997",
      type: "ACCREC",
      contactId: "contact-civic",
      issueDate: "2026-06-04",
      dueDate: "2026-07-01",
      amountDue: 3150,
      total: 3150,
      status: "AUTHORISED",
      lineItems: [
        {
          id: "li-civic-brand",
          description: "Brand messaging workshop",
          category: "Strategy",
          quantity: 1,
          unitAmount: 3150,
          lineAmount: 3150
        }
      ]
    },
    {
      id: "inv-harbor-3820",
      invoiceNumber: "INV-3820",
      type: "ACCREC",
      contactId: "contact-harbor",
      issueDate: "2026-03-02",
      dueDate: "2026-03-16",
      amountDue: 0,
      total: 8400,
      status: "PAID",
      fullyPaidOnDate: "2026-03-18",
      lineItems: [
        {
          id: "li-harbor-brand",
          description: "Brand sprint and launch kit",
          category: "Strategy",
          quantity: 1,
          unitAmount: 8400,
          lineAmount: 8400
        }
      ]
    },
    {
      id: "inv-luna-3898",
      invoiceNumber: "INV-3898",
      type: "ACCREC",
      contactId: "contact-luna",
      issueDate: "2026-04-05",
      dueDate: "2026-04-19",
      amountDue: 0,
      total: 1850,
      status: "PAID",
      fullyPaidOnDate: "2026-04-20",
      lineItems: [
        {
          id: "li-luna-content-apr",
          description: "Monthly content refresh",
          category: "Content",
          quantity: 1,
          unitAmount: 1850,
          lineAmount: 1850
        }
      ]
    },
    {
      id: "inv-luna-3955",
      invoiceNumber: "INV-3955",
      type: "ACCREC",
      contactId: "contact-luna",
      issueDate: "2026-05-05",
      dueDate: "2026-05-19",
      amountDue: 0,
      total: 1950,
      status: "PAID",
      fullyPaidOnDate: "2026-05-22",
      lineItems: [
        {
          id: "li-luna-content-may",
          description: "Monthly content refresh",
          category: "Content",
          quantity: 1,
          unitAmount: 1950,
          lineAmount: 1950
        }
      ]
    },
    {
      id: "inv-luna-4020",
      invoiceNumber: "INV-4020",
      type: "ACCREC",
      contactId: "contact-luna",
      issueDate: "2026-06-05",
      dueDate: "2026-06-19",
      amountDue: 0,
      total: 2100,
      status: "PAID",
      fullyPaidOnDate: "2026-06-22",
      lineItems: [
        {
          id: "li-luna-content-jun",
          description: "Monthly content refresh",
          category: "Content",
          quantity: 1,
          unitAmount: 2100,
          lineAmount: 2100
        }
      ]
    },
    {
      id: "inv-apex-3941",
      invoiceNumber: "INV-3941",
      type: "ACCREC",
      contactId: "contact-apex",
      issueDate: "2026-05-12",
      dueDate: "2026-05-26",
      amountDue: 0,
      total: 5600,
      status: "PAID",
      fullyPaidOnDate: "2026-06-02",
      lineItems: [
        {
          id: "li-apex-web",
          description: "Portfolio website redesign",
          category: "Website",
          quantity: 1,
          unitAmount: 5600,
          lineAmount: 5600
        }
      ]
    },
    {
      id: "bill-printco-188",
      invoiceNumber: "BILL-188",
      type: "ACCPAY",
      contactId: "contact-printco",
      issueDate: "2026-06-20",
      dueDate: "2026-07-18",
      plannedPaymentDate: "2026-07-18",
      amountDue: 2100,
      total: 2100,
      status: "AUTHORISED"
    },
    {
      id: "bill-cloudlane-733",
      invoiceNumber: "BILL-733",
      type: "ACCPAY",
      contactId: "contact-cloudlane",
      issueDate: "2026-06-30",
      dueDate: "2026-07-15",
      plannedPaymentDate: "2026-07-15",
      amountDue: 1800,
      total: 1800,
      status: "AUTHORISED"
    },
    {
      id: "bill-freelancers-077",
      invoiceNumber: "BILL-077",
      type: "ACCPAY",
      contactId: "contact-payroll",
      issueDate: "2026-07-01",
      dueDate: "2026-07-18",
      plannedPaymentDate: "2026-07-18",
      amountDue: 7600,
      total: 7600,
      status: "AUTHORISED"
    }
  ],
  recurringCashFlows: [
    {
      id: "rent",
      label: "Studio rent",
      direction: "outflow",
      amount: 2800,
      nextDate: "2026-07-10",
      cadenceDays: 30,
      category: "Premises"
    },
    {
      id: "software",
      label: "Software subscriptions",
      direction: "outflow",
      amount: 950,
      nextDate: "2026-07-12",
      cadenceDays: 30,
      category: "Operations"
    },
    {
      id: "retainer-wave",
      label: "Monthly support retainer",
      direction: "inflow",
      amount: 3200,
      nextDate: "2026-07-25",
      cadenceDays: 30,
      category: "Revenue"
    }
  ]
};
