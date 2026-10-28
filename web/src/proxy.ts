import { NextRequest, NextResponse } from "next/server";
import { hasDashboardAccess } from "@/core/authorization/dashboard-access";
import { sessionCookieName, verifySession } from "@/core/session/token";

const appSubdomain = process.env.APP_SUBDOMAIN ?? "app.localhost";

export async function proxy(request: NextRequest) {
  const hostname = request.headers.get("host")?.split(":")[0] ?? "";
  const isAppHost = hostname === appSubdomain;
  const isPublicPath = request.nextUrl.pathname === "/";

  if (isAppHost && isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    return NextResponse.rewrite(url);
  }

  const isDashboardRoute = request.nextUrl.pathname.startsWith("/dashboard");
  if (isDashboardRoute) {
    const user = await verifySession(request.cookies.get(sessionCookieName)?.value);
    if (!user) {
      const url = new URL("/auth", request.url);
      url.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
    if (user.mustChangePassword) {
      return NextResponse.redirect(
        new URL("/auth/change-password", request.url),
      );
    }
    if (!hasDashboardAccess(request.nextUrl.pathname, user.permissions)) {
      return NextResponse.redirect(new URL("/auth", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/"],
};
