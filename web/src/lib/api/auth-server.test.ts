import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import { setAuthCookies } from "@/lib/api/auth-server";
import { verifySessionClaims } from "@/core/session/token";

describe("server-side auth cookies", () => {
  it("stores backend refresh credentials and a signed session in HTTP-only cookies", async () => {
    const expires = new Date(Date.now() + 60_000);
    const backendResponse = new Response(
      JSON.stringify({ success: true, data: {} }),
      {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": `refresh_token=refresh-secret; Path=/api/v1/auth; Expires=${expires.toUTCString()}; HttpOnly; SameSite=Strict`,
        },
      },
    );
    const user = {
      id: "admin-1",
      fullName: "Admin User",
      email: "admin@example.test",
      phone: null,
      mustChangePassword: false,
      roles: ["ADMIN"],
      permissions: ["roles:manage"],
    };
    const response = NextResponse.json({ success: true });

    await setAuthCookies(response, backendResponse, user, "access-secret");

    expect(response.cookies.get("refresh_token")?.value).toBe("refresh-secret");
    const session = response.cookies.get("pathivara_session")?.value;
    expect(session).toBeTruthy();
    await expect(verifySessionClaims(session)).resolves.toMatchObject({
      id: "admin-1",
      accessToken: "access-secret",
      role: "school_admin",
    });
    expect(response.headers.getSetCookie().every((cookie) => /HttpOnly/i.test(cookie))).toBe(true);
  });
});
