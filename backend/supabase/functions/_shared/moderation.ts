// Ad moderation engine — the "strong backend verification" that lets campaigns
// auto-approve safely (no manual review). It runs several independent screens;
// ANY hard failure rejects the ad. Layers:
//   1. Banned-category keyword screen (adult, gambling, drugs, weapons, hate,
//      malware/phishing/scam, counterfeit, etc.) over all text + the domain.
//   2. URL structure heuristics (https-only, no IP literals, no punycode,
//      no URL shorteners, no high-risk free TLDs, sane length/subdomains).
//   3. Brand-impersonation / phishing heuristic (famous brand token in a
//      non-official domain).
//   4. Google Safe Browsing lookup (if SAFE_BROWSING_API_KEY is set) — the
//      authoritative malware/social-engineering signal.

export interface AdInput {
  advertiser_name: string;
  text: string;
  description?: string;
  url: string;
}

export type ModerationResult =
  | { ok: true; flag?: string } // approved; `flag` = soft warning for the owner
  | { ok: false; category: string; reason: string };

// ── 1. Banned category keywords ──────────────────────────────────
// Word-ish matching (bounded) to limit false positives on substrings.
const CATEGORIES: Record<string, string[]> = {
  adult: [
    "porn", "xxx", "nsfw", "escort", "camgirl", "onlyfans", "hentai",
    "adult video", "sex cam", "sexcam", "fetish", "milf", "nude", "nudes",
    "18+", "adult dating", "hookup", "brothel",
  ],
  gambling: [
    "casino", "betting", "sportsbook", "poker", "roulette", "slots",
    "gambling", "wager", "lottery", "blackjack", "baccarat", "sattamatka",
    "1xbet", "stake.com",
  ],
  drugs: [
    "cocaine", "heroin", "cannabis dispensary", "buy weed", "buy cannabis",
    "psychedelic", "lsd", "mdma", "meth", "steroids for sale", "illegal drugs",
  ],
  weapons: [
    "buy guns", "firearms for sale", "ammunition", "silencer", "ghost gun",
    "explosives", "grenade", "assault rifle",
  ],
  hate: [
    "white power", "nazi", "kkk", "ethnic cleansing", "jihad recruitment",
    "terrorist", "genocide",
  ],
  malware_scam: [
    "phishing", "carding", "stolen cards", "cc dump", "hack account",
    "account hacking", "ransomware", "keylogger", "botnet", "ddos for hire",
    "fake id", "counterfeit", "replica watches", "money laundering",
    "double your bitcoin", "crypto doubler", "investment guaranteed returns",
    "get rich quick", "free robux", "free v bucks", "giveaway claim now",
    "wallet drainer", "seed phrase", "metamask verify", "airdrop claim",
  ],
};

// ── 2. URL structure rules ───────────────────────────────────────
const URL_SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly",
  "rebrand.ly", "cutt.ly", "shorturl.at", "rb.gy", "bl.ink", "tiny.cc",
]);
// Free TLDs disproportionately abused for phishing/throwaway sites.
const HIGH_RISK_TLDS = new Set(["tk", "ml", "ga", "cf", "gq", "work", "zip", "mov"]);

// ── 3. Brand impersonation map (brand token → official registrable domains) ─
const BRANDS: Record<string, string[]> = {
  paypal: ["paypal.com"],
  apple: ["apple.com", "icloud.com"],
  microsoft: ["microsoft.com", "live.com", "office.com"],
  google: ["google.com", "youtube.com", "gmail.com"],
  amazon: ["amazon.com"],
  netflix: ["netflix.com"],
  meta: ["meta.com", "facebook.com"],
  facebook: ["facebook.com"],
  instagram: ["instagram.com"],
  whatsapp: ["whatsapp.com"],
  coinbase: ["coinbase.com"],
  binance: ["binance.com"],
  metamask: ["metamask.io"],
};

const IP_LITERAL = /^(\d{1,3}\.){3}\d{1,3}$/;

export async function moderateAd(ad: AdInput): Promise<ModerationResult> {
  const haystack = `${ad.advertiser_name} ${ad.text} ${ad.description ?? ""} ${ad.url}`
    .toLowerCase();

  // 1. Category keywords.
  for (const [category, words] of Object.entries(CATEGORIES)) {
    for (const w of words) {
      if (containsTerm(haystack, w)) {
        return {
          ok: false,
          category,
          reason: `Content matched a prohibited category (${category}).`,
        };
      }
    }
  }

  // 2. URL structure.
  let host: string;
  let registrable: string;
  try {
    const u = new URL(ad.url);
    if (u.protocol !== "https:") {
      return { ok: false, category: "url", reason: "Destination URL must use https." };
    }
    host = u.hostname.toLowerCase();
    if (IP_LITERAL.test(host)) {
      return { ok: false, category: "url", reason: "IP-address URLs are not allowed." };
    }
    if (host.startsWith("xn--") || host.includes(".xn--")) {
      return { ok: false, category: "url", reason: "Punycode/IDN domains are not allowed." };
    }
    if (host.length > 80 || host.split(".").length > 5) {
      return { ok: false, category: "url", reason: "Suspicious domain structure." };
    }
    if (URL_SHORTENERS.has(host)) {
      return { ok: false, category: "url", reason: "URL shorteners are not allowed (hide the destination)." };
    }
    const tld = host.split(".").pop() ?? "";
    if (HIGH_RISK_TLDS.has(tld)) {
      return { ok: false, category: "url", reason: `High-risk TLD (.${tld}) is not allowed.` };
    }
    registrable = registrableDomain(host);
  } catch {
    return { ok: false, category: "url", reason: "Invalid destination URL." };
  }

  // 3. Brand impersonation.
  for (const [brand, officials] of Object.entries(BRANDS)) {
    const mentions = host.includes(brand) || containsTerm(haystack, brand);
    if (mentions && !officials.includes(registrable)) {
      // Allow if the domain *is* one of the official ones; otherwise reject.
      if (host.includes(brand) && !officials.some((o) => host.endsWith(o))) {
        return {
          ok: false,
          category: "phishing",
          reason: `Possible brand impersonation of "${brand}".`,
        };
      }
    }
  }

  // 4. Google Safe Browsing on the declared URL (authoritative, if configured).
  const sbReason = await safeBrowsingCheck(ad.url);
  if (sbReason) {
    return { ok: false, category: "phishing", reason: sbReason };
  }

  // 5. Follow redirects and screen the REAL destination (catches cloaking /
  //    shorteners / bait-and-switch that the declared URL hides).
  const trace = await traceRedirects(ad.url);
  if (trace.reject) {
    return { ok: false, category: "redirect", reason: trace.reject };
  }
  if (trace.finalUrl && trace.finalUrl !== ad.url) {
    const finalCat = screenString(trace.finalUrl.toLowerCase());
    if (finalCat) {
      return { ok: false, category: finalCat, reason: `Redirect destination matched a prohibited category (${finalCat}).` };
    }
    const finalSb = await safeBrowsingCheck(trace.finalUrl);
    if (finalSb) {
      return { ok: false, category: "phishing", reason: `Redirect destination ${finalSb}` };
    }
    const declaredReg = registrableDomain(new URL(ad.url).hostname.toLowerCase());
    const finalReg = registrableDomain(new URL(trace.finalUrl).hostname.toLowerCase());
    if (declaredReg !== finalReg) {
      // Suspicious but not necessarily malicious → flag for the owner.
      return { ok: true, flag: `Redirects to a different domain (${finalReg}) than displayed (${declaredReg}).` };
    }
  }
  if (trace.unreachable) {
    return { ok: true, flag: "Destination did not respond during review." };
  }
  if (trace.hops > 3) {
    return { ok: true, flag: `Long redirect chain (${trace.hops} hops).` };
  }

  return { ok: true };
}

/** Returns the matched prohibited category for a string, or null. */
function screenString(s: string): string | null {
  for (const [category, words] of Object.entries(CATEGORIES)) {
    for (const w of words) {
      if (containsTerm(s, w)) return category;
    }
  }
  return null;
}

function isInternalHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "0.0.0.0" || host === "::1" || host === "[::1]") return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true; // link-local / cloud metadata
  return false;
}

interface TraceResult {
  finalUrl: string;
  hops: number;
  reject?: string;
  unreachable?: boolean;
}

/**
 * Follow up to 5 redirect hops (manual), returning the final destination.
 * Hardened against SSRF: refuses internal/private hosts and raw-IP redirect
 * targets, times out each hop, and never reads the response body.
 */
async function traceRedirects(start: string): Promise<TraceResult> {
  let current = start;
  let hops = 0;
  for (let i = 0; i < 6; i++) {
    let u: URL;
    try {
      u = new URL(current);
    } catch {
      return { finalUrl: current, hops, reject: "Invalid URL in redirect chain." };
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      return { finalUrl: current, hops, reject: "Unsupported scheme in redirect chain." };
    }
    const host = u.hostname.toLowerCase();
    if (isInternalHost(host)) {
      return { finalUrl: current, hops, reject: "Redirect targets an internal/private host." };
    }
    if (i > 0 && IP_LITERAL.test(host)) {
      return { finalUrl: current, hops, reject: "Redirect targets a raw IP address." };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    let res: Response;
    try {
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "user-agent": "CodeSlot-Moderation/1.0" },
      });
    } catch {
      clearTimeout(timer);
      return { finalUrl: current, hops, unreachable: true };
    }
    clearTimeout(timer);
    await res.body?.cancel().catch(() => {}); // don't download the body

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      try {
        current = new URL(loc, current).toString();
      } catch {
        return { finalUrl: current, hops, reject: "Invalid redirect target." };
      }
      hops++;
      continue;
    }
    return { finalUrl: current, hops }; // 2xx/4xx/5xx → final
  }
  return { finalUrl: current, hops, reject: "Too many redirects." };
}

function containsTerm(haystack: string, term: string): boolean {
  if (term.includes(" ")) {
    return haystack.includes(term);
  }
  // Bounded match for single tokens to avoid matching inside larger words.
  return new RegExp(`(^|[^a-z0-9])${escapeRe(term)}([^a-z0-9]|$)`, "i").test(haystack);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Naive registrable domain (last two labels). Good enough for our screens. */
function registrableDomain(host: string): string {
  const parts = host.split(".");
  return parts.slice(-2).join(".");
}

/** Returns a rejection reason if Safe Browsing flags the URL, else null. */
async function safeBrowsingCheck(url: string): Promise<string | null> {
  const key = Deno.env.get("SAFE_BROWSING_API_KEY");
  if (!key) {
    return null; // not configured — skip (recommended to set in production)
  }
  try {
    const res = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client: { clientId: "codeslot", clientVersion: "1.0" },
          threatInfo: {
            threatTypes: [
              "MALWARE",
              "SOCIAL_ENGINEERING",
              "UNWANTED_SOFTWARE",
              "POTENTIALLY_HARMFUL_APPLICATION",
            ],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url }],
          },
        }),
      }
    );
    if (!res.ok) return null; // fail-open on API error (don't block legit ads)
    const data = (await res.json()) as { matches?: unknown[] };
    if (data.matches && data.matches.length > 0) {
      return "URL flagged by Google Safe Browsing (malware/phishing).";
    }
  } catch {
    return null;
  }
  return null;
}
