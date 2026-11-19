import { ApiClientError, createApiClient } from "@/lib/api/client";

export const frequencies = {
  ONE_TIME: "One time",
  MONTHLY: "Monthly",
  TERMLY: "Per term",
  YEARLY: "Yearly",
  AD_HOC: "On demand",
} as const;
export type Frequency = keyof typeof frequencies;

export interface FeeHeadInput {
  name: string;
  nameNp: string;
  frequency: Frequency;
  perStudent: boolean;
  incomeAccountCode: string;
  sortOrder: number;
}
export interface FeeHead extends Omit<
  FeeHeadInput,
  "nameNp" | "incomeAccountCode"
> {
  id: string;
  code: string;
  nameNp: string | null;
  incomeAccountCode: string | null;
  isActive: boolean;
}
export interface YearInput {
  label: string;
  startDate: string;
  endDate: string;
}
export interface FiscalYear extends YearInput {
  id: string;
  startDateBs: string | null;
  endDateBs: string | null;
  status: "OPEN" | "CLOSED";
  isCurrent: boolean;
}

export const listFeeHeads = () =>
  createApiClient().get<FeeHead[]>("/fee-heads");
export const createFeeHead = (input: FeeHeadInput & { code: string }) =>
  createApiClient().post<FeeHead>("/fee-heads", input);
export const updateFeeHead = (
  id: string,
  input: FeeHeadInput & { isActive: boolean },
) =>
  createApiClient().patch<FeeHead>(
    `/fee-heads/${encodeURIComponent(id)}`,
    input,
  );
export const deleteFeeHead = (id: string) =>
  createApiClient().delete<{ deleted: true }>(
    `/fee-heads/${encodeURIComponent(id)}`,
  );

export const listFiscalYears = () =>
  createApiClient().get<FiscalYear[]>("/fiscal-years");
export async function currentFiscalYear() {
  try {
    return await createApiClient().get<FiscalYear>("/fiscal-years/current");
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) return null;
    throw error;
  }
}
export const getFiscalYear = (id: string) =>
  createApiClient().get<FiscalYear>(`/fiscal-years/${encodeURIComponent(id)}`);
export const createFiscalYear = (input: YearInput) =>
  createApiClient().post<FiscalYear>("/fiscal-years", input);
export const updateFiscalYear = (id: string, input: Partial<YearInput>) =>
  createApiClient().patch<FiscalYear>(
    `/fiscal-years/${encodeURIComponent(id)}`,
    input,
  );
export const closeFiscalYear = (id: string) =>
  createApiClient().post<FiscalYear>(
    `/fiscal-years/${encodeURIComponent(id)}/close`,
    undefined,
  );
