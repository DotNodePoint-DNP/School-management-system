import { cookies } from "next/headers";
import { verifySession, sessionCookieName } from "./token";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  return verifySession(cookieStore.get(sessionCookieName)?.value);
}
