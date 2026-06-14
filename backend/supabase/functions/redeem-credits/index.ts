// POST /redeem-credits
// Body: { device_id, model, credits_to_redeem, idempotency_key }
//
// Mints a NEW OpenRouter API key whose dollar limit equals the redeemed value
// (minus platform fee), using the platform's OpenRouter *provisioning* key, and
// returns that key once. The user never supplies a key of their own.
//
// Security-critical path (SECURITY §5):
//   * Balance is recomputed server-side; the client's number is never trusted.
//   * Amounts are bounded and validated (no negatives / overflow / NaN).
//   * Ledger debit is atomic + idempotent (redeem_credits RPC) → no double-spend.
//   * The provisioning key lives only in Edge Function env, never shipped.
//   * The minted user key is returned exactly once and stored only as a hash.
import { error, handleOptions, isUuid, json, readJson } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { allow } from "../_shared/ratelimit.ts";
import { verifyRequest } from "../_shared/auth.ts";
import {
  creditsToUsd,
  MAX_REDEEM_CREDITS,
  MIN_REDEEM_CREDITS,
  PLATFORM_FEE_RATE,
} from "../_shared/economics.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return error("method not allowed", 405);

  const claims = await verifyRequest(req);
  if (!claims) return error("authentication required", 401);
  const userId = claims.sub;

  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch (e) {
    return error(e instanceof Error ? e.message : "bad request", 400);
  }

  const model = body.model;
  const idem = body.idempotency_key;
  // credits_to_redeem is in whole CREDITS (1 credit = $0.001).
  const rawAmount = Number(body.credits_to_redeem);

  if (!isUuid(idem)) return error("invalid idempotency_key", 400);
  if (typeof model !== "string" || model.length === 0 || model.length > 80) {
    return error("invalid model", 400);
  }
  if (!Number.isInteger(rawAmount) || rawAmount <= 0 || rawAmount > MAX_REDEEM_CREDITS) {
    return error("invalid amount", 400);
  }
  if (rawAmount < MIN_REDEEM_CREDITS) {
    return error(
      `minimum redemption is ${MIN_REDEEM_CREDITS} credits (~$${creditsToUsd(MIN_REDEEM_CREDITS).toFixed(2)})`,
      400
    );
  }
  const amount = rawAmount;

  // Throttle redemption attempts hard.
  if (!(await allow(`rl:redeem:${userId}`, 5, 3600))) {
    return error("rate limited", 429);
  }

  const provisioningKey = Deno.env.get("OPENROUTER_PROVISIONING_KEY");
  if (!provisioningKey) {
    return error("redemption temporarily unavailable", 503);
  }

  // Convert credits → USD, then apply the platform fee for the OpenRouter limit.
  const orAmount = Math.round(creditsToUsd(amount) * (1 - PLATFORM_FEE_RATE) * 100) / 100;
  const keyName = `CodeSlot · ${model} · ${new Date().toISOString().slice(0, 10)}`;

  const db = serviceClient();

  // 1. Debit the ledger atomically + idempotently FIRST. If this user has
  //    already redeemed with this idem key, we get the prior result back and
  //    must not mint a second key.
  const { data, error: rpcErr } = await db.rpc("redeem_credits", {
    p_user: userId,
    p_amount: amount,
    p_model: model,
    p_or_amount: orAmount,
    p_idem: idem,
  });
  if (rpcErr) {
    const insufficient = rpcErr.message?.includes("insufficient");
    return error(
      insufficient ? "insufficient balance" : "redemption failed",
      insufficient ? 402 : 500
    );
  }
  const row = Array.isArray(data) ? data[0] : data;
  const redemptionId = Number(row?.redemption_id);

  // If this redemption already had a key minted (idempotent replay), don't mint
  // again — we can't re-show the secret, so report that.
  const { data: existing } = await db
    .from("redemptions")
    .select("openrouter_key_id")
    .eq("id", redemptionId)
    .maybeSingle();
  if (existing?.openrouter_key_id) {
    return json({
      success: true,
      new_balance: Number(row?.new_balance) || 0,
      openrouter_credit_applied: orAmount,
      message:
        "This redemption was already processed. The key was shown only once " +
        "and cannot be retrieved again.",
    });
  }

  // 2. Provision a new OpenRouter key with a dollar limit = orAmount.
  let mintedKey: string;
  let keyId: string;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/keys", {
      method: "POST",
      headers: {
        authorization: `Bearer ${provisioningKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: keyName, limit: orAmount }),
    });
    if (!res.ok) {
      throw new Error(`OpenRouter ${res.status}`);
    }
    const payload = (await res.json()) as {
      key?: string;
      data?: { hash?: string };
    };
    if (!payload.key) {
      throw new Error("no key returned");
    }
    mintedKey = payload.key;
    keyId = payload.data?.hash ?? "unknown";
  } catch (_e) {
    // Minting failed AFTER debiting. Refund by marking the redemption failed
    // and writing a compensating ledger credit, so the user isn't charged.
    await db.from("credit_ledger").insert({
      user_id: userId,
      amount: amount,
      reason: "adjustment",
      reference_id: redemptionId,
    });
    await db
      .from("redemptions")
      .update({ status: "failed" })
      .eq("id", redemptionId);
    return error("could not provision OpenRouter key — credits refunded", 502);
  }

  // 3. Record the key id (NOT the secret) for audit; mark completed.
  await db
    .from("redemptions")
    .update({ openrouter_key_id: keyId })
    .eq("id", redemptionId);

  // Recompute balance after any refund logic above is moot here (success path).
  const { data: bal } = await db.rpc("current_balance", { p_user: userId });

  return json({
    success: true,
    new_balance: Number(bal) || 0,
    openrouter_credit_applied: orAmount,
    openrouter_key: mintedKey, // shown once; never persisted server-side
    openrouter_key_name: keyName,
    estimated_tokens: Math.round(orAmount * 20000),
    message: "Key created.",
  });
});
