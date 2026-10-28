import type {
  AuthLoginRequest,
  AuthLoginResponse,
  ChangePasswordRequest,
} from "@/lib/api/contracts";
import {
  refreshApiSession,
  setApiAccessToken,
} from "@/lib/api/client";
import type { CurrentUser } from "@/core/authorization/roles";

export type LoginInput = AuthLoginRequest;
export type LoginResult = AuthLoginResponse;

async function authRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const nestedError =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      payload.error &&
      typeof payload.error === "object" &&
      "message" in payload.error
        ? payload.error.message
        : undefined;
    const message =
      typeof nestedError === "string"
        ? nestedError
        : Array.isArray(nestedError)
          ? nestedError.join(", ")
          : `Authentication request failed: ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export async function signIn(input: LoginInput): Promise<LoginResult> {
  const result = await authRequest<LoginResult>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  setApiAccessToken(result.accessToken);
  return result;
}

export async function refreshSession(): Promise<LoginResult> {
  const result = await refreshApiSession();
  if (!result) {
    throw new Error("Your session has expired. Sign in again.");
  }
  return result;
}

export async function getAuthenticatedUser(): Promise<CurrentUser> {
  const result = await authRequest<{ user: CurrentUser }>("/api/auth/me");
  return result.user;
}

export async function changePassword(
  input: ChangePasswordRequest,
): Promise<void> {
  await authRequest<{ passwordChanged: true }>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
  setApiAccessToken(null);
}

export async function signOut(): Promise<void> {
  try {
    await authRequest<{ loggedOut: true }>("/api/auth/logout", {
      method: "POST",
    });
  } finally {
    setApiAccessToken(null);
  }
}
