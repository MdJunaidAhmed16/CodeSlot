// CodeSlot session tokens (HS256 JWT) issued after GitHub verification.
//
// The token's `sub` is the internal user id. User-scoped endpoints derive the
// identity from this verified token - never from a client-supplied field - so a
// caller cannot impersonate another user or farm credits with spoofed ids.
import { create, getNumericDate, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const ALG = "HS256";
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

async function key(): Promise<CryptoKey> {
  const secret = Deno.env.get("CODESLOT_JWT_SECRET");
  if (!secret || secret.length < 32) {
    throw new Error("CODESLOT_JWT_SECRET missing or too short (>=32 chars)");
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export interface SessionClaims {
  sub: string; // internal user id (uuid)
  gh: number; // github id
  login?: string;
  own?: boolean; // owner flag (convenience; authority is the DB)
  adm?: boolean; // admin flag (convenience; authority is the DB)
}

export async function issueToken(claims: SessionClaims): Promise<string> {
  return create(
    { alg: ALG, typ: "JWT" },
    { ...claims, exp: getNumericDate(TOKEN_TTL_SECONDS) },
    await key()
  );
}

/** Verify the Bearer token on a request. Returns claims or null. */
export async function verifyRequest(
  req: Request
): Promise<SessionClaims | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }
  try {
    const payload = (await verify(match[1], await key())) as unknown as SessionClaims;
    if (!payload.sub || typeof payload.sub !== "string") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
