import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker(file: string, globals: Record<string, unknown> = {}) {
  const listeners = new Map<string, (event: object) => void>();
  const unregister = vi.fn();
  runInNewContext(
    readFileSync(new URL("../../public/" + file, import.meta.url), "utf8"),
    {
      URL,
      Response,
      ...globals,
      self: {
        location: { origin: "https://school.test" },
        registration: { unregister },
        clients: { claim: vi.fn() },
        addEventListener: (name: string, handle: (event: object) => void) =>
          listeners.set(name, handle),
      },
    },
  );
  return { listeners, unregister };
}

describe("portal service workers", () => {
  it("leaves public pages, APIs, and client-side data requests to the browser", () => {
    const fetch = vi.fn();
    const { listeners } = worker("portal-sw.js", { fetch });
    for (const [path, mode] of [
      ["/", "navigate"],
      ["/about", "navigate"],
      ["/api/auth/me", "cors"],
      ["/dashboard", "cors"],
    ]) {
      const respondWith = vi.fn();
      listeners.get("fetch")!({
        request: { method: "GET", url: "https://school.test" + path, mode },
        respondWith,
      });
      expect(respondWith).not.toHaveBeenCalled();
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["/dashboard/family", "/auth?next=%2Fdashboard"])("serves a generic offline response for %s", async (path) => {
    const { listeners } = worker("portal-sw.js", {
      fetch: vi.fn().mockRejectedValue(new Error("offline")),
    });
    const respondWith = vi.fn();
    listeners.get("fetch")!({
      request: {
        method: "GET",
        mode: "navigate",
        url: "https://school.test" + path,
      },
      respondWith,
    });
    const response: Response = await respondWith.mock.calls[0][0];
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("removes the previous school cache and root registration on upgrade", async () => {
    const remove = vi.fn();
    const { listeners, unregister } = worker("sw.js", {
      caches: { delete: remove },
    });
    const waitUntil = vi.fn();
    listeners.get("activate")!({ waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(remove.mock.calls).toEqual([["asteria-shell-v1"]]);
    expect(unregister).toHaveBeenCalledOnce();
  });
});
