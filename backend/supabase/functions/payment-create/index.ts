// POST /payment-create  (advertiser-gated)
// Body: { amount, currency?, country? }
//   amount   — major units (e.g. 10 for $10, 800 for ₹800)
//   currency — 'usd' | 'inr' (optional; defaults from `country` geo)
//   country  — 2-letter code (forwarded by the web app from edge geo)
//
// Creates a Stripe Checkout Session (USD) or a Razorpay Order (INR) and records
// a 'created' payment row. The wallet is credited later, only by the verified
// webhook. Returns what the client needs to open the hosted checkout.
import { error, handleOptions, json, readJson } from "../_shared/http.ts";
import { requireAdvertiser } from "../_shared/advertiser.ts";
import {
  amountToUsd, currencyForCountry, providerForCurrency, toMinor, type Currency,
} from "../_shared/payments.ts";
import { getUsdInrRate } from "../_shared/fx.ts";

const MIN_USD = 5;
const MAX_USD = 100000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return error("method not allowed", 405);

  const ctx = await requireAdvertiser(req);
  if (ctx instanceof Response) return ctx;
  const { db, advertiserId } = ctx;

  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch (e) {
    return error(e instanceof Error ? e.message : "bad request", 400);
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return error("invalid amount", 400);

  const currency: Currency =
    body.currency === "inr" || body.currency === "usd"
      ? body.currency
      : currencyForCountry(typeof body.country === "string" ? body.country : null);

  const fxRate = await getUsdInrRate(); // today's USD→INR (cached)
  const amountUsd = amountToUsd(amount, currency, fxRate);
  if (amountUsd < MIN_USD) return error(`minimum top-up is $${MIN_USD}`, 400);
  if (amountUsd > MAX_USD) return error("amount too large", 400);

  // Route to a processor. USD prefers Stripe, but falls back to Razorpay
  // (International Payments) when Stripe isn't configured — e.g. Indian
  // accounts where Stripe is invite-only. INR always uses Razorpay.
  const stripeAvailable = Boolean(Deno.env.get("STRIPE_SECRET_KEY"));
  const provider =
    currency === "usd" && stripeAvailable ? "stripe" : "razorpay";
  const amountMinor = toMinor(amount);
  const siteUrl = (Deno.env.get("CODESLOT_SITE_URL") ?? "http://localhost:3000").replace(/\/+$/, "");

  try {
    if (provider === "stripe") {
      const key = Deno.env.get("STRIPE_SECRET_KEY");
      if (!key) return error("payments unavailable", 503);
      const form = new URLSearchParams();
      form.set("mode", "payment");
      form.set("success_url", `${siteUrl}/portal?topup=success`);
      form.set("cancel_url", `${siteUrl}/portal?topup=cancelled`);
      form.set("client_reference_id", advertiserId);
      form.set("line_items[0][quantity]", "1");
      form.set("line_items[0][price_data][currency]", "usd");
      form.set("line_items[0][price_data][unit_amount]", String(amountMinor));
      form.set("line_items[0][price_data][product_data][name]", "CodeSlot wallet top-up");
      const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
        body: form,
      });
      if (!res.ok) return error("could not create checkout session", 502);
      const session = (await res.json()) as { id: string; url: string };

      await insertPayment(db, advertiserId, "stripe", session.id, currency, amountMinor, amountUsd);
      return json({ provider: "stripe", checkout_url: session.url, amount_usd: amountUsd });
    }

    // Razorpay — handles INR, and USD/foreign cards when International
    // Payments is enabled on the account.
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!keyId || !keySecret) {
      // Diagnostic (names/lengths only — never logs the secret values).
      console.error("payment-create 503: razorpay keys not visible", {
        has_RAZORPAY_KEY_ID: Boolean(keyId),
        has_RAZORPAY_KEY_SECRET: Boolean(keySecret),
        key_id_len: keyId?.length ?? 0,
        razorpay_env_names: Object.keys(Deno.env.toObject()).filter((k) =>
          k.includes("RAZORPAY")
        ),
      });
      return error("payments unavailable", 503);
    }
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        amount: amountMinor,
        currency: currency.toUpperCase(), // 'INR' or 'USD'
        notes: { advertiser_id: advertiserId },
      }),
    });
    if (!res.ok) return error("could not create order", 502);
    const order = (await res.json()) as { id: string };

    await insertPayment(db, advertiserId, "razorpay", order.id, currency, amountMinor, amountUsd);
    return json({
      provider: "razorpay",
      order_id: order.id,
      key_id: keyId,
      display_currency: currency.toUpperCase(),
      amount_minor: amountMinor,
      currency: "INR",
      amount_usd: amountUsd,
    });
  } catch (_e) {
    return error("payment provider error", 502);
  }
});

// deno-lint-ignore no-explicit-any
async function insertPayment(db: any, advertiserId: string, provider: string, ref: string, currency: string, amountMinor: number, amountUsd: number) {
  await db.from("payments").insert({
    advertiser_id: advertiserId,
    provider,
    provider_ref: ref,
    currency,
    amount_minor: amountMinor,
    amount_usd: amountUsd,
    status: "created",
  });
}
