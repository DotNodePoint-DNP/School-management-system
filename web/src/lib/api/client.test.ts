import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiClientError,
  createApiClient,
  getApiBaseUrl,
  setApiAccessToken,
} from "@/lib/api/client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  setApiAccessToken(null);
});

describe("shared API client", () => {
  it("normalizes the global backend URL and unwraps the API envelope", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { value: 7 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(createApiClient().get("/students")).resolves.toEqual({
      value: 7,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/students",
      expect.any(Object),
    );
  });

  it("refreshes an expired access token once and retries the request", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubGlobal("window", {});
    setApiAccessToken("expired-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "renewed-token",
            expiresIn: 900,
            user: {},
          }),
          {
          status: 200,
          headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: ["ok"] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(createApiClient().get("/students")).resolves.toEqual(["ok"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      new Headers(fetchMock.mock.calls[2][1].headers).get("Authorization"),
    ).toBe("Bearer renewed-token");
  });

  it("preserves structured API errors", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: { message: "Not allowed", requestId: "request-123" },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(createApiClient().get("/students")).rejects.toMatchObject({
      name: "ApiClientError",
      status: 403,
      message: "Not allowed",
      requestId: "request-123",
    } satisfies Partial<ApiClientError>);
  });

  it("requires an HTTPS backend URL in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.example.test");

    expect(() => getApiBaseUrl()).toThrow(
      "NEXT_PUBLIC_API_URL must be a valid HTTPS backend URL in production.",
    );
  });
});
