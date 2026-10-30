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

  it("supports PATCH, PUT, and DELETE requests", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Response(JSON.stringify({ success: true, data: { ok: true } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient();

    await client.patch("/rbac/roles/role-id", { name: "Updated" });
    await client.put("/rbac/roles/role-id/permissions", {
      permissions: ["students:read"],
    });
    await client.delete("/rbac/roles/role-id");

    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual([
      "PATCH",
      "PUT",
      "DELETE",
    ]);
    expect(fetchMock.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ name: "Updated" }),
    );
    expect(fetchMock.mock.calls[1][1]?.body).toBe(
      JSON.stringify({ permissions: ["students:read"] }),
    );
    expect(fetchMock.mock.calls[2][1]?.body).toBeUndefined();
  });

  it("sends multipart form data without setting a JSON content type", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Response(JSON.stringify({ success: true, data: { uploaded: true } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const formData = new FormData();
    formData.append("file", new Blob(["image"]), "logo.png");

    await createApiClient().put("/school/logo", formData);

    const [, options] = fetchMock.mock.calls[0];
    expect(options.body).toBe(formData);
    expect(new Headers(options.headers).has("Content-Type")).toBe(false);
  });

  it("returns raw image responses as blobs", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api/v1");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(["image"]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createApiClient().getBlob("/school/assets/logo");

    expect(result).toBeInstanceOf(Blob);
    expect(await result.text()).toBe("image");
  });

  it("requires an HTTPS backend URL in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.example.test");

    expect(() => getApiBaseUrl()).toThrow(
      "NEXT_PUBLIC_API_URL must be a valid HTTPS backend URL in production.",
    );
  });
});
