import { createApiClient } from "@/lib/api/client";
import type { Workflow } from "./workflows";
export type Values = Record<string, unknown>;

export function resourceKey(path: string, key: string) {
  if (key !== "id") return key;
  const parent = path.split("/:id")[0].split("/").pop();
  const keys: Record<string, string> = {
    enrollments: "enrollmentId",
    invoices: "invoiceId",
    payments: "paymentId",
    students: "studentId",
    discounts: "discountId",
    adjustments: "adjustmentId",
    "day-closes": "dayCloseId",
    "billing-periods": "periodId",
    runs: "runId",
  };
  return keys[parent ?? ""] ?? "id";
}

export async function requestWorkflow(
  action: Workflow,
  refs: Values,
  body: Values,
  override?: string,
): Promise<unknown> {
  const client = createApiClient();
  const path = (override ?? action.path).replace(/:(\w+)/g, (_, k: string) => {
    const id = refs[resourceKey(action.path, k)];
    if (typeof id !== "string" || !id.trim()) {
      throw new Error("Select the record before continuing.");
    }
    return encodeURIComponent(id.trim());
  });
  if (action.method === "get") {
    const params = new URLSearchParams(
      Object.entries(body).map(([k, v]) => [k, String(v)]),
    );
    const url = path + (params.size ? "?" + params : "");
    return action.paged ? client.getPaginated(url) : client.get(url);
  }
  if (action.method === "delete") return client.delete(path);
  return client[action.method](path, body);
}
