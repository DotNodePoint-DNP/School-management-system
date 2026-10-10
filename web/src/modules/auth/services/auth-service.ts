import type {
  AuthLoginRequest,
  AuthLoginResponse,
  PasswordRecoveryRequest,
  PasswordRecoveryResponse,
  PasswordResetRequest,
} from "@/lib/api/contracts";
import { createApiClient } from "@/lib/api/client";
import {
  validateIdentifier,
  validateLoginPassword,
  validateNewPassword,
} from "@/modules/auth/validation";

export type LoginInput = AuthLoginRequest;

export type LoginResult = AuthLoginResponse & {
  mode: "mock" | "api";
};

export type PasswordRecoveryInput = PasswordRecoveryRequest;

export type PasswordRecoveryResult = PasswordRecoveryResponse & {
  mode: "mock" | "api";
};

export type PasswordResetInput = PasswordResetRequest;

const authMode = process.env.NEXT_PUBLIC_AUTH_MODE === "api" ? "api" : "mock";

function assertLoginInput({ identifier, password }: LoginInput) {
  const identifierError = validateIdentifier(identifier);
  if (identifierError) throw new Error(identifierError);
  const passwordError = validateLoginPassword(password);
  if (passwordError) throw new Error(passwordError);
}

function assertRecoveryInput({ identifier }: PasswordRecoveryInput) {
  const identifierError = validateIdentifier(identifier);
  if (identifierError) throw new Error(identifierError);
}

function assertResetInput({ token, password }: PasswordResetInput) {
  const passwordError = validateNewPassword(password);
  if (!token || passwordError) {
    throw new Error(passwordError ?? "The reset link is invalid or expired.");
  }
}

async function mockLogin(input: LoginInput): Promise<LoginResult> {
  assertLoginInput(input);
  await new Promise((resolve) => setTimeout(resolve, 450));

  return {
    mode: "mock",
    user: {
      id: `demo-${input.role}`,
      displayName: input.identifier,
      role: input.role,
      schoolId: "demo-school",
    },
  };
}

async function mockPasswordRecovery(
  input: PasswordRecoveryInput,
): Promise<PasswordRecoveryResult> {
  assertRecoveryInput(input);
  await new Promise((resolve) => setTimeout(resolve, 350));
  return { accepted: true, mode: "mock" };
}

async function mockPasswordReset(input: PasswordResetInput) {
  assertResetInput(input);
  await new Promise((resolve) => setTimeout(resolve, 450));
}

export async function signIn(input: LoginInput): Promise<LoginResult> {
  if (authMode === "mock") return mockLogin(input);

  const response = await createApiClient().post<AuthLoginResponse>(
    "/auth/login",
    input,
  );
  return { mode: "api", user: response.user };
}

/** Development-only bridge so mock sign-in uses the same HttpOnly cookie path as production. */
export async function establishMockSession(user: AuthLoginResponse["user"]) {
  if (typeof window === "undefined" || authMode !== "mock") return;
  await createApiClient("").post("/api/auth/mock-session", { user });
}

export async function requestPasswordReset(
  input: PasswordRecoveryInput,
): Promise<PasswordRecoveryResult> {
  if (authMode === "mock") return mockPasswordRecovery(input);

  await createApiClient().post<PasswordRecoveryResponse>(
    "/auth/forgot-password",
    input,
  );
  return { accepted: true, mode: "api" };
}

export async function resetPassword(input: PasswordResetInput): Promise<void> {
  if (authMode === "mock") {
    await mockPasswordReset(input);
    return;
  }

  await createApiClient().post("/auth/reset-password", input);
}
