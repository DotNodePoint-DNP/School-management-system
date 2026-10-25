import { NextResponse } from "next/server";
import { currentUserFromApi } from "@/core/authorization/roles";
import {
  createSession,
  refreshCookieName,
  sessionCookieName,
  verifySessionClaims,
} from "@/core/session/token";
import { getApiBaseUrl } from "./client";

type ApiEnvelope<T> = { success: true; data: T };

export function validIssuedSession(
  value: unknown,
): value is { accessToken: string; expiresIn: number; user: unknown } {
  return (
    value !== null &&
    typeof value === "object" &&
    "accessToken" in value &&
    typeof value.accessToken === "string" &&
    value.accessToken.length > 0 &&
    "expiresIn" in value &&
    typeof value.expiresIn === "number" &&
    Number.isInteger(value.expiresIn) &&
    value.expiresIn > 0 &&
    "user" in value
  );
}

export async function requestBackend(
  path: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...init.headers,
    },
  });
}

export function sameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  return origin === new URL(request.url).origin;
}

export async function readRequestJson(
  request: Request,
): Promise<{ data: unknown } | { error: NextResponse }> {
  try {
    return { data: await request.json() };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        error: NextResponse.json(
          { success: false, error: { message: "Request body must be valid JSON." } },
          { status: 400 },
        ),
      };
    }
    throw error;
  }
}

export async function readApiResponse<T>(
  response: Response,
): Promise<{ data: T } | { error: NextResponse }> {
  const payload: unknown = await response.json();
  if (!response.ok) {
    return {
      error: NextResponse.json(payload, { status: response.status }),
    };
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    !("success" in payload) ||
    payload.success !== true ||
    !("data" in payload)
  ) {
    throw new Error("The backend returned an invalid API response.");
  }
  return { data: (payload as ApiEnvelope<T>).data };
}

export function refreshCookieHeader(request: Request): string | undefined {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${refreshCookieName}=`))
    ?.slice(refreshCookieName.length + 1);
  return token ? `${refreshCookieName}=${token}` : undefined;
}

export async function sessionFromRequest(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookieName}=`))
    ?.slice(sessionCookieName.length + 1);
  return verifySessionClaims(token);
}

export function backendRefreshCookie(response: Response): {
  value: string;
  expires: Date;
} {
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${refreshCookieName}=`));
  if (!cookie) {
    throw new Error("The backend did not return a refresh-token cookie.");
  }

  const [pair, ...attributes] = cookie.split(";");
  const value = pair.slice(pair.indexOf("=") + 1);
  const expiresAttribute = attributes.find((attribute) =>
    /^\s*expires=/i.test(attribute),
  );
  const maxAgeAttribute = attributes.find((attribute) =>
    /^\s*max-age=/i.test(attribute),
  );
  const expires = expiresAttribute
    ? new Date(expiresAttribute.replace(/^\s*expires=/i, "").trim())
    : maxAgeAttribute
      ? new Date(
          Date.now() +
            Number(maxAgeAttribute.replace(/^\s*max-age=/i, "").trim()) *
              1000,
        )
      : null;
  if (!value || !expires || Number.isNaN(expires.getTime())) {
    throw new Error("The backend returned an invalid refresh-token cookie.");
  }
  return { value, expires };
}

export async function setAuthCookies(
  response: NextResponse,
  backendResponse: Response,
  user: unknown,
  accessToken: string,
): Promise<void> {
  const refresh = backendRefreshCookie(backendResponse);
  const currentUser = currentUserFromApi(user);
  const session = await createSession(currentUser, accessToken, refresh.expires);
  const secure = process.env.NODE_ENV === "production";
  const options = {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/",
    expires: refresh.expires,
  };

  response.cookies.set(refreshCookieName, refresh.value, options);
  response.cookies.set(sessionCookieName, session, options);
}

export function clearAuthCookies(response: NextResponse): void {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    expires: new Date(0),
  };
  response.cookies.set(refreshCookieName, "", options);
  response.cookies.set(sessionCookieName, "", options);
}

export function currentUserOrResponse(
  user: unknown,
): { user: ReturnType<typeof currentUserFromApi> } | { error: NextResponse } {
  try {
    return { user: currentUserFromApi(user) };
  } catch (error) {
    if (error instanceof Error) {
      return {
        error: NextResponse.json(
          { success: false, error: { message: error.message } },
          { status: 403 },
        ),
      };
    }
    throw error;
  }
}
