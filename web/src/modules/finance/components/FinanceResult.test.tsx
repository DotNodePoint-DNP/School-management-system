import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { FinanceResult } from "./FinanceResult";

it("presents financial figures and business references while hiding internal keys in nested results", () => {
  const id = "019cee12-a3d0-731e-9828-8548f21f6201";
  const payment = {
    id,
    receiptNo: "R-2083-000042",
    amount: 3750.25,
    requestKey: id,
    allocatedBy: id,
    student: { id, name: "Asha Sharma", admissionNo: "1042" },
    allocations: [{ invoiceId: id, invoice: { id, number: "INV-2083-19" } }],
    reference: "BANK-8651",
  };
  for (const value of [
    payment,
    { items: [payment], meta: { page: 1, totalPages: 1, total: 1 } },
  ]) {
    const html = renderToStaticMarkup(<FinanceResult value={value} />);
    for (const text of [
      "R-2083-000042",
      "INV-2083-19",
      "NPR 3,750.25",
      "Asha Sharma",
      "1042",
      "BANK-8651",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain(id);
    expect(html).not.toContain("Request key");
  }
});
