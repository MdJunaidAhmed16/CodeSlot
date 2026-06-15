// Shared HTTP helpers for CodeSlot Edge Functions (Deno).

// The extension is not a browser page, so CORS is not strictly required, but a
// tight allowlist costs nothing and blocks casual cross-origin probing.
export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  // `authorization` is required so the browser preflight allows the Bearer
  // token the dashboards/portal send; `apikey` covers Supabase-Auth fetches.
  "access-control-allow-headers": "authorization, apikey, content-type, x-codeslot-version",
  "access-control-max-age": "86400",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function isSafeHttpUrl(v: unknown): v is string {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    throw new Error("expected application/json");
  }
  const text = await req.text();
  if (text.length > 8_192) {
    throw new Error("payload too large");
  }
  const parsed = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("invalid body");
  }
  return parsed as Record<string, unknown>;
}
