/** Pure validation helpers shared across the extension. No VS Code deps. */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Returns true only for safe, openable ad URLs: absolute http(s) links.
 * Blocks javascript:, data:, file:, vscode: and other schemes that could be
 * abused if a malicious ad ever slipped through backend review.
 */
export function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" || parsed.protocol === "http:";
}

/**
 * A backend URL is acceptable if it is https, OR plain http pointing at a
 * loopback host (localhost / 127.0.0.1 / ::1). The loopback exception exists
 * solely so the local mock server (dev/mock-server.js) works; it can never
 * widen exposure to a real remote host.
 */
export function isAcceptableBackendUrl(value: string): boolean {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol === "https:") {
    return true;
  }
  if (u.protocol === "http:") {
    const h = u.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
  }
  return false;
}

/** A safe hex color string usable as a status-bar color (#rgb..#rrggbbaa). */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value);
}

/** An https image URL, used for advertiser logos (stricter than http(s)). */
export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** OpenRouter keys look like `sk-or-v1-...`. Be lenient but reject junk. */
export function looksLikeOpenRouterKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^sk-or-[A-Za-z0-9-]{8,200}$/.test(value.trim())
  );
}
