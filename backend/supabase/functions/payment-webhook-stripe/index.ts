// POST /payment-webhook-stripe - Stripe webhook (no auth; signature-verified).
// On `checkout.session.completed`, idempotently credits the advertiser wallet.
import { serviceClient } from "../_shared/supabase.ts";
import { verifyStripe } from "../_shared/payments.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return new Response("not configured", { status: 503 });

  const raw = await req.text();
  const ok = await verifyStripe(raw, req.headers.get("stripe-signature"), secret);
  if (!ok) return new Response("invalid signature", { status: 400 });

  let event: { type?: string; data?: { object?: { id?: string } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("bad payload", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const sessionId = event.data?.object?.id;
    if (sessionId) {
      const db = serviceClient();
      const { error } = await db.rpc("confirm_payment", {
        p_provider: "stripe",
        p_ref: sessionId,
      });
      if (error) {
        // Unknown session - ack anyway so Stripe doesn't hammer us.
        return new Response("ok", { status: 200 });
      }
    }
  }

  return new Response("ok", { status: 200 });
});
