"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  type Balance, type RedeemResult, getBalance, redeem, completeGitHubLogin, userToken,
  userLogin, userSignOut, CREDIT_USD, MIN_REDEEM_CREDITS, REDEEM_MODELS,
} from "@/lib/userApi";
import { getUserSupabase, supabaseConfigured } from "@/lib/supabase";
import { Wallet, LogOut, Coins, MousePointerClick, Eye, Sparkles, Copy, Eye as EyeIcon } from "lucide-react";

const usd = (cr: number) => "$" + (cr * CREDIT_USD).toFixed(2);
const fmtCr = (cr: number) => Math.round(cr).toLocaleString("en-US") + " cr";

export default function UserDashboard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [bal, setBal] = useState<Balance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);

  const load = useCallback(async () => {
    try {
      setBal(await getBalance());
      setError(null);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401) { userSignOut(); router.replace("/user/login"); return; }
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [router]);

  useEffect(() => {
    (async () => {
      if (supabaseConfigured && !userToken()) {
        try { await completeGitHubLogin(); } catch { /* ignore */ }
      }
      if (!userToken()) { router.replace("/user/login"); return; }
      setReady(true);
      await load();
    })();
  }, [router, load]);

  async function signOut() {
    if (supabaseConfigured) await getUserSupabase()?.auth.signOut();
    userSignOut();
    router.replace("/user/login");
  }

  if (!ready) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;

  const today = bal?.stats_today;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="container max-w-3xl flex-1 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Your CodeSlot wallet</h1>
            <p className="text-sm text-muted-foreground">Signed in as @{userLogin()}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}><LogOut className="h-4 w-4" /> Sign out</Button>
        </div>

        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        <Card className="mb-6 overflow-hidden">
          <CardContent className="flex items-center justify-between bg-gradient-to-br from-primary/10 to-transparent pt-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Wallet className="h-4 w-4" /> Balance
              </div>
              <div className="mt-1 text-4xl font-extrabold">{bal ? usd(bal.balance) : "—"}</div>
              <div className="text-sm text-muted-foreground">{bal ? fmtCr(bal.balance) : ""}</div>
            </div>
            <Button size="lg" disabled={!bal || bal.balance < MIN_REDEEM_CREDITS} onClick={() => setRedeeming(true)}>
              <Sparkles className="h-4 w-4" /> Redeem for AI tokens
            </Button>
          </CardContent>
        </Card>

        <div className="mb-6 grid grid-cols-3 gap-4">
          <MiniStat icon={<Eye className="h-4 w-4" />} label="Impressions today" value={String(today?.impressions ?? 0)} />
          <MiniStat icon={<MousePointerClick className="h-4 w-4" />} label="Clicks today" value={String(today?.clicks ?? 0)} />
          <MiniStat icon={<Coins className="h-4 w-4" />} label="Earned today" value={today ? fmtCr(today.earned) : "0 cr"} />
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent activity</CardTitle></CardHeader>
          <CardContent>
            {bal?.recent && bal.recent.length > 0 ? (
              <ul className="divide-y">
                {bal.recent.map((r, i) => (
                  <li key={i} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <div className="font-medium">{r.advertiser_name}</div>
                      <div className="text-xs text-muted-foreground">{r.event_type}</div>
                    </div>
                    <div className="font-mono text-emerald-600 dark:text-emerald-400">+{fmtCr(r.credits_awarded)}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing yet — keep coding with the extension installed.</p>
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Minimum redemption is {fmtCr(MIN_REDEEM_CREDITS)} (~{usd(MIN_REDEEM_CREDITS)}). CodeSlot never reads your code.
        </p>
      </main>

      {redeeming && bal && (
        <RedeemDialog balance={bal.balance} busy={redeeming} setBusy={setRedeeming} onDone={load} />
      )}
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
        <div className="mt-1 text-xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function RedeemDialog({ balance, onDone, setBusy }: { balance: number; busy: boolean; setBusy: (b: boolean) => void; onDone: () => Promise<void> }) {
  const [model, setModel] = useState<string>(REDEEM_MODELS[0].id);
  const [amount, setAmount] = useState(String(Math.max(MIN_REDEEM_CREDITS, Math.min(balance, balance))));
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [revealed, setRevealed] = useState(false);

  const credits = Math.floor(Number(amount) || 0);
  const tooLow = credits < MIN_REDEEM_CREDITS;
  const tooHigh = credits > balance;

  async function go() {
    setWorking(true);
    setErr(null);
    try {
      const r = await redeem(model, credits);
      setResult(r);
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Redemption failed");
    } finally {
      setWorking(false);
    }
  }

  function close() { setBusy(false); }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={close}>
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle>Redeem credits → AI tokens</CardTitle>
          <CardDescription>Balance: {usd(balance)} · {fmtCr(balance)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!result ? (
            <>
              <div className="space-y-1.5">
                <Label>Model</Label>
                <select value={model} onChange={(e) => setModel(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {REDEEM_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.vendor}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Amount (credits)</Label>
                <Input type="number" min={MIN_REDEEM_CREDITS} value={amount} onChange={(e) => setAmount(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  ≈ {usd(credits)} · 5% fee → ${(credits * CREDIT_USD * 0.95).toFixed(2)} OpenRouter credit
                </p>
                {tooLow && <p className="text-xs text-destructive">Minimum is {fmtCr(MIN_REDEEM_CREDITS)}.</p>}
                {tooHigh && <p className="text-xs text-destructive">Exceeds your balance.</p>}
              </div>
              {err && <p className="text-sm text-destructive">{err}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={close}>Cancel</Button>
                <Button disabled={working || tooLow || tooHigh} onClick={() => void go()}>
                  {working ? "Minting key…" : "Redeem"}
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <Sparkles className="h-5 w-5" /> <span className="font-semibold">Your OpenRouter key is ready</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {result.openrouter_key_name} · ${result.openrouter_credit_applied.toFixed(2)} credit · shown once
              </p>
              {result.openrouter_key ? (
                <div className="flex items-center gap-2">
                  <Input readOnly type={revealed ? "text" : "password"} value={result.openrouter_key} className="font-mono" />
                  <Button variant="outline" size="icon" onClick={() => setRevealed((v) => !v)}><EyeIcon className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" onClick={() => result.openrouter_key && navigator.clipboard.writeText(result.openrouter_key)}><Copy className="h-4 w-4" /></Button>
                </div>
              ) : (
                <p className="text-sm">{result.message}</p>
              )}
              <p className="text-xs text-amber-500">⚠️ Copy it now — it can't be retrieved again. Use base URL https://openrouter.ai/api/v1.</p>
              <div className="flex justify-end"><Button onClick={close}>Done</Button></div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
