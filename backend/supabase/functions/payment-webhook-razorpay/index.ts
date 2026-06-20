// POST /payment-webhook-razorpay - Razorpay webhook (no auth; signature-verified).
// On `payment.captured` / `order.paid`, idempotently credits the wallet.
import { serviceClient } from "../_shared/supabase.ts";
import { verifyRazorpay } from "../_shared/payments.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) return new Response("not configured", { status: 503 });

  const raw = await req.text();
  const ok = await verifyRazorpay(raw, req.headers.get("x-razorpay-signature"), secret);
  if (!ok) return new Response("invalid signature", { status: 400 });

  let event: {
    event?: string;
    payload?: {
      payment?: { entity?: { order_id?: string } };
      order?: { entity?: { id?: string } };
    };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("bad payload", { status: 400 });
  }

  if (event.event === "payment.captured" || event.event === "order.paid") {
    const orderId =
      event.payload?.payment?.entity?.order_id ?? event.payload?.order?.entity?.id;
    if (orderId) {
      const db = serviceClient();
      await db.rpc("confirm_payment", { p_provider: "razorpay", p_ref: orderId });
    }
  }

  return new Response("ok", { status: 200 });
});
