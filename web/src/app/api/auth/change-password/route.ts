import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  readApiResponse,
  readRequestJson,
  requestBackend,
  sameOriginRequest,
  sessionFromRequest,
} from "@/lib/api/auth-server";

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) {
    return NextResponse.json(
      { success: false, error: { message: "Cross-origin request denied." } },
      { status: 403 },
    );
  }
  const session = await sessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { success: false, error: { message: "Your session has expired. Sign in again." } },
      { status: 401 },
    );
  }

  const parsed = await readRequestJson(request);
  if ("error" in parsed) return parsed.error;
  const input = parsed.data;
  if (
    !input ||
    typeof input !== "object" ||
    !("currentPassword" in input) ||
    typeof input.currentPassword !== "string" ||
    !("newPassword" in input) ||
    typeof input.newPassword !== "string"
  ) {
    return NextResponse.json(
      { success: false, error: { message: "Enter your current and new password." } },
      { status: 400 },
    );
  }

  const backend = await requestBackend("/auth/change-password", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const result = await readApiResponse<{ passwordChanged: true }>(backend);
  if ("error" in result) return result.error;

  const response = NextResponse.json(result.data);
  clearAuthCookies(response);
  return response;
}
