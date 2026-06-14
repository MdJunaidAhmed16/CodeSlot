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
  type Campaign, type Currency, listCampaigns, submitCampaign, isSignedIn, devSignOut, devEmail,
  createPayment, guessCurrency,
} from "@/lib/api";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { openRazorpay } from "@/lib/razorpay";
import { CheckCircle2, XCircle, ExternalLink, Plus, LogOut, Wallet } from "lucide-react";

export default function PortalPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [wallet, setWallet] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await listCampaigns();
      setCampaigns(data.campaigns);
      setWallet(data.wallet_usd);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load campaigns");
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (!(await isSignedIn())) {
        router.replace("/login");
        return;
      }
      setReady(true);
      await load();
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
          <Button variant="ghost" size="sm" onClick={() => void signOut()}><LogOut className="h-4 w-4" /> Sign out</Button>
        </div>

        <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
          <div className="space-y-6">
            <WalletPanel wallet={wallet} onTopUp={load} />
            <NewCampaign wallet={wallet} onDone={load} />
          </div>
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Active &amp; past campaigns</h2>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {campaigns.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No campaigns yet. Create your first one →</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {campaigns.map((c) => <CampaignRow key={c.id} c={c} />)}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function NewCampaign({ wallet, onDone }: { wallet: number; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({ advertiser_name: "", text: "", url: "", description: "", budget_remaining: "50" });
  const [useColor, setUseColor] = useState(false);
  const [brandColor, setBrandColor] = useState("#3ecf8e");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const r = await submitCampaign({
        advertiser_name: form.advertiser_name,
        text: form.text,
        url: form.url,
        description: form.description || undefined,
        brand_color: useColor ? brandColor : undefined,
        budget_remaining: Number(form.budget_remaining) || 0,
      });
      if (r.approved) {
        setResult({ ok: true, msg: "Approved and live! 🎉" });
        setForm({ advertiser_name: "", text: "", url: "", description: "", budget_remaining: "50" });
      } else {
        setResult({ ok: false, msg: r.reason ?? "Rejected by automated review." });
      }
      await onDone();
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : "Submission failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> New campaign</CardTitle>
        <CardDescription>Goes live instantly once it passes our automated safety review.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Advertiser / brand"><Input required maxLength={80} value={form.advertiser_name} onChange={set("advertiser_name")} placeholder="Acme CI" /></Field>
          <Field label="Ad text (max 120 chars)"><Input required maxLength={120} value={form.text} onChange={set("text")} placeholder="Acme CI — faster builds →" /></Field>
          <Field label="Destination URL (https)"><Input required type="url" value={form.url} onChange={set("url")} placeholder="https://acme.dev" /></Field>
          <Field label="Description (optional)"><Textarea value={form.description} onChange={set("description")} placeholder="One line shown in the tooltip." /></Field>

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
            <AdPreview text={form.text || "Acme CI — faster builds →"} color={useColor ? brandColor : null} />
          </div>

          <Field label="Budget (USD)">
            <Input type="number" min={0} value={form.budget_remaining} onChange={set("budget_remaining")} />
            <p className="text-xs text-muted-foreground">Drawn from your wallet (${wallet.toFixed(2)} available).</p>
          </Field>
          <Button type="submit" className="w-full" disabled={busy || Number(form.budget_remaining) > wallet}>
            {busy ? "Reviewing…" : Number(form.budget_remaining) > wallet ? "Add funds to launch" : "Submit campaign"}
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
    </div>
  );
}

function PreviewBar({ bg, defaultText, label, text, color }: { bg: string; defaultText: string; label: string; text: string; color: string | null }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <div className="flex flex-1 items-center justify-end gap-3 rounded px-3 py-1.5 font-mono text-xs" style={{ background: bg }}>
        <span style={{ color: color ?? defaultText }}>📣 {text}</span>
        <span style={{ color: "#3fb950" }}>$0.04 cr</span>
      </div>
    </div>
  );
}

function WalletPanel({ wallet, onTopUp }: { wallet: number; onTopUp: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> Wallet</CardTitle>
        <CardDescription>Prepaid balance used to fund campaigns.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">${wallet.toFixed(2)}</div>
        <Button className="mt-4 w-full" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add funds</Button>
        {open && <AddFundsDialog onClose={() => setOpen(false)} onDone={onTopUp} />}
      </CardContent>
    </Card>
  );
}

function AddFundsDialog({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const [currency, setCurrency] = useState<Currency>(guessCurrency());
  const [amount, setAmount] = useState(currency === "inr" ? "4150" : "50");
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
        await openRazorpay(r, () => void onDone());
        onClose();
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
            {currency === "inr" ? "Paid via Razorpay (INR)" : "Paid via Stripe (USD)"} · credited to your USD wallet
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button type="button" variant={currency === "usd" ? "default" : "outline"} size="sm" className="flex-1"
              onClick={() => { setCurrency("usd"); setAmount("50"); }}>$ USD · Stripe</Button>
            <Button type="button" variant={currency === "inr" ? "default" : "outline"} size="sm" className="flex-1"
              onClick={() => { setCurrency("inr"); setAmount("4150"); }}>₹ INR · Razorpay</Button>
          </div>
          <div className="space-y-1.5">
            <Label>Amount ({sym})</Label>
            <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
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

function CampaignRow({ c }: { c: Campaign }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{c.advertiser_name}</span>
            <StatusBadge c={c} />
          </div>
          <p className="truncate text-sm text-muted-foreground">{c.text}</p>
          {c.status === "rejected" && c.moderation_reason && (
            <p className="mt-1 text-xs text-destructive">{c.moderation_reason}</p>
          )}
          <a href={c.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
            {c.url} <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="shrink-0 text-right text-sm">
          <div className="font-mono">{(c.impressions ?? 0).toLocaleString()} impr · {(c.clicks ?? 0).toLocaleString()} clk</div>
          <div className="text-muted-foreground">${(c.budget_remaining ?? 0).toFixed(2)} left</div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ c }: { c: Campaign }) {
  if (c.status === "rejected") return <Badge variant="destructive">Rejected</Badge>;
  if (!c.active || c.status === "paused") return <Badge variant="secondary">Paused</Badge>;
  return <Badge variant="success">Live</Badge>;
}
