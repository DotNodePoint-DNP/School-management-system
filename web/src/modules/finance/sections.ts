export const financeSections = [
  { slug: "qr-payments", label: "QR payments", permissions: ["fees:qr-review", "fees:qr-manage"] },
  {
    slug: "fiscal-years",
    label: "Fiscal years",
    permissions: ["fees:read", "fees:fiscal-manage"],
  },
  {
    slug: "fee-heads",
    label: "Fee heads",
    permissions: ["fees:read", "fees:structure-manage"],
  },
  {
    slug: "billing",
    label: "Billing setup",
    permissions: ["fees:read", "fees:structure-manage"],
  },
  {
    slug: "student-fees",
    label: "Student fees",
    permissions: [
      "fees:read",
      "fees:assign",
      "fees:discount-create",
      "fees:discount-approve",
    ],
  },
  {
    slug: "invoices",
    label: "Invoices",
    permissions: [
      "fees:invoice-generate",
      "fees:read",
      "fees:invoice-void",
      "fees:adjust",
      "fees:adjust-approve",
    ],
  },
  {
    slug: "payments",
    label: "Payments",
    permissions: [
      "fees:payment-record",
      "fees:read",
      "fees:payment-reverse",
      "fees:payment-reverse-closed",
      "fees:refund-approve",
      "fees:print",
    ],
  },
  {
    slug: "reports",
    label: "Reports and day close",
    permissions: ["fees:reports", "fees:day-close", "fees:day-reopen"],
  },
  {
    slug: "late-fees",
    label: "Late fees",
    permissions: ["fees:read", "fees:late-fee-manage", "fees:late-fee-apply"],
  },
  { slug: "reminders", label: "Fee reminders", permissions: ["fees:remind"] },
  { slug: "documents", label: "Fee documents", permissions: ["fees:print"] },
];
