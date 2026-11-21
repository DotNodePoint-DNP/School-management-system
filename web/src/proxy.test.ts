import { NextRequest } from "next/server";
import { expect, it } from "vitest";
import { currentUserFromApi } from "./core/authorization/roles";
import { createSession, sessionCookieName } from "./core/session/token";
import { proxy } from "./proxy";

it("opens /me for signed-in users without module grants and enforces password changes", async () => {
  const url = "https://school.example/me";
  expect((await proxy(new NextRequest(url))).headers.get("location")).toContain("/auth?");
  for (const mustChangePassword of [true, false]) {
    const user = currentUserFromApi({
      id: "member", fullName: "School member", roles: [], permissions: [], mustChangePassword,
    });
    const request = new NextRequest(url);
    request.cookies.set(sessionCookieName, await createSession(user, "access-token", new Date(Date.now() + 60000)));
    const response = await proxy(request);
    if (mustChangePassword) expect(response.headers.get("location")).toBe("https://school.example/auth/change-password");
    else expect(response.status).toBe(200);
  }
});

it("applies grants and revocations to a bookmarked page for a custom role", async () => {
  const url = "https://school.example/dashboard/settings/audit-log";
  for (const allowed of [false, true, false]) {
    const user = currentUserFromApi({
      id: "auditor", fullName: "School auditor", roles: ["AUDITOR"],
      permissions: allowed ? ["audit-logs:read"] : [], mustChangePassword: false,
    });
    const session = await createSession(user, "access-token", new Date(Date.now() + 60000));
    const request = new NextRequest(url);
    request.cookies.set(sessionCookieName, session);
    const response = await proxy(request);
    expect(response.status).toBe(allowed ? 200 : 403);
    if (!allowed) expect(response.headers.get("x-middleware-rewrite")).toBe("https://school.example/dashboard/access-denied");
  }
});
