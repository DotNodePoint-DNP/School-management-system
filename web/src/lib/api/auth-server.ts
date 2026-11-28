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

function invalidAuthResponse(response: Response): NextResponse {
  const status = response.status >= 400 ? response.status : 502;
  return NextResponse.json(
    { success: false, error: { message: "The sign-in service returned an unreadable response. Please try again." } },
    { status },
  );
}

function authGatewayError(status: 503 | 504): NextResponse {
  const message = status === 504
    ? "The sign-in service took too long to respond. Please try again."
    : "The sign-in service is temporarily unavailable. Please try again.";
  return NextResponse.json({ success: false, error: { message } }, { status });
}

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
  const url = `${getApiBaseUrl()}${path}`;
  const deadline = AbortSignal.timeout(path === "/auth/login" ? 30_000 : 10_000);
  try {
    return await fetch(url, {
      ...init,
      signal: deadline,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...init.headers,
      },
    });
  } catch (error) {
    if (deadline.aborted || (error instanceof Error && error.name === "TimeoutError")) {
      return authGatewayError(504);
    }
    if (error instanceof TypeError) return authGatewayError(503);
    throw error;
  }
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
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    // Fetch can resolve with headers before the deadline interrupts the body.
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
      return { error: authGatewayError(504) };
    }
    if (error instanceof TypeError) return { error: authGatewayError(503) };
    if (error instanceof SyntaxError) return { error: invalidAuthResponse(response) };
    throw error;
  }
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
    return { error: invalidAuthResponse(response) };
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
  await setSessionCookie(response, currentUser, accessToken, refresh.expires);
  response.cookies.set(refreshCookieName, refresh.value, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/", expires: refresh.expires,
  });
}

export async function setSessionCookie(
  response: NextResponse,
  user: ReturnType<typeof currentUserFromApi>,
  accessToken: string,
  expires: Date,
) {
  const session = await createSession(user, accessToken, expires);
  const secure = process.env.NODE_ENV === "production";
  const options = {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/",
    expires,
  };

  response.cookies.set(sessionCookieName, session, options);
}

export async function issuedSessionResponse(data: unknown, backend: Response) {
  if (!validIssuedSession(data)) return invalidAuthResponse(backend);
  const mapped = currentUserOrResponse(data.user);
  if ("error" in mapped) return mapped.error;

  const response = NextResponse.json({ ...data, user: mapped.user });
  try {
    await setAuthCookies(response, backend, data.user, data.accessToken);
  } catch (error) {
    console.error("Unable to establish the sign-in session.", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json(
      { success: false, error: { message: "The server could not start your session. Please try again." } },
      { status: 500 },
    );
  }
  return response;
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
