import { afterEach, describe, expect, it, vi } from "vitest";
import { setApiAccessToken } from "@/lib/api/client";
import { signIn } from "@/modules/auth/services/auth-service";

const session = {
  accessToken: "access-token",
  expiresIn: 900,
  user: {
    id: "user-id",
    fullName: "School Administrator",
    displayName: "School Administrator",
    email: "admin@example.test",
    phone: null,
    mustChangePassword: false,
    roles: ["ADMIN"],
    permissions: ["students:read-all", "roles:manage"],
    role: "school_admin" as const,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  setApiAccessToken(null);
});

describe("auth service", () => {
  it("sends credentials to the same-origin API route and stores the access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(session), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      signIn({
        identifier: "admin@example.test",
        password: "correct horse battery staple",
      }),
    ).resolves.toEqual(session);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({
          identifier: "admin@example.test",
          password: "correct horse battery staple",
        }),
      }),
    );
  });

  it("surfaces authentication failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: { message: "Invalid credentials" },
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(
      signIn({ identifier: "admin@example.test", password: "wrong-password" }),
    ).rejects.toThrow("Invalid credentials");
  });
});
