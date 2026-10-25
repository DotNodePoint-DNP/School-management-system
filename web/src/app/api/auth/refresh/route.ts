import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  currentUserOrResponse,
  readApiResponse,
  refreshCookieHeader,
  requestBackend,
  sameOriginRequest,
  setAuthCookies,
  validIssuedSession,
} from "@/lib/api/auth-server";
import type { BackendAuthSession } from "@/lib/api/contracts";

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) {
    return NextResponse.json(
      { success: false, error: { message: "Cross-origin request denied." } },
      { status: 403 },
    );
  }
  const cookie = refreshCookieHeader(request);
  if (!cookie) {
    const response = NextResponse.json(
      { success: false, error: { message: "Your session has expired. Sign in again." } },
      { status: 401 },
    );
    clearAuthCookies(response);
    return response;
  }

  const backend = await requestBackend("/auth/refresh", {
    method: "POST",
    headers: { Cookie: cookie },
  });
  const result = await readApiResponse<BackendAuthSession>(backend);
  if ("error" in result) {
    if (backend.status === 401) clearAuthCookies(result.error);
    return result.error;
  }
  if (!validIssuedSession(result.data)) {
    throw new Error("The backend returned an invalid refreshed session.");
  }

  const mappedUser = currentUserOrResponse(result.data.user);
  if ("error" in mappedUser) return mappedUser.error;

  const response = NextResponse.json({
    ...result.data,
    user: mappedUser.user,
  });
  await setAuthCookies(
    response,
    backend,
    result.data.user,
    result.data.accessToken,
  );
  return response;
}
