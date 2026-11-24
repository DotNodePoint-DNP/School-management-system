import { NextResponse } from "next/server";
import {
  currentUserOrResponse,
  readApiResponse,
  readRequestJson,
  requestBackend,
  sameOriginRequest,
  sessionFromRequest,
  setSessionCookie,
} from "@/lib/api/auth-server";

export async function GET(request: Request) {
  return profileResponse(request);
}

export async function PATCH(request: Request) {
  if (!sameOriginRequest(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request denied." } }, { status: 403 });
  }
  const parsed = await readRequestJson(request);
  if ("error" in parsed) return parsed.error;
  return profileResponse(request, JSON.stringify(parsed.data));
}

async function profileResponse(request: Request, body?: string) {
  const session = await sessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { success: false, error: { message: "Your session has expired. Sign in again." } },
      { status: 401 },
    );
  }

  const backend = await requestBackend("/auth/me", {
    method: body === undefined ? "GET" : "PATCH",
    headers: { Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" },
    body,
  });
  const result = await readApiResponse<unknown>(backend);
  if ("error" in result) return result.error;

  const user = currentUserOrResponse(result.data);
  if ("error" in user) return user.error;
  const response = NextResponse.json({ user: user.user });
  if (body !== undefined) {
    await setSessionCookie(response, user.user, session.accessToken, new Date(session.exp * 1000));
  }
  return response;
}
