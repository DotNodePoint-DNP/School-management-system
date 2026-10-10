import { describe, expect, it } from "vitest";
import {
  requestPasswordReset,
  resetPassword,
  signIn,
} from "@/modules/auth/services/auth-service";

describe("mock auth service", () => {
  it("signs in with the selected role", async () => {
    const result = await signIn({
      identifier: "teacher@example.test",
      password: "correct horse battery staple",
      role: "teacher_staff",
    });

    expect(result.mode).toBe("mock");
    expect(result.user.role).toBe("teacher_staff");
    expect(result.user.id).toBe("demo-teacher_staff");
  });

  it("rejects empty login credentials", async () => {
    await expect(
      signIn({ identifier: "", password: "", role: "parent" }),
    ).rejects.toThrow("Enter your email address or phone number.");
  });

  it("accepts password recovery without revealing account existence", async () => {
    const result = await requestPasswordReset({
      identifier: "+977 9800000000",
      role: "parent",
    });

    expect(result).toEqual({ accepted: true, mode: "mock" });
  });

  it("validates reset password length and token", async () => {
    await expect(
      resetPassword({ token: "", password: "short", role: "parent" }),
    ).rejects.toThrow("Your new password must be at least 8 characters.");

    await expect(
      resetPassword({ token: "demo-token", password: "new-password", role: "parent" }),
    ).resolves.toBeUndefined();
  });
});
