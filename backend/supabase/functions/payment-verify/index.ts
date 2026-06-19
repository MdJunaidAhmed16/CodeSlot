// POST /payment-verify  (advertiser-gated)
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
//
// Synchronous counterpart to the Razorpay webhook. The checkout success handler
// fires on the client before the webhook reaches us, so for flows that need the
// wallet credited immediately (e.g. pay-to-launch), the client posts the
// Razorpay signature here. We verify it, confirm the payment idempotently (same
// confirm_payment RPC the webhook uses), and return the new balance. The webhook
// stays as the reliable backstop, so double-confirming is a no-op.
import { error, handleOptions, json, readJson } from "../_shared/http.ts";
import { requireAdvertiser } from "../_shared/advertiser.ts";
import { verifyRazorpayCheckout } from "../_shared/payments.ts";

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

  const orderId = String(body.razorpay_order_id ?? "");
  const paymentId = String(body.razorpay_payment_id ?? "");
  const signature = String(body.razorpay_signature ?? "");
  if (!orderId || !paymentId || !signature) return error("missing payment fields", 400);

  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keySecret) return error("payments unavailable", 503);

  const ok = await verifyRazorpayCheckout(orderId, paymentId, signature, keySecret);
  if (!ok) return error("invalid payment signature", 400);

  // The order must be one we created for THIS advertiser (defense in depth).
  const { data: pay } = await db
    .from("payments")
    .select("advertiser_id")
    .eq("provider", "razorpay")
    .eq("provider_ref", orderId)
    .single();
  if (!pay || pay.advertiser_id !== advertiserId) return error("payment not found", 404);

  const { data, error: e } = await db.rpc("confirm_payment", {
    p_provider: "razorpay",
    p_ref: orderId,
  });
  if (e) return error("could not confirm payment", 500);
  const row = Array.isArray(data) ? data[0] : data;

  return json({
    success: true,
    wallet_usd: Number(row?.new_balance ?? 0),
    already: Boolean(row?.already),
  });
});
