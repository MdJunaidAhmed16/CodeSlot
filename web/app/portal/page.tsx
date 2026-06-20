"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  type Campaign, type Currency, type BillingModel, RATES, listCampaigns, submitCampaign,
  patchCampaign, deleteCampaign, isSignedIn, devSignOut, devEmail, createPayment, verifyPayment, setCurrencyPref,
} from "@/lib/api";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { openRazorpay } from "@/lib/razorpay";
import { uploadLogo } from "@/lib/storage";
import { fmt, toUsd, inrHint, fetchLiveRate } from "@/lib/currency";
import { ProfileMenu } from "@/components/profile-menu";
import { AnalyticsPanel } from "@/components/analytics-panel";
import {
  CheckCircle2, XCircle, ExternalLink, Plus, LogOut, Wallet, Upload, ImageIcon, Lock,
  Pause, Play, Pencil, Trash2,
} from "lucide-react";

const LOCK_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_TOPUP_USD = 5; // matches the backend payment-create minimum

/** Small, clearly-live "≈ ₹X" hint shown to INR-rail advertisers next to USD. */
function InrHint({ usd, pref, rate, className = "", suffix = " today" }: { usd: number; pref: Currency | null; rate: number; className?: string; suffix?: string }) {
  if (pref !== "inr") return null;
  return <span className={"text-muted-foreground " + className}>{inrHint(usd, rate)}{suffix}</span>;
}

export default function PortalPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [wallet, setWallet] = useState(0);
  const [email, setEmail] = useState<string | null>(null);
  const [pref, setPref] = useState<Currency | null>(null);
  const [prefSetAt, setPrefSetAt] = useState<string | null>(null);
  const [rate, setRate] = useState(90);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await listCampaigns();
      setCampaigns(data.campaigns);
      setWallet(data.wallet_usd);
      setEmail(data.email);
      setPref(data.currency_pref);
      setPrefSetAt(data.currency_pref_set_at);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load campaigns");
    }
  }, []);

  // The display is always USD (the unit ads are priced in); `pref` is only the
  // locked payment rail, and the rate is always live (used for ₹ hints + checkout).
  const canChangeCurrency = !prefSetAt || Date.now() - Date.parse(prefSetAt) >= LOCK_MS;
  const lockedUntil = prefSetAt ? new Date(Date.parse(prefSetAt) + LOCK_MS) : null;

  const changeCurrency = useCallback(async (c: Currency) => {
    await setCurrencyPref(c);
    await load();
  }, [load]);

  useEffect(() => {
    fetchLiveRate().then(setRate).catch(() => {});
    (async () => {
      if (!(await isSignedIn())) {
        router.replace("/login");
        return;
      }
      setReady(true);
      await load();
      // Came from a pricing "Start a campaign" CTA → jump to the form.
      try {
        if (localStorage.getItem("codeslot.intent") === "new-campaign") {
          localStorage.removeItem("codeslot.intent");
          setTimeout(() => {
            const el = document.getElementById("new-campaign");
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
            el?.classList.add("ring-2", "ring-primary");
            setTimeout(() => el?.classList.remove("ring-2", "ring-primary"), 2000);
          }, 150);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [router, load]);

  async function signOut() {
    if (supabaseConfigured) await getSupabase()?.auth.signOut();
    else devSignOut();
    router.replace("/login");
  }

  if (!ready) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="container flex-1 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Your campaigns</h1>
            <p className="text-sm text-muted-foreground">{devEmail() ?? "Signed in"} · auto-approved after a safety review</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => void signOut()}><LogOut className="h-4 w-4" /> Sign out</Button>
            <ProfileMenu email={email} rate={rate} pref={pref}
              canChange={canChangeCurrency} lockedUntil={lockedUntil} onSetCurrency={changeCurrency} />
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
          <div className="space-y-6">
            <WalletPanel wallet={wallet} pref={pref} rate={rate} canChange={canChangeCurrency} onTopUp={load} />
            <NewCampaign wallet={wallet} pref={pref} rate={rate} onDone={load} />
          </div>
          <div className="space-y-6">
            <AnalyticsPanel pref={pref} rate={rate} />
            <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Active &amp; past campaigns</h2>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {campaigns.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No campaigns yet. Create your first one →</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {campaigns.map((c) => <CampaignRow key={c.id} c={c} wallet={wallet} pref={pref} rate={rate} onChanged={load} />)}
              </div>
            )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function NewCampaign({ wallet, pref, rate, onDone }: {
  wallet: number; pref: Currency | null; rate: number; onDone: () => Promise<void>;
}) {
  const [form, setForm] = useState({ advertiser_name: "", text: "", url: "", description: "", budget_remaining: "6" });
  const [billing, setBilling] = useState<BillingModel>("cpm");
  const [useColor, setUseColor] = useState(false);
  const [brandColor, setBrandColor] = useState("#3ecf8e");
  const [logoUrl, setLogoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoErr(null);
    setUploading(true);
    try {
      setLogoUrl(await uploadLogo(file));
    } catch (err) {
      setLogoErr(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  // Budget is entered directly in USD (the wallet's unit).
  const budgetUsd = Number(form.budget_remaining) || 0;
  // What the advertiser pays now if the wallet can't cover the budget (min top-up).
  const chargeUsd = Math.max(Math.round((budgetUsd - wallet) * 100) / 100, MIN_TOPUP_USD);

  const buildInput = () => ({
    advertiser_name: form.advertiser_name,
    text: form.text,
    url: form.url,
    description: form.description || undefined,
    brand_color: useColor ? brandColor : undefined,
    logo_url: logoUrl || undefined,
    billing_model: billing,
    budget_remaining: budgetUsd,
  });

  function onApproved() {
    setResult({ ok: true, msg: "Approved and live! 🎉" });
    setForm({ advertiser_name: "", text: "", url: "", description: "", budget_remaining: "6" });
    setLogoUrl("");
  }

  // One submit attempt. Resolves "live" | "rejected"; throws with status 402 when
  // the ad passed moderation but the wallet can't cover the budget - the caller
  // then runs pay-to-launch. (Rejected ads never reach payment.)
  async function trySubmit(input: ReturnType<typeof buildInput>): Promise<"live" | "rejected"> {
    const r = await submitCampaign(input);
    if (r.approved) { onApproved(); await onDone(); return "live"; }
    setResult({ ok: false, msg: r.reason ?? "Rejected by automated review." });
    await onDone();
    return "rejected";
  }

  // Charge the shortfall (≥ min top-up), confirm it synchronously, then relaunch -
  // now funded → live. Any extra paid stays in the wallet for the next campaign.
  async function payToLaunch(input: ReturnType<typeof buildInput>) {
    const rail: Currency = pref ?? "usd";
    const amount = rail === "inr" ? Math.ceil(chargeUsd * rate) : chargeUsd;
    const pr = await createPayment(amount, rail);
    if (pr.provider === "razorpay" && pr.order_id) {
      setResult({ ok: true, msg: "Complete the secure checkout to launch…" });
      await openRazorpay(pr, async (resp) => {
        setBusy(true);
        try {
          await verifyPayment(resp);
          await onDone();
          await trySubmit(input);
        } catch (err) {
          setResult({ ok: false, msg: err instanceof Error ? err.message : "Payment received - refresh in a moment to launch." });
        } finally {
          setBusy(false);
        }
      });
      return;
    }
    if (pr.provider === "stripe" && pr.checkout_url) {
      window.location.href = pr.checkout_url; // Stripe disabled at present
      return;
    }
    // mock / instant credit
    await onDone();
    await trySubmit(input);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const input = buildInput();
    try {
      await trySubmit(input);
    } catch (err) {
      if ((err as { status?: number }).status === 402) {
        await payToLaunch(input); // approved, just needs funding
      } else {
        setResult({ ok: false, msg: err instanceof Error ? err.message : "Submission failed" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="new-campaign" className="h-fit scroll-mt-24 transition-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> New campaign</CardTitle>
        <CardDescription>Goes live instantly once it passes our automated safety review.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Advertiser / brand"><Input required maxLength={80} value={form.advertiser_name} onChange={set("advertiser_name")} placeholder="Acme CI" /></Field>
          <Field label="Ad text (max 120 chars)"><Input required maxLength={120} value={form.text} onChange={set("text")} placeholder="Acme CI - faster builds →" /></Field>
          <Field label="Destination URL (https)"><Input required type="url" value={form.url} onChange={set("url")} placeholder="https://acme.dev" /></Field>
          <Field label="Description (optional)"><Textarea value={form.description} onChange={set("description")} placeholder="One line shown in the tooltip." /></Field>

          <div className="space-y-2">
            <Label>Logo (optional)</Label>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="logo" className="h-full w-full object-contain" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                {supabaseConfigured ? (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
                    <Upload className="h-4 w-4" />
                    {uploading ? "Uploading…" : logoUrl ? "Replace image" : "Upload image"}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={onLogoFile} disabled={uploading} />
                  </label>
                ) : (
                  <Input placeholder="https://…/logo.png" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
                )}
                <p className="text-xs text-muted-foreground">PNG/JPG/WEBP/SVG, max 512 KB.</p>
              </div>
            </div>
            {logoErr && <p className="text-xs text-destructive">{logoErr}</p>}
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={useColor} onChange={(e) => setUseColor(e.target.checked)} />
              Use a brand color
            </label>
            {useColor && (
              <div className="flex items-center gap-3">
                <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border bg-transparent p-1" aria-label="Brand color" />
                <Input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="font-mono" />
              </div>
            )}
            <AdPreview text={form.text || "Acme CI - faster builds →"} color={useColor ? brandColor : null} />
          </div>

          <div className="space-y-2">
            <Label>Billing model</Label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setBilling("cpm")}
                className={`rounded-md border p-3 text-left text-sm ${billing === "cpm" ? "border-primary ring-1 ring-primary" : ""}`}>
                <div className="font-semibold">CPM · {RATES.cpm.price}</div>
                <div className="text-xs text-muted-foreground">Pay {RATES.cpm.per}</div>
              </button>
              <button type="button" onClick={() => setBilling("cpc")}
                className={`rounded-md border p-3 text-left text-sm ${billing === "cpc" ? "border-primary ring-1 ring-primary" : ""}`}>
                <div className="font-semibold">CPC · {RATES.cpc.price}</div>
                <div className="text-xs text-muted-foreground">Pay {RATES.cpc.per}</div>
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {billing === "cpm"
                ? "Charged per impression; clicks are free. Developers earn on impressions."
                : "Charged only when a developer clicks; impressions are free."}
            </p>
          </div>

          <Field label="Campaign budget ($)">
            <Input type="number" min={0} value={form.budget_remaining} onChange={set("budget_remaining")} />
            <p className="text-xs text-muted-foreground">
              Reserved from your wallet and spent as your ad runs - it can&apos;t exceed your wallet balance
              ({fmt(wallet, "usd", rate)} available). At ${billing === "cpm" ? "6 CPM" : "0.30/click"}, ${form.budget_remaining || 0} buys{" "}
              {billing === "cpm"
                ? `≈ ${Math.round(budgetUsd / RATES.cpm.costPerImpression).toLocaleString()} impressions`
                : `≈ ${Math.round(budgetUsd / RATES.cpc.costPerClick).toLocaleString()} clicks`}
              {pref === "inr" && <> · <InrHint usd={budgetUsd} pref={pref} rate={rate} suffix="" /></>}.
            </p>
            {budgetUsd > wallet && (
              <p className="text-xs text-muted-foreground">
                You&apos;ll pay {fmt(chargeUsd, "usd", rate)} securely at checkout to launch
                {wallet > 0 ? ` (your ${fmt(wallet, "usd", rate)} balance is applied)` : ""}. Any extra stays in your wallet.
              </p>
            )}
          </Field>
          <Button type="submit" className="w-full" disabled={busy || budgetUsd <= 0}>
            {busy ? "Working…" : budgetUsd > wallet ? `Pay ${fmt(chargeUsd, "usd", rate)} & launch` : "Submit campaign"}
          </Button>
          {result && (
            <div className={`flex items-start gap-2 rounded-md p-3 text-sm ${result.ok ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
              {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{result.msg}</span>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/** Live preview of the status-bar slot in dark and light VS Code themes.
 *  Fallback: no brand color → theme default (white-on-dark, black-on-light). */
function AdPreview({ text, color }: { text: string; color: string | null }) {
  const truncated = text.length > 48 ? text.slice(0, 47) + "…" : text;
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">Preview (how it appears in the status bar)</div>
      <div className="space-y-1.5">
        <PreviewBar bg="#0d1117" defaultText="#ffffff" label="Dark theme" text={truncated} color={color} />
        <PreviewBar bg="#f3f3f3" defaultText="#1f1f1f" label="Light theme" text={truncated} color={color} />
      </div>
      {color && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Your brand color tints the text. VS Code doesn&apos;t allow custom backgrounds in the status bar,
          so pick a color that stays readable on both light and dark themes. Your logo shows in the hover tooltip.
        </p>
      )}
    </div>
  );
}

function PreviewBar({ bg, defaultText, label, text, color }: { bg: string; defaultText: string; label: string; text: string; color: string | null }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <div className="flex flex-1 items-center justify-end gap-3 rounded px-3 py-1.5 font-mono text-xs" style={{ background: bg }}>
        <span style={{ color: color ?? defaultText }}>📣 {text}</span>
        <span style={{ color: "#3fb950" }}>$0.04</span>
      </div>
    </div>
  );
}

function WalletPanel({ wallet, pref, rate, canChange, onTopUp }: {
  wallet: number; pref: Currency | null; rate: number; canChange: boolean; onTopUp: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> Wallet</CardTitle>
        <CardDescription>Prepaid balance used to fund campaigns.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{fmt(wallet, "usd", rate)}</div>
        {pref === "inr" && <div className="text-sm"><InrHint usd={wallet} pref={pref} rate={rate} /></div>}
        <Button className="mt-4 w-full" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add funds</Button>
        {open && (
          <AddFundsDialog onClose={() => setOpen(false)} onDone={onTopUp}
            pref={pref} rate={rate} canChange={canChange} />
        )}
      </CardContent>
    </Card>
  );
}

function AddFundsDialog({ onClose, onDone, pref, rate, canChange }: {
  onClose: () => void; onDone: () => Promise<void>;
  pref: Currency | null; rate: number; canChange: boolean;
}) {
  // If a currency is locked, fund in it only. Otherwise let them pick (the first
  // top-up locks the rail for 30 days). Conversion is always at the live rate.
  const [currency, setCurrency] = useState<Currency>(pref ?? "usd");
  const locked = !canChange && pref != null;
  const [amount, setAmount] = useState(currency === "inr" ? "900" : "10");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setErr(null);
    try {
      const r = await createPayment(Number(amount), currency);
      if (r.provider === "stripe" && r.checkout_url) {
        window.location.href = r.checkout_url; // hosted Stripe Checkout
        return;
      }
      if (r.provider === "razorpay" && r.order_id) {
        await openRazorpay(r, async (resp) => {
          try { await verifyPayment(resp); } catch { /* webhook is the backstop */ }
          await onDone();
          onClose();
        });
        return;
      }
      // mock / instant credit
      await onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  const sym = currency === "inr" ? "₹" : "$";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle>Add funds</CardTitle>
          <CardDescription>
            Secure checkout via Razorpay · credited to your USD wallet
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {locked ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <Lock className="h-4 w-4 text-muted-foreground" />
              Billing currency: <b>{currency === "inr" ? "₹ INR" : "$ USD"}</b> (locked)
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Button type="button" variant={currency === "usd" ? "default" : "outline"} size="sm" className="flex-1"
                  onClick={() => { setCurrency("usd"); setAmount("10"); }}>$ USD</Button>
                <Button type="button" variant={currency === "inr" ? "default" : "outline"} size="sm" className="flex-1"
                  onClick={() => { setCurrency("inr"); setAmount("900"); }}>₹ INR</Button>
              </div>
              <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                ⚠️ Your billing currency locks for 30 days once you add funds. Top-ups always
                convert at the live exchange rate.
              </p>
            </>
          )}
          <div className="space-y-1.5">
            <Label>Amount ({sym})</Label>
            <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            {currency === "inr" && (
              <p className="text-xs text-muted-foreground">
                Live rate $1 = ₹{rate.toFixed(2)} · credits ≈ ${(toUsd(Number(amount) || 0, "inr", rate)).toFixed(2)} to your wallet
              </p>
            )}
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={busy} onClick={() => void pay()}>{busy ? "Processing…" : `Pay ${sym}${amount}`}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CampaignRow({ c, wallet, pref, rate, onChanged }: {
  c: Campaign; wallet: number; pref: Currency | null; rate: number; onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    setBusy(true); setErr(null);
    try { await patchCampaign(c.id, { active: !c.active }); await onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setErr(null);
    try { await deleteCampaign(c.id); await onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed"); setBusy(false); }
  }

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{c.advertiser_name}</span>
              <StatusBadge c={c} />
              {c.billing_model && <Badge variant="outline" className="uppercase">{c.billing_model}</Badge>}
            </div>
            <p className="truncate text-sm text-muted-foreground">{c.text}</p>
            {c.status === "rejected" && c.moderation_reason && (
              <p className="mt-1 text-xs text-destructive">{c.moderation_reason}</p>
            )}
            {c.review_flag && <p className="mt-1 text-xs text-amber-500">⚠ {c.review_flag}</p>}
            <a href={c.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
              {c.url} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="shrink-0 text-right text-sm">
            <div className="font-mono">{(c.impressions ?? 0).toLocaleString()} impr · {(c.clicks ?? 0).toLocaleString()} clk</div>
            <div className="text-muted-foreground">{fmt(c.budget_remaining ?? 0, "usd", rate)} left</div>
            <div className="text-xs"><InrHint usd={c.budget_remaining ?? 0} pref={pref} rate={rate} /></div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1 border-t pt-2">
          <Button variant="ghost" size="sm" disabled={busy || c.status === "rejected"} onClick={() => void toggle()}>
            {c.active ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> Resume</>}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => setConfirming(true)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
          {err && <span className="text-xs text-destructive">{err}</span>}
        </div>

        {confirming && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-destructive/10 p-2 text-xs">
            <span>Delete this campaign? Any remaining budget is refunded to your wallet.</span>
            <span className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}>Delete</Button>
            </span>
          </div>
        )}
      </CardContent>

      {editing && (
        <EditCampaignDialog c={c} wallet={wallet} pref={pref} rate={rate}
          onClose={() => setEditing(false)} onDone={onChanged} />
      )}
    </Card>
  );
}

function EditCampaignDialog({ c, wallet, pref, rate, onClose, onDone }: {
  c: Campaign; wallet: number; pref: Currency | null; rate: number;
  onClose: () => void; onDone: () => Promise<void>;
}) {
  const [text, setText] = useState(c.text);
  const [description, setDescription] = useState(c.description ?? "");
  const [url, setUrl] = useState(c.url);
  const [addBudget, setAddBudget] = useState("0");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Top-up entered directly in USD (the wallet's unit).
  const addUsd = Number(addBudget) || 0;

  async function save() {
    if (addUsd > wallet) { setResult({ ok: false, msg: "Top-up exceeds wallet balance." }); return; }
    setBusy(true); setResult(null);
    try {
      const r = await patchCampaign(c.id, {
        text, description: description || undefined, url,
        add_budget: addUsd > 0 ? addUsd : undefined,
      });
      if (r.approved) {
        setResult({ ok: true, msg: "Saved." });
        await onDone();
        setTimeout(onClose, 600);
      } else {
        setResult({ ok: false, msg: r.reason ?? "Rejected by automated review - campaign paused." });
        await onDone();
      }
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : "Update failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle>Edit campaign</CardTitle>
          <CardDescription>Changing the text or URL re-runs the safety review.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Ad text (max 120 chars)"><Input maxLength={120} value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <Field label="Destination URL"><Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
          <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="Add budget ($)">
            <Input type="number" min={0} value={addBudget} onChange={(e) => setAddBudget(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Wallet: {fmt(wallet, "usd", rate)} available{" "}
              {pref === "inr" && addUsd > 0 && <>· <InrHint usd={addUsd} pref={pref} rate={rate} /></>}
            </p>
          </Field>
          {result && (
            <div className={`flex items-start gap-2 rounded-md p-2 text-sm ${result.ok ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
              {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{result.msg}</span>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save changes"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ c }: { c: Campaign }) {
  if (c.status === "rejected") return <Badge variant="destructive">Rejected</Badge>;
  if (!c.active || c.status === "paused") return <Badge variant="secondary">Paused</Badge>;
  return <Badge variant="success">Live</Badge>;
}
