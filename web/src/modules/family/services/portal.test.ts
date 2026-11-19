import { afterEach, expect, it, vi } from "vitest";
import {
  childRegister,
  childSummary,
  familyDocument,
  familyTransaction,
} from "./portal";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function transport(data: unknown, meta?: unknown) {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://school.example.test");
  const fetcher = vi.fn(async () =>
    Response.json({ success: true, data, meta }),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

it("retains page metadata and child scope when a parent filters outstanding invoices", async () => {
  const meta = { page: 2, pageSize: 10, total: 12, totalPages: 2 };
  const fetcher = transport([{ id: "invoice-two" }], meta);
  await expect(
    childRegister("child/a", "invoices", "?page=2&pageSize=10&status=OPEN"),
  ).resolves.toEqual({ items: [{ id: "invoice-two" }], meta });
  expect(fetcher).toHaveBeenCalledWith(
    "https://school.example.test/api/v1/portal/children/child%2Fa/invoices?page=2&pageSize=10&status=OPEN",
    expect.any(Object),
  );
});

it("uses the selected child's enrollment for historical attendance", async () => {
  const fetcher = transport({});
  await childSummary(
    "child",
    "attendance",
    "?enrollmentId=old&from=2025-08-01&to=2025-08-15",
  );
  expect(fetcher).toHaveBeenCalledWith(
    "https://school.example.test/api/v1/portal/children/child/attendance?enrollmentId=old&from=2025-08-01&to=2025-08-15",
    expect.any(Object),
  );
});

it("reads and prints a parent receipt through the parent endpoints", async () => {
  const fetcher = transport({});
  await familyTransaction("payments", "receipt/a");
  expect(fetcher).toHaveBeenCalledWith(
    "https://school.example.test/api/v1/portal/payments/receipt%2Fa",
    expect.any(Object),
  );
  await familyDocument("receipt", { paymentId: "receipt/a" });
  expect(fetcher).toHaveBeenLastCalledWith(
    "https://school.example.test/api/v1/portal/print/receipt",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ paymentId: "receipt/a" }),
    }),
  );
});
