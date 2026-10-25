import { isRole, type CurrentUser } from "@/core/authorization/roles";

export const sessionCookieName = "pathivara_session";
export const refreshCookieName = "refresh_token";

type SessionClaims = CurrentUser & {
  accessToken: string;
  exp: number;
};

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
  if (!secret || (process.env.NODE_ENV === "production" && secret.length < 32)) {
    throw new Error(
      "Set SESSION_SECRET to at least 32 characters in production.",
    );
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function verifySessionClaims(
  value?: string,
): Promise<(CurrentUser & { accessToken: string; exp: number }) | null> {
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
      !claims.fullName ||
      !claims.displayName ||
      !isRole(claims.role) ||
      typeof claims.accessToken !== "string" ||
      !Array.isArray(claims.roles) ||
      !Array.isArray(claims.permissions) ||
      claims.exp <= Date.now() / 1000
    )
      return null;
    return claims;
  } catch {
    return null;
  }
}

export async function verifySession(
  value?: string,
): Promise<CurrentUser | null> {
  const claims = await verifySessionClaims(value);
  if (!claims) return null;
  return {
    id: claims.id,
    fullName: claims.fullName,
    displayName: claims.displayName,
    email: claims.email,
    phone: claims.phone,
    mustChangePassword: claims.mustChangePassword,
    roles: claims.roles,
    permissions: claims.permissions,
    role: claims.role,
  };
}

// Used only by the trusted server-side login endpoint; never expose SESSION_SECRET to the browser.
export async function createSession(
  user: CurrentUser,
  accessToken: string,
  expiresAt: Date,
) {
  const header = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const payload = encodeBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        ...user,
        accessToken,
        exp: Math.floor(expiresAt.getTime() / 1000),
      }),
    ),
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${encodeBase64Url(new Uint8Array(signed))}`;
}
