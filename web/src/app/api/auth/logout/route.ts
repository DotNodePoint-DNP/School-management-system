import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  readApiResponse,
  refreshCookieHeader,
  requestBackend,
  sameOriginRequest,
} from "@/lib/api/auth-server";

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) {
    return NextResponse.json(
      { success: false, error: { message: "Cross-origin request denied." } },
      { status: 403 },
    );
  }
  const cookie = refreshCookieHeader(request);
  if (cookie) {
    const backend = await requestBackend("/auth/logout", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    const result = await readApiResponse<{ loggedOut: true }>(backend);
    if ("error" in result) {
      if (backend.status !== 401) return result.error;
    }
  }

  const response = NextResponse.json({ loggedOut: true });
  clearAuthCookies(response);
  return response;
}
