import { createApiClient } from "@/lib/api/client";

export const client = () => createApiClient();
export const encodeId = (value: string) => encodeURIComponent(value);
export const examPath = (examId: string) => `/exams/${encodeId(examId)}`;

export function queryString(
  values: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}
