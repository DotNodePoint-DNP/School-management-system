import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  issuedSessionResponse,
  readApiResponse,
  refreshCookieHeader,
  requestBackend,
  sameOriginRequest,
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
  return issuedSessionResponse(result.data, backend);
}
