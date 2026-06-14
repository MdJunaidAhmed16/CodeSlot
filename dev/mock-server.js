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
  { ad_id: randomUUID(), advertiser_name: "Vercel", text: "Vercel — Deploy in seconds →", url: "https://vercel.com", description: "Ship frontend apps with zero config.", brand_color: "#ffffff", logo_url: "https://assets.vercel.com/image/upload/front/favicon/vercel/57x57.png", weight: 3, active: true, status: "approved", budget_remaining: 100, cost_per_impression: 0.01, cost_per_click: 0.2, reward_imp: 5, reward_click: 75 },
  { ad_id: randomUUID(), advertiser_name: "Supabase", text: "Supabase — Open source Firebase alternative", url: "https://supabase.com", description: "Postgres, auth, and realtime. Free tier forever.", brand_color: "#3ecf8e", logo_url: "https://supabase.com/favicon/favicon-48x48.png", weight: 2, active: true, status: "approved", budget_remaining: 100, cost_per_impression: 0.01, cost_per_click: 0.2, reward_imp: 5, reward_click: 75 },
  { ad_id: randomUUID(), advertiser_name: "Snyk", text: "Snyk — Find and fix vulnerabilities", url: "https://snyk.io", description: "Developer-first security for your dependencies.", brand_color: "#4c4a73", logo_url: "https://snyk.io/favicon-32x32.png", weight: 1, active: true, status: "approved", budget_remaining: 100, cost_per_impression: 0.01, cost_per_click: 0.2, reward_imp: 5, reward_click: 75 },
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
const USD_INR_RATE = 83;
const walletOf = (id) => advWallet.get(id) || 0;

function userOf(id) {
  if (!users.has(id)) users.set(id, { login: "dev", is_owner: DEV_OWNER, is_admin: true, ledger: [], seenIdem: new Set() });
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
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
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
      "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
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
      // CORE INVARIANT: only credit when the advertiser's budget covers the cost.
      if (ad.budget_remaining < cost) return send(res, 200, { success: true, credits_earned: 0, new_balance: balanceOf(s.uid) });
      u.seenIdem.add(b.idempotency_key);
      const earned = b.event_type === "click" ? ad.reward_click : ad.reward_imp;
      u.ledger.push({ amount: earned, reason: b.event_type, advertiser: ad.advertiser_name, event_type: b.event_type, at: new Date().toISOString() });
      ad.budget_remaining = ad.budget_remaining - cost;
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
    if (path === "advertiser-campaigns") {
      const h = req.headers["authorization"] || "";
      const tok = (h.match(/^Bearer\s+(.+)$/i) || [])[1];
      const sess = tok && advSessions.get(tok);
      if (!sess) return send(res, 401, { error: "authentication required" });
      if (req.method === "GET") {
        return send(res, 200, {
          campaigns: ADS.filter((a) => a.advertiser_id === sess.advertiserId).map(advCampaignView),
          wallet_usd: walletOf(sess.advertiserId),
          email: sess.email,
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
          budget_remaining: verdict.ok ? budget : 0, cost_per_impression: 0.01, cost_per_click: 0.2, reward_imp: 5, reward_click: 75,
        };
        ADS.push(ad);
        log(`advertiser campaign "${name}" → ${verdict.ok ? "APPROVED" : "REJECTED: " + verdict.reason}`);
        return send(res, 200, { campaign: advCampaignView(ad), approved: verdict.ok, reason: verdict.ok ? null : verdict.reason });
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
      const currency = b.currency === "inr" || b.currency === "usd" ? b.currency
        : (String(b.country || "").toUpperCase() === "IN" ? "inr" : "usd");
      const amountUsd = Math.round((currency === "inr" ? amount / USD_INR_RATE : amount) * 100) / 100;
      if (amountUsd < 5) return send(res, 400, { error: "minimum top-up is $5" });
      const provider = currency === "inr" ? "razorpay" : "stripe";
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
        const ad = { ad_id: randomUUID(), advertiser_name: b.advertiser_name, text: b.text, url: b.url, description: b.description || "", brand_color: b.brand_color || null, logo_url: b.logo_url || null, weight: b.weight || 1, active: b.active !== false, status: "approved", budget_remaining: b.budget_remaining || 0, cost_per_impression: b.cost_per_impression || 0.01, cost_per_click: b.cost_per_click || 0.2, reward_imp: 5, reward_click: 75 };
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
    brand_color: a.brand_color, logo_url: a.logo_url, status: a.status, moderation_reason: a.moderation_reason || null, review_flag: a.review_flag || null,
    active: a.active, weight: a.weight, budget_remaining: a.budget_remaining,
    cost_per_impression: a.cost_per_impression, cost_per_click: a.cost_per_click,
    impressions: c.impressions, clicks: c.clicks, spend: c.spend,
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
  return {
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
