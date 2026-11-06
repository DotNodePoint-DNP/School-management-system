import type { AuthLoginResponse } from "./contracts";

/** Shared frontend transport boundary for the versioned backend API. */
export interface ApiClient {
  get<T>(path: string, options?: RequestInit): Promise<T>;
  getPaginated<T>(path: string): Promise<PaginatedResult<T>>;
  getCursorPaginated<T>(path: string): Promise<CursorPaginatedResult<T>>;
  getBlob(path: string, options?: RequestInit): Promise<Blob>;
  post<T>(path: string, body: unknown, options?: RequestInit): Promise<T>;
  patch<T>(path: string, body: unknown, options?: RequestInit): Promise<T>;
  put<T>(path: string, body: unknown, options?: RequestInit): Promise<T>;
  delete<T>(path: string, options?: RequestInit): Promise<T>;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CursorPaginatedResult<T> {
  items: T[];
  meta: {
    limit: number;
    nextCursor: string | null;
  };
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

let accessToken: string | null = null;
let refreshInFlight: Promise<AuthLoginResponse | null> | null = null;

export function setApiAccessToken(token: string | null): void {
  accessToken = token;
}

export function getApiBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_API_URL ??
    (process.env.NODE_ENV === "production"
      ? undefined
      : "http://localhost:3001");
  if (!configured) {
    throw new Error("Set NEXT_PUBLIC_API_URL to the backend URL.");
  }

  const url = new URL(configured);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    (process.env.NODE_ENV === "production" && url.protocol !== "https:")
  ) {
    throw new Error(
      "NEXT_PUBLIC_API_URL must be a valid HTTPS backend URL in production.",
    );
  }
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/api/v1") ? path : `${path}/api/v1`;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function createApiClient(baseUrl = getApiBaseUrl()): ApiClient {
  async function request<T>(
    path: string,
    options?: RequestInit,
    retried = false,
    responseType: "json" | "blob" = "json",
    unwrapEnvelope = true,
  ): Promise<T> {
    if (
      !accessToken &&
      !retried &&
      typeof window !== "undefined" &&
      (await refreshApiSession())
    ) {
      return request<T>(path, options, true, responseType, unwrapEnvelope);
    }
    const headers = new Headers(options?.headers);
    const isFormData =
      typeof FormData !== "undefined" && options?.body instanceof FormData;
    if (!headers.has("Content-Type") && !isFormData) {
      headers.set("Content-Type", "application/json");
    }
    if (accessToken && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      credentials: "include",
      headers,
    });
    if (
      response.status === 401 &&
      accessToken &&
      !retried &&
      typeof window !== "undefined"
    ) {
      const refreshed = await refreshApiSession();
      if (refreshed) return request<T>(path, options, true, responseType, unwrapEnvelope);
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        error?: { message?: string | string[]; requestId?: string };
        requestId?: string;
      } | null;
      const errorMessage = payload?.error?.message;
      throw new ApiClientError(
        response.status,
        payload?.message ??
          (Array.isArray(errorMessage)
            ? errorMessage.join(", ")
            : errorMessage) ??
          `API request failed: ${response.status}`,
        payload?.requestId ?? payload?.error?.requestId,
      );
    }
    if (responseType === "blob") {
      return (await response.blob()) as T;
    }
    const payload = (await response.json()) as T | { success: true; data: T };
    if (
      unwrapEnvelope &&
      payload &&
      typeof payload === "object" &&
      "success" in payload &&
      payload.success === true &&
      "data" in payload
    ) {
      return payload.data;
    }
    return payload as T;
  }

  return {
    get: <T>(path: string, options?: RequestInit) => request<T>(path, options),
    getPaginated: async <T>(path: string) => {
      const payload = await request<unknown>(
        path,
        undefined,
        false,
        "json",
        false,
      );
      if (
        !isRecord(payload) ||
        payload.success !== true ||
        !Array.isArray(payload.data) ||
        !isRecord(payload.meta)
      ) {
        throw new Error("The API returned an invalid paginated response.");
      }

      const { page, pageSize, total, totalPages } = payload.meta;
      if (
        !isNonNegativeInteger(page) ||
        page < 1 ||
        !isNonNegativeInteger(pageSize) ||
        pageSize < 1 ||
        !isNonNegativeInteger(total) ||
        !isNonNegativeInteger(totalPages)
      ) {
        throw new Error("The API returned invalid pagination metadata.");
      }

      return {
        items: payload.data as T[],
        meta: { page, pageSize, total, totalPages },
      };
    },
    getCursorPaginated: async <T>(path: string) => {
      const payload = await request<unknown>(
        path,
        undefined,
        false,
        "json",
        false,
      );
      if (
        !isRecord(payload) ||
        payload.success !== true ||
        !Array.isArray(payload.data) ||
        !isRecord(payload.meta) ||
        !isNonNegativeInteger(payload.meta.limit) ||
        payload.meta.limit < 1 ||
        payload.meta.limit > 100 ||
        (payload.meta.nextCursor !== null &&
          typeof payload.meta.nextCursor !== "string")
      ) {
        throw new Error("The API returned an invalid cursor-paginated response.");
      }

      return {
        items: payload.data as T[],
        meta: {
          limit: payload.meta.limit,
          nextCursor: payload.meta.nextCursor,
        },
      };
    },
    getBlob: (path: string, options?: RequestInit) =>
      request<Blob>(path, options, false, "blob"),
    post: <T>(path: string, body: unknown, options?: RequestInit) =>
      request<T>(path, {
        ...options,
        method: "POST",
        body:
          typeof FormData !== "undefined" && body instanceof FormData
            ? body
            : JSON.stringify(body),
      }),
    patch: <T>(path: string, body: unknown, options?: RequestInit) =>
      request<T>(path, {
        ...options,
        method: "PATCH",
        body:
          typeof FormData !== "undefined" && body instanceof FormData
            ? body
            : JSON.stringify(body),
      }),
    put: <T>(path: string, body: unknown, options?: RequestInit) =>
      request<T>(path, {
        ...options,
        method: "PUT",
        body:
          typeof FormData !== "undefined" && body instanceof FormData
            ? body
            : JSON.stringify(body),
      }),
    delete: <T>(path: string, options?: RequestInit) =>
      request<T>(path, { ...options, method: "DELETE" }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function refreshApiSession(): Promise<AuthLoginResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) {
          setApiAccessToken(null);
          return null;
        }
        const payload: unknown = await response.json();
        if (
          !payload ||
          typeof payload !== "object" ||
          !("accessToken" in payload) ||
          typeof payload.accessToken !== "string" ||
          payload.accessToken.length === 0 ||
          !("expiresIn" in payload) ||
          typeof payload.expiresIn !== "number" ||
          !("user" in payload)
        ) {
          throw new Error("The auth service returned an invalid session.");
        }
        const session = payload as AuthLoginResponse;
        setApiAccessToken(session.accessToken);
        return session;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}
