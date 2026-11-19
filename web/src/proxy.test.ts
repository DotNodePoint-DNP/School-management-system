import { NextRequest } from "next/server";
import { expect, it } from "vitest";
import { currentUserFromApi } from "./core/authorization/roles";
import { createSession, sessionCookieName } from "./core/session/token";
import { proxy } from "./proxy";

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
