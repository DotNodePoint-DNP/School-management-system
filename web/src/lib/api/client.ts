/** Frontend transport boundary. Implement with the chosen API client later. */
export interface ApiClient {
  get<T>(path: string, options?: RequestInit): Promise<T>;
  post<T>(path: string, body: unknown, options?: RequestInit): Promise<T>;
}

export class ApiClientError extends Error {
  constructor(public readonly status: number, message: string, public readonly requestId?: string) {
    super(message);
    this.name = "ApiClientError";
  }
}
export function createApiClient(
  baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "",
): ApiClient {
  async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { message?: string; requestId?: string } | null;
      throw new ApiClientError(response.status, payload?.message ?? `API request failed: ${response.status}`, payload?.requestId);
    }
    return response.json() as Promise<T>;
  }
  return {
    get: <T>(path: string, options?: RequestInit) => request<T>(path, options),
    post: <T>(path: string, body: unknown, options?: RequestInit) =>
      request<T>(path, {
        ...options,
        method: "POST",
        body: JSON.stringify(body),
      }),
  };
}
