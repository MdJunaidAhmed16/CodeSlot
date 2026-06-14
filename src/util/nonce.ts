import { randomBytes } from "crypto";

/** Cryptographically strong nonce for webview Content-Security-Policy. */
export function getNonce(): string {
  return randomBytes(16).toString("base64").replace(/[^A-Za-z0-9]/g, "");
}
