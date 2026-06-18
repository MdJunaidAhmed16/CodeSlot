// GET /redeem-models — public. Returns a curated, price-aware list of OpenRouter
// models for the redeem picker, fetched live from OpenRouter's public catalog
// and cached in memory. Falls back to the last good cache on transient errors;
// the client keeps its own static list as a final fallback.
import { error, handleOptions, json } from "../_shared/http.ts";

interface ModelCard {
  id: string;
  name: string;
  vendor: string;
  context: number; // context length in tokens
  price_in: number; // USD per 1M prompt tokens
  price_out: number; // USD per 1M completion tokens
  freeTier: boolean;
}

// Vendors we surface, in display priority. Anything else is dropped to keep the
// picker focused (the minted key works across all models regardless).
const VENDOR_ORDER = [
  "anthropic", "openai", "google", "x-ai", "meta-llama",
  "deepseek", "mistralai", "qwen", "cohere",
];
const VENDOR_LABEL: Record<string, string> = {
  anthropic: "Anthropic", openai: "OpenAI", google: "Google", "x-ai": "xAI",
  "meta-llama": "Meta", deepseek: "DeepSeek", mistralai: "Mistral",
  qwen: "Qwen", cohere: "Cohere",
};
const MAX_MODELS = 30;
const PER_VENDOR = 4; // keep variety across vendors, not 20 Anthropic models
const TTL_MS = 12 * 60 * 60 * 1000;

let cache: { at: number; data: ModelCard[] } | null = null;

// deno-lint-ignore no-explicit-any
function normalize(raw: any[]): ModelCard[] {
  const out: ModelCard[] = [];
  for (const m of raw) {
    const id = String(m?.id ?? "");
    const vendor = id.split("/")[0];
    if (!id || !VENDOR_ORDER.includes(vendor)) continue;
    // Chat models only: text in AND text out (drops image/audio/embedding
    // endpoints), and skip safety classifiers / embedding models by name.
    const inputs: string[] = m?.architecture?.input_modalities ?? ["text"];
    const outputs: string[] = m?.architecture?.output_modalities ?? ["text"];
    if (!inputs.includes("text") || !outputs.includes("text")) continue;
    if (/(guard|embed|embedding|moderation|tts|whisper|lyria|veo|imagen|sora|dall-?e|flux|stable.?diffusion|sdxl)/i.test(`${id} ${m?.name ?? ""}`)) continue;
    const prompt = Number(m?.pricing?.prompt);
    const completion = Number(m?.pricing?.completion);
    if (!Number.isFinite(prompt)) continue;
    out.push({
      id,
      // Strip the "Vendor: " prefix OpenRouter puts on names.
      name: String(m?.name ?? id).replace(/^[^:]+:\s*/, ""),
      vendor: VENDOR_LABEL[vendor] ?? vendor,
      context: Number(m?.context_length ?? m?.top_provider?.context_length ?? 0),
      price_in: Math.round(prompt * 1_000_000 * 100) / 100,
      price_out: Math.round((Number.isFinite(completion) ? completion : 0) * 1_000_000 * 100) / 100,
      freeTier: prompt === 0,
    });
  }
  // Sort by vendor priority, then cheaper-first (the affordable workhorses
  // stretch redeemed credits furthest), then name.
  out.sort((a, b) => {
    const oa = vendorRank(a.vendor);
    const ob = vendorRank(b.vendor);
    if (oa !== ob) return oa - ob;
    if (a.price_in !== b.price_in) return a.price_in - b.price_in;
    return a.name.localeCompare(b.name);
  });
  // Cap per vendor for variety, then cap the total.
  const perVendor: Record<string, number> = {};
  const curated: ModelCard[] = [];
  for (const m of out) {
    const seen = perVendor[m.vendor] ?? 0;
    if (seen >= PER_VENDOR) continue;
    perVendor[m.vendor] = seen + 1;
    curated.push(m);
    if (curated.length >= MAX_MODELS) break;
  }
  return curated;
}

/** Priority index of a display label (e.g. "Anthropic" → 0). */
function vendorRank(label: string): number {
  const entry = Object.entries(VENDOR_LABEL).find(([, v]) => v === label);
  return VENDOR_ORDER.indexOf(entry ? entry[0] : label.toLowerCase());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "GET") return error("method not allowed", 405);

  if (cache && Date.now() - cache.at < TTL_MS) {
    return json({ models: cache.data, cached: true });
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`openrouter ${res.status}`);
    const body = (await res.json()) as { data?: unknown[] };
    const models = normalize(Array.isArray(body.data) ? body.data : []);
    if (models.length === 0) throw new Error("empty catalog");
    cache = { at: Date.now(), data: models };
    return json({ models, cached: false });
  } catch (_e) {
    if (cache) return json({ models: cache.data, cached: true });
    return error("model catalog unavailable", 502);
  }
});
