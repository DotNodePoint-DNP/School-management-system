import { NextResponse } from "next/server";
import {
  currentUserOrResponse,
  readApiResponse,
  requestBackend,
  sessionFromRequest,
} from "@/lib/api/auth-server";

export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { success: false, error: { message: "Your session has expired. Sign in again." } },
      { status: 401 },
    );
  }

  const backend = await requestBackend("/auth/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  const result = await readApiResponse<unknown>(backend);
  if ("error" in result) return result.error;

  const user = currentUserOrResponse(result.data);
  if ("error" in user) return user.error;
  return NextResponse.json({ user: user.user });
}
