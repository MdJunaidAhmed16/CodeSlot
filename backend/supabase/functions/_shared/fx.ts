// Live USD→INR exchange rate, cached per isolate, with a safe fallback.
// Source: frankfurter.app (ECB daily reference rates, free, no key, CORS-ok).
// The same value is used for INR→USD wallet crediting AND the /fx-rate endpoint
// the portal reads, so display and actual charge always reconcile.

let cached: { rate: number; at: number } | null = null;
const TTL_MS = 6 * 60 * 60 * 1000; // refresh at most every 6 hours

export async function getUsdInrRate(): Promise<number> {
  const fallback = Number(Deno.env.get("USD_INR_RATE")) || 83;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.rate;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=INR", {
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.ok) {
      const j = (await res.json()) as { rates?: { INR?: number } };
      const r = Number(j?.rates?.INR);
      if (Number.isFinite(r) && r > 0) {
        cached = { rate: r, at: Date.now() };
        return r;
      }
    }
  } catch {
    /* network/parse failure — fall through to last-known / fallback */
  }
  return cached?.rate ?? fallback;
}
