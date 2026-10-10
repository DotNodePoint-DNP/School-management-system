import { isRole, type CurrentUser } from "@/core/authorization/roles";

export const sessionCookieName = "pathivara_session";

type SessionClaims = CurrentUser & { exp: number };

function decodeBase64Url(value: string) {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (character) =>
    character.charCodeAt(0),
  );
  return new TextDecoder().decode(bytes);
}

function decodeBase64UrlBytes(value: string) {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function signingKey() {
  const secret =
    process.env.SESSION_SECRET ??
    (process.env.NODE_ENV !== "production"
      ? "development-only-session-secret"
      : undefined);
  if (!secret) throw new Error("SESSION_SECRET must be configured.");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function verifySession(
  value?: string,
): Promise<CurrentUser | null> {
  if (!value) return null;
  try {
    const [header, payload, signature] = value.split(".");
    if (!header || !payload || !signature) return null;
    const verified = await crypto.subtle.verify(
      "HMAC",
      await signingKey(),
      decodeBase64UrlBytes(signature),
      new TextEncoder().encode(`${header}.${payload}`),
    );
    if (!verified) return null;
    const claims = JSON.parse(decodeBase64Url(payload)) as SessionClaims;
    if (
      !claims.id ||
      !claims.displayName ||
      !claims.schoolId ||
      !isRole(claims.role) ||
      claims.exp <= Date.now() / 1000
    )
      return null;
    return {
      id: claims.id,
      displayName: claims.displayName,
      schoolId: claims.schoolId,
      role: claims.role,
    };
  } catch {
    return null;
  }
}

// Used only by the trusted server-side login endpoint; never expose SESSION_SECRET to the browser.
export async function createSession(user: CurrentUser, expiresAt: Date) {
  const header = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const payload = encodeBase64Url(
    new TextEncoder().encode(
      JSON.stringify({ ...user, exp: Math.floor(expiresAt.getTime() / 1000) }),
    ),
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${encodeBase64Url(new Uint8Array(signed))}`;
}
