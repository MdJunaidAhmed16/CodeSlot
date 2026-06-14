// Payment helpers shared by payment-create and the webhooks.
// Base currency is USD; INR top-ups are converted at USD_INR_RATE.

export type Currency = "usd" | "inr";
export type Provider = "stripe" | "razorpay";

export function usdInrRate(): number {
  const r = Number(Deno.env.get("USD_INR_RATE"));
  return Number.isFinite(r) && r > 0 ? r : 83; // sane default
}

/** Default currency for a 2-letter country code. India → INR, else USD. */
export function currencyForCountry(country?: string | null): Currency {
  return (country ?? "").toUpperCase() === "IN" ? "inr" : "usd";
}

/** Which processor handles a currency. */
export function providerForCurrency(c: Currency): Provider {
  return c === "inr" ? "razorpay" : "stripe";
}

/** Minor units (cents/paise) for a major-unit amount. */
export function toMinor(amount: number): number {
  return Math.round(amount * 100);
}

/** USD value credited to the wallet for a payment in `currency`. */
export function amountToUsd(amountMajor: number, currency: Currency): number {
  const usd = currency === "inr" ? amountMajor / usdInrRate() : amountMajor;
  return Math.round(usd * 100) / 100;
}

// ── Webhook signature verification (Web Crypto, constant-time compare) ──
async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** Verify a Stripe `Stripe-Signature` header against the raw body. */
export async function verifyStripe(
  rawBody: string,
  header: string | null,
  secret: string
): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=").map((s) => s.trim()) as [string, string])
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  // Reject signatures older than 5 minutes (replay protection).
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  return timingSafeEqual(expected, v1);
}

/** Verify a Razorpay `X-Razorpay-Signature` header against the raw body. */
export async function verifyRazorpay(
  rawBody: string,
  header: string | null,
  secret: string
): Promise<boolean> {
  if (!header) return false;
  const expected = await hmacSha256Hex(secret, rawBody);
  return timingSafeEqual(expected, header);
}
