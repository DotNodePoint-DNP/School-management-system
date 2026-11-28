import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function login() {
  return POST(new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { Origin: "http://localhost", "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "staff@example.test", password: "test-password" }),
  }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("login gateway", () => {
  it("accepts a session that takes twelve seconds to arrive", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("Deadline", "TimeoutError")), ms);
      return controller.signal;
    });
    vi.stubGlobal("fetch", (_url: string, { signal }: RequestInit) => new Promise((resolve, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      setTimeout(() => resolve(Response.json({ success: true, data: {
        accessToken: "test-access", expiresIn: 900,
        user: { id: "staff", fullName: "Staff", mustChangePassword: false, roles: [], permissions: [] },
      } }, { headers: { "Set-Cookie": "refresh_token=test-refresh; Max-Age=900; HttpOnly" } })), 12_000);
    }));
    const pending = login();
    await vi.advanceTimersByTimeAsync(12_000);
    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.cookies.get("pathivara_session")?.value).toBeTruthy();
  });

  it.each([
    ["deadline before headers", () => Promise.reject(new DOMException("Deadline", "TimeoutError")), 504],
    ["deadline during body", () => Promise.resolve(new Response(new ReadableStream({
      start(controller) { controller.error(new DOMException("Deadline", "AbortError")); },
    }))), 504],
    ["unreachable API", () => Promise.reject(new TypeError("fetch failed")), 503],
    ["empty successful response", () => Promise.resolve(new Response(null)), 502],
    ["truncated response", () => Promise.resolve(new Response('{"success":')), 502],
    ["HTML gateway failure", () => Promise.resolve(new Response("<html></html>", {status: 503})), 503],
    ["invalid session", () => Promise.resolve(Response.json({success: true, data: {}})), 502],
  ] as const)("handles %s", async (_name, fetch, status) => {
    vi.stubGlobal("fetch", fetch);
    const response = await login();
    expect(response.status).toBe(status);
    expect((await response.json()).error.message).toContain("Please try again");
    expect(response.headers.has("set-cookie")).toBe(false);
  });
});
