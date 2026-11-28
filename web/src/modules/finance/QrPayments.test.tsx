import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { FamilyQr, FinanceQr } from "./QrPayments";

it("shows the full balance and tracking number while a parent's transfer awaits verification", () => {
  const client = new QueryClient();
  const childId = "child-1";
  client.setQueryData(["qr", "options", childId], {
    qr: { id: "qr-1", merchant: "School" },
    dues: {
      student: { name: "Asha Sharma", admissionNo: "1042" },
      outstanding: 8000,
      invoices: [
        {
          id: "invoice",
          number: "INV-1",
          period: "Tuition",
          outstanding: 8000,
        },
      ],
    },
  });
  client.setQueryData(
    ["qr", "claims", "/portal/children/child-1/qr", "", "", 1],
    {
      items: [
        {
          id: "claim-tracking-id", trackingNumber:42,
          amount: "3000",
          status: "PENDING",
          transferredOn: "2026-11-28",
          student: {
            firstName: "Asha",
            lastName: "Sharma",
            admissionNo: "1042",
          },
          guardian: { firstName: "Maya", lastName: "Sharma" },
          qr: { merchant: "School" },
          payment: null,
          events: [],
          allocations: [
            { amount: "3000", invoice: { number: "INV-1" }, outstanding: 8000 },
          ],
        },
      ],
      meta: { totalPages: 1 },
    },
  );
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <FamilyQr childId={childId} />
    </QueryClientProvider>,
  );
  for (const label of [
    "NPR 8,000",
    "Awaiting verification",
    "QR-000042",
    "Asha Sharma",
    "Maya Sharma",
    "1042",
  ])
    expect(html).toContain(label);
  expect(html).not.toContain("claim-tracking-id");
  expect(html).not.toContain("Approve payment");
  client.clear();
});
it("separates merchant setup and transfer review permissions", () => {
  const client = new QueryClient();
  const screen = (permission: string) =>
    renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <FinanceQr permissions={[permission]} />
      </QueryClientProvider>,
    );
  expect(screen("fees:qr-manage")).toContain("Publish QR");
  expect(screen("fees:qr-manage")).not.toContain("Review transfers");
  expect(screen("fees:qr-review")).toContain("Review transfers");
  expect(screen("fees:qr-review")).not.toContain("Publish QR");
  client.clear();
});
