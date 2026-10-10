import { NextResponse } from "next/server";
import { isRole, type CurrentUser } from "@/core/authorization/roles";
import { createSession, sessionCookieName } from "@/core/session/token";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    user?: CurrentUser;
  } | null;

  const user = body?.user;

  if (
    !user ||
    !user.id ||
    !user.displayName ||
    !user.schoolId ||
    !isRole(user.role)
  ) {
    return NextResponse.json({ message: "Invalid user" }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const token = await createSession(user, expiresAt);

  const response = NextResponse.json({ ok: true });

  response.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });

  return response;
}