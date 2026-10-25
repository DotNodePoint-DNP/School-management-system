import { NextResponse } from "next/server";
import {
  currentUserOrResponse,
  readRequestJson,
  readApiResponse,
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
  const parsed = await readRequestJson(request);
  if ("error" in parsed) return parsed.error;
  const input = parsed.data;
  if (
    !input ||
    typeof input !== "object" ||
    !("identifier" in input) ||
    typeof input.identifier !== "string" ||
    !("password" in input) ||
    typeof input.password !== "string"
  ) {
    return NextResponse.json(
      { success: false, error: { message: "Enter your identifier and password." } },
      { status: 400 },
    );
  }

  const backend = await requestBackend("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: input.identifier,
      password: input.password,
    }),
  });
  const result = await readApiResponse<BackendAuthSession>(backend);
  if ("error" in result) return result.error;
  if (!validIssuedSession(result.data)) {
    throw new Error("The backend returned an invalid login session.");
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
