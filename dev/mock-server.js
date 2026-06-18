// CodeSlot local mock backend — zero dependencies (Node http module).
//
// Mirrors the real API shape so you can exercise the extension AND the admin
// dashboard without deploying Supabase. Identity is GitHub-based: /auth takes a
// GitHub token (the dev host provides a real one via VS Code's GitHub provider),
// verifies it against GitHub when possible, and issues an opaque session token.
//
//   node dev/mock-server.js          # http://localhost:8787
//
// Extension:  "codeslot.apiBaseUrl": "http://localhost:8787"
// Dashboard:  VITE_API_BASE_URL=http://localhost:8787

const http = require("http");
const crypto = require("crypto");
const { randomUUID } = crypto;

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const CREDIT_USD = 0.001;
const MIN_REDEEM_CREDITS = 5000;
// Dev convenience: the local user is the owner unless MOCK_OWNER=false (to test
// the advertiser/admin view where the "+ New Campaign" button is shown).
const DEV_OWNER = process.env.MOCK_OWNER !== "false";

// ── In-memory state ───────────────────────────────────────────────
const ADS = [
  { ad_id: randomUUID(), advertiser_name: "Vercel", text: "Vercel — Deploy in seconds →", url: "https://vercel.com", description: "Ship frontend apps with zero config.", brand_color: "#ffffff", logo_url: "https://assets.vercel.com/image/upload/front/favicon/vercel/57x57.png", weight: 3, active: true, status: "approved", budget_remaining: 100, billing_model: "cpm", cost_per_impression: 0.01, cost_per_click: 0, reward_imp: 4, reward_click: 0 },
  { ad_id: randomUUID(), advertiser_name: "Supabase", text: "Supabase — Open source Firebase alternative", url: "https://supabase.com", description: "Postgres, auth, and realtime. Free tier forever.", brand_color: "#3ecf8e", logo_url: "https://supabase.com/favicon/favicon-48x48.png", weight: 2, active: true, status: "approved", budget_remaining: 100, billing_model: "cpm", cost_per_impression: 0.01, cost_per_click: 0, reward_imp: 4, reward_click: 0 },
  { ad_id: randomUUID(), advertiser_name: "Snyk", text: "Snyk — Find and fix vulnerabilities", url: "https://snyk.io", description: "Developer-first security for your dependencies.", brand_color: "#4c4a73", logo_url: "https://snyk.io/favicon-32x32.png", weight: 1, active: true, status: "approved", budget_remaining: 100, billing_model: "cpm", cost_per_impression: 0.01, cost_per_click: 0, reward_imp: 4, reward_click: 0 },
];

let flags = { ad_serving_enabled: true };

/** userId -> { login, is_admin, ledger:[{amount,reason,advertiser,event_type,at}], seenIdem:Set } */
const users = new Map();
/** sessionToken -> userId */
const sessions = new Map();
/** github_id -> userId */
const byGithub = new Map();
/** advertiser session token -> { advertiserId, email } */
const advSessions = new Map();
/** email -> advertiserId */
const advByEmail = new Map();
/** advertiserId -> wallet_usd */
const advWallet = new Map();
/** advertiserId -> [payment] */
const advPayments = new Map();
/** advertiserId -> { currency_pref, set_at(ms), fx_rate_locked } */
const advProfile = new Map();
const LOCK_MS = 30 * 24 * 3600 * 1000;
const profileOf = (id) => { if (!advProfile.has(id)) advProfile.set(id, { currency_pref: null, set_at: null, fx_rate_locked: null }); return advProfile.get(id); };
const canChangeCurrency = (p) => !p.set_at || Date.now() - p.set_at >= LOCK_MS;
let USD_INR_RATE = 83; // fallback; refreshed live from frankfurter
let fxAt = 0;
async function getMockRate() {
  if (Date.now() - fxAt < 6 * 3600 * 1000) return USD_INR_RATE;
  try {
    const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=INR");
    if (r.ok) { const j = await r.json(); const v = Number(j?.rates?.INR); if (v > 0) { USD_INR_RATE = v; fxAt = Date.now(); } }
  } catch { /* keep fallback */ }
  return USD_INR_RATE;
}
const walletOf = (id) => advWallet.get(id) || 0;
let mockOpenRouterSpent = 0; // running total of $ spent minting OpenRouter keys

function userOf(id) {
  if (!users.has(id)) users.set(id, {
    login: "dev", is_owner: DEV_OWNER, is_admin: true, ledger: [], seenIdem: new Set(),
    seenImpr: new Map(), // adId -> last impression time (ms), for click precondition
    clickAt: new Map(),  // adId -> last credited click time (ms), per-ad cooldown
    clickDay: { count: 0, day: "" }, // daily credited-click cap
  });
  return users.get(id);
}
function balanceOf(id) {
  return userOf(id).ledger.reduce((s, e) => s + e.amount, 0);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);

function bearer(req) {
  const h = req.headers["authorization"] || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const uid = sessions.get(m[1]);
  return uid ? { uid, ...userOf(uid) } : null;
}

function send(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, x-codeslot-version",
  });
  res.end(JSON.stringify(body));
}

function servable(a) {
  return a.active && a.status === "approved" && a.budget_remaining > 0;
}
function weightedPick() {
  const pool = ADS.filter(servable);
  if (pool.length === 0) return null;
  const total = pool.reduce((s, a) => s + a.weight, 0);
  let r = Math.random() * total;
  for (const a of pool) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return pool[0];
}

// Compact JS port of _shared/moderation.ts for local testing.
const MOD_CATS = {
  adult: ["porn", "xxx", "nsfw", "escort", "onlyfans", "hentai", "nude", "18+", "hookup", "sex cam", "sexcam", "fetish"],
  gambling: ["casino", "betting", "sportsbook", "poker", "roulette", "slots", "gambling", "lottery", "blackjack", "1xbet"],
  drugs: ["cocaine", "heroin", "buy weed", "buy cannabis", "lsd", "mdma", "meth", "steroids for sale", "illegal drugs"],
  weapons: ["buy guns", "firearms for sale", "ammunition", "silencer", "ghost gun", "explosives", "grenade"],
  hate: ["white power", "nazi", "kkk", "terrorist", "genocide"],
  malware_scam: ["phishing", "carding", "stolen cards", "ransomware", "keylogger", "botnet", "fake id", "counterfeit", "replica watches", "double your bitcoin", "free robux", "free v bucks", "wallet drainer", "seed phrase", "airdrop claim", "guaranteed returns"],
};
const MOD_SHORTENERS = new Set(["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "cutt.ly", "rb.gy", "tiny.cc"]);
const MOD_RISK_TLDS = new Set(["tk", "ml", "ga", "cf", "gq", "work", "zip", "mov"]);
const MOD_BRANDS = { paypal: ["paypal.com"], apple: ["apple.com"], microsoft: ["microsoft.com"], google: ["google.com"], amazon: ["amazon.com"], netflix: ["netflix.com"], coinbase: ["coinbase.com"], binance: ["binance.com"], metamask: ["metamask.io"] };
function term(h, t) {
  if (t.includes(" ")) return h.includes(t);
  return new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(h);
}
function moderateAdJs(ad) {
  const h = `${ad.advertiser_name} ${ad.text} ${ad.description || ""} ${ad.url}`.toLowerCase();
  for (const [cat, words] of Object.entries(MOD_CATS))
    for (const w of words) if (term(h, w)) return { ok: false, reason: `Content matched a prohibited category (${cat}).` };
  let host, reg;
  try {
    const u = new URL(ad.url);
    if (u.protocol !== "https:") return { ok: false, reason: "Destination URL must use https." };
    host = u.hostname.toLowerCase();
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return { ok: false, reason: "IP-address URLs are not allowed." };
    if (host.startsWith("xn--") || host.includes(".xn--")) return { ok: false, reason: "Punycode/IDN domains are not allowed." };
    if (host.length > 80 || host.split(".").length > 5) return { ok: false, reason: "Suspicious domain structure." };
    if (MOD_SHORTENERS.has(host)) return { ok: false, reason: "URL shorteners are not allowed." };
    if (MOD_RISK_TLDS.has(host.split(".").pop())) return { ok: false, reason: "High-risk TLD is not allowed." };
    reg = host.split(".").slice(-2).join(".");
  } catch {
    return { ok: false, reason: "Invalid destination URL." };
  }
  for (const [brand, officials] of Object.entries(MOD_BRANDS))
    if (host.includes(brand) && !officials.some((o) => host.endsWith(o)))
      return { ok: false, reason: `Possible brand impersonation of "${brand}".` };
  // Soft flag (mock hook): URLs that look like redirectors are approved but
  // flagged for the owner. Real backend follows redirects to the destination.
  if (/redirect|\/r\/|\/go\//i.test(ad.url)) {
    return { ok: true, flag: "Redirects to a different domain (review recommended)." };
  }
  return { ok: true };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (c) => { buf += c; if (buf.length > 8192) reject(new Error("too large")); });
    req.on("end", () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); } });
  });
}

async function githubUser(token) {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: { authorization: `Bearer ${token}`, "user-agent": "CodeSlot", accept: "application/vnd.github+json" },
    });
    if (res.ok) return await res.json();
  } catch { /* offline — fall through to stub */ }
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/^\/+|\/+$/g, "");

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "access-control-allow-headers": "content-type, authorization, x-codeslot-version",
    });
    return res.end();
  }

  try {
    // POST /auth — exchange a GitHub token for a session token.
    if (path === "auth" && req.method === "POST") {
      const b = await readBody(req);
      if (typeof b.github_token !== "string" || b.github_token.length < 8) {
        return send(res, 400, { error: "invalid github_token" });
      }
      const gh = await githubUser(b.github_token);
      // Real GitHub id when online; otherwise a stable stub keyed by the token.
      const githubId = gh && gh.id ? gh.id : hashToInt(b.github_token);
      const login = gh && gh.login ? gh.login : "dev-" + String(githubId).slice(0, 4);
      let uid = byGithub.get(githubId);
      if (!uid) { uid = randomUUID(); byGithub.set(githubId, uid); }
      const u = userOf(uid);
      u.login = login;
      u.is_owner = DEV_OWNER;
      u.is_admin = true; // dev convenience: signed-in local user can manage
      const token = "codeslot-mock-" + randomUUID();
      sessions.set(token, uid);
      log(`auth → @${login} (${DEV_OWNER ? "owner" : "admin"}) ${gh ? "[verified]" : "[stub/offline]"}`);
      return send(res, 200, { token, user: { id: uid, login, is_owner: DEV_OWNER, is_admin: true, balance: balanceOf(uid) } });
    }

    // GET /fx-rate (public)
    if (path === "fx-rate" && req.method === "GET") {
      return send(res, 200, { usd_inr: await getMockRate() });
    }
    // GET /redeem-models (public) — static, price-aware catalog for local dev.
    if (path === "redeem-models" && req.method === "GET") {
      return send(res, 200, { models: [
        { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5", vendor: "Anthropic", context: 200000, price_in: 3, price_out: 15 },
        { id: "openai/gpt-4o", name: "GPT-4o", vendor: "OpenAI", context: 128000, price_in: 2.5, price_out: 10 },
        { id: "google/gemini-2.0-flash", name: "Gemini 2.0 Flash", vendor: "Google", context: 1000000, price_in: 0.1, price_out: 0.4 },
        { id: "x-ai/grok-2", name: "Grok 2", vendor: "xAI", context: 131072, price_in: 2, price_out: 10 },
        { id: "deepseek/deepseek-v3", name: "DeepSeek V3", vendor: "DeepSeek", context: 64000, price_in: 0.27, price_out: 1.1 },
        { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", vendor: "Meta", context: 131072, price_in: 0, price_out: 0, freeTier: true },
        { id: "mistralai/mistral-large", name: "Mistral Large", vendor: "Mistral", context: 128000, price_in: 2, price_out: 6 },
        { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B", vendor: "Qwen", context: 131072, price_in: 0.35, price_out: 0.4 },
      ], cached: false });
    }

    // GET /serve-ad (anonymous)
    if (path === "serve-ad" && req.method === "GET") {
      if (!flags.ad_serving_enabled) return send(res, 200, { ad: null, next_in_seconds: 60 });
      const id = url.searchParams.get("device_id");
      if (!isUuid(id)) return send(res, 400, { error: "invalid device_id" });
      const ad = weightedPick();
      return send(res, 200, {
        ad: { ad_id: ad.ad_id, advertiser_name: ad.advertiser_name, text: ad.text, url: ad.url, description: ad.description, brand_color: ad.brand_color, logo_url: ad.logo_url, weight: ad.weight },
        next_in_seconds: 30,
      });
    }

    // POST /track-event (auth)
    if (path === "track-event" && req.method === "POST") {
      const s = bearer(req);
      if (!s) return send(res, 401, { error: "authentication required" });
      const b = await readBody(req);
      if (!isUuid(b.ad_id) || !isUuid(b.idempotency_key)) return send(res, 400, { error: "invalid id" });
      if (b.event_type !== "impression" && b.event_type !== "click") return send(res, 400, { error: "invalid event_type" });
      const u = userOf(s.uid);
      if (u.seenIdem.has(b.idempotency_key)) return send(res, 200, { success: true, credits_earned: 0, new_balance: balanceOf(s.uid) });
      const ad = ADS.find((a) => a.ad_id === b.ad_id);
      // No such active ad → never credit (mirrors record_event 'ad not available').
      if (!ad || !ad.active) return send(res, 409, { error: "ad not available" });
      const cost = b.event_type === "click" ? ad.cost_per_click : ad.cost_per_impression;
      const earned = b.event_type === "click" ? ad.reward_click : ad.reward_imp;
      const now = Date.now();
      const zero = () => send(res, 200, { success: true, credits_earned: 0, new_balance: balanceOf(s.uid) });
      // CORE INVARIANT: only credit when the advertiser pays. On the unbilled
      // side of a CPM/CPC campaign cost=reward=0 (logged, but no charge/credit).
      if (cost > 0 && ad.budget_remaining < cost) return zero();
      // Record that this ad was viewed (for the click precondition).
      if (b.event_type === "impression") u.seenImpr.set(ad.ad_id, now);
      // CLICK anti-fraud (mirrors the real backend):
      if (b.event_type === "click" && earned > 0) {
        const seen = u.seenImpr.get(ad.ad_id) || 0;
        if (now - seen > 30 * 60 * 1000) return zero();           // must have viewed it (<=30 min)
        if (now - (u.clickAt.get(ad.ad_id) || 0) < 86400 * 1000) return zero(); // 1 credited click/ad/24h
        const today = new Date().toISOString().slice(0, 10);
        if (u.clickDay.day !== today) u.clickDay = { count: 0, day: today };
        if (u.clickDay.count >= 10) return zero();                 // daily click cap
        u.clickAt.set(ad.ad_id, now);
        u.clickDay.count++;
      }
      u.seenIdem.add(b.idempotency_key);
      if (earned > 0) u.ledger.push({ amount: earned, reason: b.event_type, advertiser: ad.advertiser_name, event_type: b.event_type, at: new Date().toISOString() });
      if (cost > 0) ad.budget_remaining = ad.budget_remaining - cost;
      log(`track ${b.event_type} @${u.login} (+${earned}) → ${balanceOf(s.uid)}`);
      return send(res, 200, { success: true, credits_earned: earned, new_balance: balanceOf(s.uid) });
    }

    // GET /balance (auth)
    if (path === "balance" && req.method === "GET") {
      const s = bearer(req);
      if (!s) return send(res, 401, { error: "authentication required" });
      const u = userOf(s.uid);
      const earned = u.ledger.filter((e) => e.amount > 0).reduce((a, e) => a + e.amount, 0);
      const redeemed = u.ledger.filter((e) => e.amount < 0).reduce((a, e) => a - e.amount, 0);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todays = u.ledger.filter((e) => e.amount > 0 && new Date(e.at) >= today);
      return send(res, 200, {
        balance: balanceOf(s.uid), lifetime_earned: earned, lifetime_redeemed: redeemed,
        stats_today: {
          impressions: todays.filter((e) => e.event_type === "impression").length,
          clicks: todays.filter((e) => e.event_type === "click").length,
          earned: todays.reduce((a, e) => a + e.amount, 0),
        },
        recent: u.ledger.filter((e) => e.amount > 0).slice(-10).reverse().map((e) => ({
          advertiser_name: e.advertiser, event_type: e.event_type, credits_awarded: e.amount, created_at: e.at,
        })),
      });
    }

    // POST /redeem-credits (auth)
    if (path === "redeem-credits" && req.method === "POST") {
      const s = bearer(req);
      if (!s) return send(res, 401, { error: "authentication required" });
      const b = await readBody(req);
      if (!isUuid(b.idempotency_key)) return send(res, 400, { error: "invalid id" });
      if (typeof b.model !== "string" || !b.model) return send(res, 400, { error: "invalid model" });
      const amount = Number(b.credits_to_redeem);
      if (!Number.isInteger(amount) || amount <= 0) return send(res, 400, { error: "invalid amount" });
      if (amount < MIN_REDEEM_CREDITS) return send(res, 400, { error: `minimum redemption is ${MIN_REDEEM_CREDITS} credits (~$5)` });
      if (amount > balanceOf(s.uid)) return send(res, 402, { error: "insufficient balance" });
      const orAmount = Math.round(amount * CREDIT_USD * 0.95 * 100) / 100;
      mockOpenRouterSpent += orAmount;
      userOf(s.uid).ledger.push({ amount: -amount, reason: "redemption", advertiser: "redeem", event_type: "redemption", at: new Date().toISOString() });
      const fakeKey = "sk-or-v1-" + crypto.randomBytes(24).toString("hex");
      const keyName = `CodeSlot · ${b.model} · ${new Date().toISOString().slice(0, 10)}`;
      log(`redeem ${amount}cr @${s.login} → $${orAmount}, key ${fakeKey.slice(0, 16)}…`);
      return send(res, 200, { success: true, new_balance: balanceOf(s.uid), openrouter_credit_applied: orAmount, estimated_tokens: Math.round(orAmount * 20000), openrouter_key: fakeKey, openrouter_key_name: keyName, message: "Mock key created." });
    }

    // POST /delete-data (auth)
    if (path === "delete-data" && req.method === "POST") {
      const s = bearer(req);
      if (!s) return send(res, 401, { error: "authentication required" });
      users.delete(s.uid);
      log(`delete-data @${s.login}`);
      return send(res, 200, { success: true });
    }

    // ── Advertiser portal (dev auth) ─────────────────────────────
    // POST /advertiser-auth {email} → mock advertiser session (stands in for
    // Supabase Auth Google/GitHub locally).
    if (path === "advertiser-auth" && req.method === "POST") {
      const b = await readBody(req);
      const email = (b.email && String(b.email)) || "advertiser@example.com";
      let advId = advByEmail.get(email);
      if (!advId) { advId = randomUUID(); advByEmail.set(email, advId); }
      const token = "adv-mock-" + randomUUID();
      advSessions.set(token, { advertiserId: advId, email });
      log(`advertiser-auth → ${email}`);
      return send(res, 200, { token, advertiser: { id: advId, email, name: email.split("@")[0] } });
    }
    if (path === "advertiser-analytics" && req.method === "GET") {
      const h = req.headers["authorization"] || "";
      const tok = (h.match(/^Bearer\s+(.+)$/i) || [])[1];
      const sess = tok && advSessions.get(tok);
      if (!sess) return send(res, 401, { error: "authentication required" });
      let days = Number(new URL(req.url, "http://x").searchParams.get("days") || 30);
      if (![7, 30, 90].includes(days)) days = 30;
      return send(res, 200, advertiserAnalytics(sess.advertiserId, days));
    }
    if (path === "advertiser-campaigns") {
      const h = req.headers["authorization"] || "";
      const tok = (h.match(/^Bearer\s+(.+)$/i) || [])[1];
      const sess = tok && advSessions.get(tok);
      if (!sess) return send(res, 401, { error: "authentication required" });
      if (req.method === "GET") {
        const pp = profileOf(sess.advertiserId);
        return send(res, 200, {
          campaigns: ADS.filter((a) => a.advertiser_id === sess.advertiserId).map(advCampaignView),
          wallet_usd: walletOf(sess.advertiserId),
          email: sess.email,
          currency_pref: pp.currency_pref,
          currency_pref_set_at: pp.set_at ? new Date(pp.set_at).toISOString() : null,
          fx_rate_locked: pp.fx_rate_locked,
          payments: (advPayments.get(sess.advertiserId) || []).slice(-10).reverse(),
        });
      }
      if (req.method === "POST") {
        const b = await readBody(req);
        const name = String(b.advertiser_name || "").trim();
        const text = String(b.text || "").trim();
        const url = String(b.url || "").trim();
        if (!name || name.length > 80) return send(res, 400, { error: "advertiser_name required (<=80)" });
        if (!text || text.length > 120) return send(res, 400, { error: "ad text required (<=120)" });
        if (!/^https?:\/\//.test(url)) return send(res, 400, { error: "valid URL required" });
        const verdict = moderateAdJs({ advertiser_name: name, text, url, description: b.description });
        const model = b.billing_model === "cpc" ? "cpc" : "cpm";
        const rates = model === "cpc"
          ? { cost_per_impression: 0, cost_per_click: 0.30, reward_imp: 0, reward_click: 90 }
          : { cost_per_impression: 0.01, cost_per_click: 0, reward_imp: 4, reward_click: 0 };
        const budget = Number(b.budget_remaining) || 0;
        // Fund approved campaigns from the wallet.
        if (verdict.ok && budget > 0) {
          if (walletOf(sess.advertiserId) < budget) {
            return send(res, 402, { error: "insufficient wallet balance — add funds to launch this campaign" });
          }
          advWallet.set(sess.advertiserId, walletOf(sess.advertiserId) - budget);
        }
        const ad = {
          ad_id: randomUUID(), advertiser_id: sess.advertiserId, advertiser_name: name, text, url,
          description: b.description || "", brand_color: b.brand_color || null, logo_url: b.logo_url || null,
          weight: 1, active: verdict.ok, status: verdict.ok ? "approved" : "rejected",
          moderation_reason: verdict.ok ? null : verdict.reason,
          review_flag: verdict.ok ? (verdict.flag || null) : null,
          billing_model: model,
          budget_remaining: verdict.ok ? budget : 0,
          cost_per_impression: rates.cost_per_impression, cost_per_click: rates.cost_per_click,
          reward_imp: rates.reward_imp, reward_click: rates.reward_click,
        };
        ADS.push(ad);
        log(`advertiser campaign "${name}" → ${verdict.ok ? "APPROVED" : "REJECTED: " + verdict.reason}`);
        return send(res, 200, { campaign: advCampaignView(ad), approved: verdict.ok, reason: verdict.ok ? null : verdict.reason });
      }
      if (req.method === "PATCH") {
        const b = await readBody(req);
        const ad = ADS.find((a) => a.ad_id === b.id && a.advertiser_id === sess.advertiserId);
        if (!ad) return send(res, 404, { error: "campaign not found" });
        if (typeof b.active === "boolean") ad.active = b.active;
        if (typeof b.text === "string") ad.text = b.text.trim();
        if (typeof b.description === "string") ad.description = b.description.trim();
        if (typeof b.url === "string") ad.url = b.url.trim();
        const changed = b.text !== undefined || b.url !== undefined || b.description !== undefined;
        if (changed) {
          const v = moderateAdJs({ advertiser_name: ad.advertiser_name, text: ad.text, url: ad.url, description: ad.description });
          if (!v.ok) { ad.status = "rejected"; ad.active = false; ad.moderation_reason = v.reason; ad.review_flag = null; }
          else { ad.status = "approved"; ad.moderation_reason = null; ad.review_flag = v.flag || null; }
        }
        const addBudget = Number(b.add_budget) || 0;
        if (addBudget > 0) {
          if (walletOf(sess.advertiserId) < addBudget) return send(res, 402, { error: "insufficient wallet balance" });
          advWallet.set(sess.advertiserId, walletOf(sess.advertiserId) - addBudget);
          ad.budget_remaining += addBudget;
        }
        return send(res, 200, { campaign: advCampaignView(ad), approved: ad.status !== "rejected", reason: ad.moderation_reason || null });
      }
      if (req.method === "DELETE") {
        const b = await readBody(req);
        const idx = ADS.findIndex((a) => a.ad_id === b.id && a.advertiser_id === sess.advertiserId);
        if (idx < 0) return send(res, 404, { error: "campaign not found" });
        const refund = ADS[idx].budget_remaining || 0;
        ADS.splice(idx, 1);
        if (refund > 0) advWallet.set(sess.advertiserId, walletOf(sess.advertiserId) + refund);
        log(`campaign deleted, refunded $${refund}`);
        return send(res, 200, { success: true, refunded: refund });
      }
    }
    // /advertiser-account — profile + delete (dev auth)
    if (path === "advertiser-account") {
      const h = req.headers["authorization"] || "";
      const tok = (h.match(/^Bearer\s+(.+)$/i) || [])[1];
      const sess = tok && advSessions.get(tok);
      if (!sess) return send(res, 401, { error: "authentication required" });
      if (req.method === "GET") {
        const p = profileOf(sess.advertiserId);
        return send(res, 200, {
          email: sess.email, name: sess.email.split("@")[0], provider: "email",
          wallet_usd: walletOf(sess.advertiserId),
          campaigns: ADS.filter((a) => a.advertiser_id === sess.advertiserId).length,
          created_at: new Date().toISOString(),
          currency_pref: p.currency_pref,
          currency_pref_set_at: p.set_at ? new Date(p.set_at).toISOString() : null,
          fx_rate_locked: p.fx_rate_locked,
          currency_locked_days: 30,
          can_change_currency: canChangeCurrency(p),
        });
      }
      if (req.method === "POST") {
        const b = await readBody(req);
        if (b.action === "set_currency") {
          if (b.currency !== "usd" && b.currency !== "inr") return send(res, 400, { error: "invalid currency" });
          const p = profileOf(sess.advertiserId);
          if (!canChangeCurrency(p)) {
            const until = new Date(p.set_at + LOCK_MS).toISOString().slice(0, 10);
            return send(res, 409, { error: `currency is locked until ${until}` });
          }
          // Lock the payment rail for 30 days; rate stays live (no freeze).
          p.currency_pref = b.currency; p.set_at = Date.now(); p.fx_rate_locked = null;
          return send(res, 200, { currency_pref: p.currency_pref, fx_rate_locked: null, can_change_currency: false });
        }
        if (b.action !== "delete") return send(res, 400, { error: "unknown action" });
        // Remove the advertiser's campaigns, wallet, payments, session.
        for (let i = ADS.length - 1; i >= 0; i--) if (ADS[i].advertiser_id === sess.advertiserId) ADS.splice(i, 1);
        advWallet.delete(sess.advertiserId);
        advPayments.delete(sess.advertiserId);
        advProfile.delete(sess.advertiserId);
        advByEmail.delete(sess.email);
        advSessions.delete(tok);
        log(`advertiser account deleted: ${sess.email}`);
        return send(res, 200, { success: true });
      }
    }
    // POST /payment-create — mock instantly credits the wallet (no real Stripe/Razorpay locally).
    if (path === "payment-create" && req.method === "POST") {
      const h = req.headers["authorization"] || "";
      const tok = (h.match(/^Bearer\s+(.+)$/i) || [])[1];
      const sess = tok && advSessions.get(tok);
      if (!sess) return send(res, 401, { error: "authentication required" });
      const b = await readBody(req);
      const amount = Number(b.amount);
      if (!isFinite(amount) || amount <= 0) return send(res, 400, { error: "invalid amount" });
      const requested = b.currency === "inr" || b.currency === "usd" ? b.currency
        : (String(b.country || "").toUpperCase() === "IN" ? "inr" : "usd");
      // Honor / set the locked currency rail; convert at the LIVE rate (no freeze).
      const p = profileOf(sess.advertiserId);
      const rate = await getMockRate();
      let currency;
      if (p.currency_pref) {
        currency = p.currency_pref;
        if (requested !== currency) return send(res, 409, { error: `your billing currency is locked to ${currency.toUpperCase()}` });
      } else {
        currency = requested;
        p.currency_pref = currency; p.set_at = Date.now(); p.fx_rate_locked = null;
      }
      const amountUsd = Math.round((currency === "inr" ? amount / rate : amount) * 100) / 100;
      if (amountUsd < 5) return send(res, 400, { error: "minimum top-up is $5" });
      // USD prefers Stripe, but falls back to Razorpay (International) when
      // Stripe isn't configured. INR always Razorpay.
      const provider = currency === "usd" && process.env.STRIPE_SECRET_KEY ? "stripe" : "razorpay";
      advWallet.set(sess.advertiserId, walletOf(sess.advertiserId) + amountUsd);
      const pay = { provider, currency, amount_minor: Math.round(amount * 100), amount_usd: amountUsd, status: "paid", created_at: new Date().toISOString() };
      if (!advPayments.has(sess.advertiserId)) advPayments.set(sess.advertiserId, []);
      advPayments.get(sess.advertiserId).push(pay);
      log(`payment ${provider} ${amount} ${currency} → +$${amountUsd} wallet (mock)`);
      return send(res, 200, { provider: "mock", credited: true, amount_usd: amountUsd, wallet_usd: walletOf(sess.advertiserId), currency });
    }

    // ── Admin (auth + is_admin) ──────────────────────────────────
    if (path === "admin-metrics" && req.method === "GET") {
      const s = bearer(req);
      if (!s || !s.is_owner) return send(res, s ? 403 : 401, { error: "owner access required" });
      return send(res, 200, adminMetrics());
    }
    if (path === "admin-flags" && req.method === "POST") {
      const s = bearer(req);
      if (!s || !s.is_owner) return send(res, s ? 403 : 401, { error: "owner access required" });
      const b = await readBody(req);
      if (b.key !== "ad_serving_enabled" || typeof b.value !== "boolean") return send(res, 400, { error: "bad flag" });
      flags.ad_serving_enabled = b.value;
      log(`flag ad_serving_enabled = ${b.value}`);
      return send(res, 200, { key: b.key, value: b.value });
    }
    if (path === "admin-ads") {
      const s = bearer(req);
      if (!s || !s.is_admin) return send(res, s ? 403 : 401, { error: "admin access required" });
      if (req.method === "GET") return send(res, 200, { ads: adsWithMetrics() });
      if (req.method === "POST") {
        const b = await readBody(req);
        if (!b.advertiser_name || !b.text || !/^https?:\/\//.test(b.url || "")) return send(res, 400, { error: "advertiser_name, text, http(s) url required" });
        const ad = { ad_id: randomUUID(), advertiser_name: b.advertiser_name, text: b.text, url: b.url, description: b.description || "", brand_color: b.brand_color || null, logo_url: b.logo_url || null, weight: b.weight || 1, active: b.active !== false, status: "approved", billing_model: "cpm", budget_remaining: b.budget_remaining || 0, cost_per_impression: b.cost_per_impression || 0.01, cost_per_click: 0, reward_imp: 4, reward_click: 0 };
        ADS.push(ad);
        log(`admin created ad ${ad.advertiser_name}`);
        return send(res, 200, { ad });
      }
      if (req.method === "PATCH") {
        const b = await readBody(req);
        const ad = ADS.find((a) => a.ad_id === b.id);
        if (!ad) return send(res, 400, { error: "unknown ad" });
        if (typeof b.active === "boolean") ad.active = b.active;
        if (typeof b.weight === "number") ad.weight = Math.floor(b.weight);
        if (typeof b.budget_remaining === "number") ad.budget_remaining = b.budget_remaining;
        if (typeof b.text === "string") ad.text = b.text;
        if (typeof b.url === "string") ad.url = b.url;
        log(`admin patched ad ${ad.advertiser_name}`);
        return send(res, 200, { ad });
      }
    }

    return send(res, 404, { error: "not found" });
  } catch (e) {
    return send(res, 400, { error: e instanceof Error ? e.message : "bad request" });
  }
});

function advCampaignView(a) {
  const c = adsWithMetrics().find((m) => m.id === a.ad_id) || { impressions: 0, clicks: 0, spend: 0 };
  return {
    id: a.ad_id, advertiser_name: a.advertiser_name, text: a.text, url: a.url, description: a.description,
    brand_color: a.brand_color, logo_url: a.logo_url, billing_model: a.billing_model, status: a.status, moderation_reason: a.moderation_reason || null, review_flag: a.review_flag || null,
    active: a.active, weight: a.weight, budget_remaining: a.budget_remaining,
    cost_per_impression: a.cost_per_impression, cost_per_click: a.cost_per_click,
    impressions: c.impressions, clicks: c.clicks, spend: c.spend,
  };
}

// Daily impressions/clicks/spend for one advertiser over the last N days.
// Mirrors the backend advertiser_daily_metrics RPC. Events live in user ledgers
// keyed by advertiser_name; spend uses that advertiser's per-model rates.
function advertiserAnalytics(advertiserId, days) {
  const myAds = ADS.filter((a) => a.advertiser_id === advertiserId);
  const names = new Set(myAds.map((a) => a.advertiser_name));
  // Representative rate per advertiser_name (first matching ad wins).
  const rateOf = {};
  for (const a of myAds) {
    if (!rateOf[a.advertiser_name]) rateOf[a.advertiser_name] = { cpi: a.cost_per_impression, cpc: a.cost_per_click };
  }
  // Zero-filled, chronological day buckets.
  const buckets = new Map();
  const dayKeys = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dayKeys.push(key);
    buckets.set(key, { day: key, impressions: 0, clicks: 0, spend_usd: 0 });
  }
  let real = 0;
  for (const [, u] of users) {
    for (const e of u.ledger) {
      if (e.event_type !== "impression" && e.event_type !== "click") continue;
      if (!names.has(e.advertiser)) continue;
      const key = String(e.at).slice(0, 10);
      const b = buckets.get(key);
      if (!b) continue;
      const r = rateOf[e.advertiser] || { cpi: 0.01, cpc: 0.3 };
      if (e.event_type === "click") { b.clicks++; b.spend_usd += r.cpc; }
      else { b.impressions++; b.spend_usd += r.cpi; }
      real++;
    }
  }
  let series = dayKeys.map((k) => {
    const b = buckets.get(k);
    return { ...b, spend_usd: Math.round(b.spend_usd * 100) / 100 };
  });
  // Local-dev convenience: with campaigns but no real traffic yet, synthesize a
  // plausible series so the charts are visible. (Mock server only.)
  if (real === 0 && myAds.length > 0) {
    series = dayKeys.map((k, i) => {
      const impressions = Math.max(0, Math.round(38 + 26 * Math.sin(i / 4) + i * 1.4 + ((i * 7) % 11)));
      const clicks = Math.round(impressions * (0.02 + ((i % 5) * 0.004)));
      return { day: k, impressions, clicks, spend_usd: Math.round((impressions * 0.01 + clicks * 0.3) * 100) / 100 };
    });
  }
  const impressions = series.reduce((s, r) => s + r.impressions, 0);
  const clicks = series.reduce((s, r) => s + r.clicks, 0);
  const spend_usd = Math.round(series.reduce((s, r) => s + r.spend_usd, 0) * 100) / 100;
  return {
    days, series,
    totals: { impressions, clicks, spend_usd, ctr: impressions ? Math.round((clicks / impressions) * 10000) / 100 : 0 },
  };
}

function adsWithMetrics() {
  const counts = {};
  for (const [, u] of users) {
    for (const e of u.ledger) {
      if (e.event_type === "impression" || e.event_type === "click") {
        counts[e.advertiser] = counts[e.advertiser] || { impressions: 0, clicks: 0 };
        counts[e.advertiser][e.event_type === "click" ? "clicks" : "impressions"]++;
      }
    }
  }
  return ADS.map((a) => {
    const c = counts[a.advertiser_name] || { impressions: 0, clicks: 0 };
    return { id: a.ad_id, advertiser_name: a.advertiser_name, text: a.text, active: a.active, status: a.status, review_flag: a.review_flag || null, budget_remaining: a.budget_remaining, weight: a.weight, impressions: c.impressions, clicks: c.clicks, spend: Math.round((c.impressions * a.cost_per_impression + c.clicks * a.cost_per_click) * 100) / 100 };
  });
}

function adminMetrics() {
  const ads = adsWithMetrics();
  const impressions = ads.reduce((s, a) => s + a.impressions, 0);
  const clicks = ads.reduce((s, a) => s + a.clicks, 0);
  const spend = Math.round(ads.reduce((s, a) => s + a.spend, 0) * 100) / 100;
  let creditsEarned = 0, creditsRedeemed = 0, redemptions = 0;
  for (const [, u] of users) {
    creditsEarned += u.ledger.filter((e) => e.amount > 0).reduce((a, e) => a + e.amount, 0);
    for (const e of u.ledger) {
      if (e.reason === "redemption") { creditsRedeemed += -e.amount; redemptions++; }
    }
  }
  const usd = (c) => Math.round(c * CREDIT_USD * 100) / 100;
  const payout = usd(creditsEarned);
  const r2 = (n) => Math.round(n * 100) / 100;
  // Treasury (real cash positions).
  let collected = 0;
  for (const [, list] of advPayments) for (const p of list) if (p.status === "paid") collected += p.amount_usd;
  let walletFloat = 0; for (const [, w] of advWallet) walletFloat += w;
  const budgetFloat = ADS.filter((a) => a.advertiser_id && a.status !== "rejected").reduce((s, a) => s + a.budget_remaining, 0);
  const advertiserFloat = walletFloat + budgetFloat;
  const devLiability = usd(creditsEarned - creditsRedeemed);
  const treasury = {
    collected_usd: r2(collected),
    openrouter_spent_usd: r2(mockOpenRouterSpent),
    net_cash_usd: r2(collected - mockOpenRouterSpent),
    advertiser_float_usd: r2(advertiserFloat),
    dev_liability_usd: r2(devLiability),
    distributable_usd: r2(collected - mockOpenRouterSpent - advertiserFloat - devLiability),
  };
  return {
    treasury,
    totals: {
      spend, impressions, clicks,
      ctr: impressions ? Math.round((clicks / impressions) * 10000) / 100 : 0,
      users: users.size, payout_usd: payout, margin_usd: Math.round((spend - payout) * 100) / 100,
      credits_earned: creditsEarned, credits_redeemed: creditsRedeemed,
      earned_usd: usd(creditsEarned), redeemed_usd: usd(creditsRedeemed),
      outstanding_usd: usd(creditsEarned - creditsRedeemed),
      redemptions, total_campaigns: ads.length, active_campaigns: ads.filter((a) => a.active).length,
    },
    ad_serving_enabled: flags.ad_serving_enabled,
    flagged_campaigns: ads.filter((a) => a.review_flag).length,
    campaigns: ads.map((a) => ({ id: a.id, advertiser_name: a.advertiser_name, text: a.text, active: a.active, status: a.status, review_flag: a.review_flag || null, impressions: a.impressions, clicks: a.clicks, spend: a.spend, budget_remaining: a.budget_remaining })),
  };
}

function hashToInt(s) {
  return parseInt(crypto.createHash("sha256").update(s).digest("hex").slice(0, 12), 16);
}
function log(msg) {
  console.log(`${new Date().toLocaleTimeString()}  ${msg}`);
}

server.listen(PORT, () => {
  console.log(`CodeSlot mock backend on http://localhost:${PORT}`);
  console.log(`Extension:  "codeslot.apiBaseUrl": "http://localhost:${PORT}"`);
  console.log(`Dashboard:  VITE_API_BASE_URL=http://localhost:${PORT}`);
});
