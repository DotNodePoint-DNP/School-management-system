import { afterEach, describe, expect, it, vi } from "vitest";
import { formPayload } from "../components/WorkflowFields";
import { requestWorkflow } from "./requests";
import { forms, workflows } from "./workflows";
import { financeSections } from "../sections";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("finance workflow contracts", () => {
  it("every task uses a known DTO and is reachable from its permitted finance section", () => {
    const operations = new Set<string>();
    for (const [section, actions] of Object.entries(workflows)) {
      const permissions = financeSections.find(
        (s) => s.slug === section,
      )?.permissions;
      for (const action of actions) {
        const key = action.method + " " + action.path;
        expect(operations.has(key), key).toBe(false);
        operations.add(key);
        if (action.form) expect(forms[action.form], action.form).toBeDefined();
        for (const p of action.permissions) expect(permissions).toContain(p);
      }
    }
    for (const fields of Object.values(forms))
      for (const field of fields)
        if (field.schema) expect(forms[field.schema]).toBeDefined();
  });
  it("serializes nested allocations, an explicit false and skipped BS months without including display state", () => {
    expect(
      formPayload(forms.RecordPaymentDto, {
        method: "CASH",
        amount: 125,
        allocations: [
          { invoiceId: "invoice", amount: 125, displayName: "Student" },
        ],
      }),
    ).toEqual({
      method: "CASH",
      amount: 125,
      allocations: [{ invoiceId: "invoice", amount: 125 }],
    });
    expect(
      formPayload(forms.GeneratePeriodsDto, {
        months: 10,
        skipBsMonths: "2, 5",
      }),
    ).toEqual({ months: 10, skipBsMonths: [2, 5] });
    expect(
      formPayload(forms.SetLateFeePolicyDto, { enabled: false, graceDays: 0 }),
    ).toEqual({ enabled: false, graceDays: 0 });
  });
  it("substitutes enrollment and assignment references independently and preserves preview totals", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://fixture.example.test");
    const fetcher = vi
      .fn()
      .mockImplementation(async () =>
        Response.json({ success: true, data: {} }),
      );
    vi.stubGlobal("fetch", fetcher);
    const edit = workflows["student-fees"].find(
      (a) => a.label === "Edit assigned charge",
    )!;
    await requestWorkflow(
      edit,
      { enrollmentId: "enroll/a", assignmentId: "charge b" },
      { amount: 25 },
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://fixture.example.test/api/v1/enrollments/enroll%2Fa/fee-assignments/charge%20b",
      expect.objectContaining({ method: "PATCH", body: '{"amount":25}' }),
    );
    const generate = workflows.invoices.find(
      (a) => a.label === "Generate invoices",
    )!;
    const payload = {
      kind: "ADMISSION",
      all: true,
      expect: { count: 2, netTotal: 1250 },
    };
    await requestWorkflow(generate, {}, payload);
    expect(fetcher).toHaveBeenLastCalledWith(
      "https://fixture.example.test/api/v1/invoices/generate",
      expect.objectContaining({ body: JSON.stringify(payload) }),
    );
  });
});
