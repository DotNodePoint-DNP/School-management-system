import { createApiClient } from "@/lib/api/client";

export const attendanceClient = () => createApiClient();
export const attendanceId = (id: string) => encodeURIComponent(id);

export function attendanceQuery(
  values: object,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (
      (typeof value === "string" || typeof value === "number") &&
      value !== ""
    ) {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}
