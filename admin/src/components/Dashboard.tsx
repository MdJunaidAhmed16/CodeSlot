import { useCallback, useEffect, useState } from "react";
import { getMetrics, patchAd, setFlag, ApiError } from "../api";
import type { Metrics, Treasury } from "../types";
import { NewCampaignDialog } from "./NewCampaignDialog";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";
import {
  SquareDot, LayoutDashboard, BarChart3, Megaphone, LogOut, Power, Plus, RefreshCw, AlertTriangle,
  Landmark, ArrowDownToLine, ArrowUpFromLine, Banknote,
} from "lucide-react";

const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Tab = "platform" | "overview" | "campaigns";

export function Dashboard({
  login,
  isOwner,
  onSignOut,
}: {
  login: string;
  isOwner: boolean;
  onSignOut: () => void;
}) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [tab, setTab] = useState<Tab>("platform");

  const load = useCallback(async () => {
    try {
      setMetrics(await getMetrics());
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        onSignOut();
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load.");
    }
  }, [onSignOut]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive(id: string, active: boolean) {
    await patchAd(id, { active: !active });
    void load();
  }
  async function toggleServing(on: boolean) {
    await setFlag("ad_serving_enabled", on);
    void load();
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={() => void load()}>Retry</Button>
      </div>
    );
  }
  if (!metrics) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }

  const t = metrics.totals;
  const navItems: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "platform", label: "Platform", icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: "overview", label: "Ad Performance", icon: <BarChart3 className="h-4 w-4" /> },
    { id: "campaigns", label: "Campaigns", icon: <Megaphone className="h-4 w-4" /> },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r bg-card/40 p-4">
        <div className="mb-8 flex items-center gap-2 px-2 text-lg font-bold">
          <SquareDot className="h-5 w-5 text-primary" /> CodeSlot
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((n) => (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                tab === n.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              )}
            >
              {n.icon} {n.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto border-t pt-4 text-sm">
          <div className="px-2 text-muted-foreground">@{login}</div>
          <Button variant="ghost" size="sm" className="mt-1 w-full justify-start text-primary" onClick={onSignOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">
              {tab === "platform" ? "Platform Overview" : tab === "overview" ? "Ad Performance" : "Campaigns"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.active_campaigns}/{t.total_campaigns} campaigns running · {t.users} developer{t.users === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant={metrics.ad_serving_enabled ? "outline" : "destructive"}
              size="sm"
              onClick={() => void toggleServing(!metrics.ad_serving_enabled)}
            >
              <Power className="h-4 w-4" />
              {metrics.ad_serving_enabled ? "Ad serving ON" : "OFF — kill switch"}
            </Button>
            {!isOwner && (
              <Button size="sm" onClick={() => setShowNew(true)}>
                <Plus className="h-4 w-4" /> New Campaign
              </Button>
            )}
          </div>
        </header>

        {tab === "platform" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <Stat label="Developers" value={t.users.toLocaleString()} sub="using the extension" />
              <Stat label="Campaigns running" value={`${t.active_campaigns} / ${t.total_campaigns}`} sub="active / total" />
              <Stat label="Flagged for review" value={String(metrics.flagged_campaigns ?? 0)} sub="auto-approved but suspicious" accent={(metrics.flagged_campaigns ?? 0) > 0} />
              <Stat label="Credits earned" value={t.credits_earned.toLocaleString()} sub={money(t.earned_usd) + " value"} />
              <Stat label="Credits redeemed" value={t.credits_redeemed.toLocaleString()} sub={`${money(t.redeemed_usd)} · ${t.redemptions} redemptions`} />
              <Stat label="Outstanding liability" value={money(t.outstanding_usd)} sub="earned, not yet redeemed" />
              <Stat label="Platform margin" value={money(t.margin_usd)} sub="revenue − payout" accent />
            </div>
            <Panel title="Economics" onRefresh={() => void load()}>
              <table className="w-full text-sm">
                <tbody>
                  <Row k="Advertiser revenue (spend)" v={money(t.spend)} />
                  <Row k="Developer payout (credits earned)" v={`${money(t.earned_usd)} · ${t.credits_earned.toLocaleString()} cr`} />
                  <Row k="Redeemed to OpenRouter" v={`${money(t.redeemed_usd)} · ${t.credits_redeemed.toLocaleString()} cr`} />
                  <Row k="Outstanding liability (unredeemed)" v={money(t.outstanding_usd)} />
                  <Row k="Platform margin" v={money(t.margin_usd)} strong />
                  <Row k="Impressions / Clicks / CTR" v={`${t.impressions.toLocaleString()} · ${t.clicks.toLocaleString()} · ${t.ctr.toFixed(2)}%`} />
                </tbody>
              </table>
            </Panel>
            {metrics.treasury && <TreasuryPanel tr={metrics.treasury} onRefresh={() => void load()} />}
          </div>
        )}

        {tab === "overview" && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Stat label="Total spend" value={money(t.spend)} />
            <Stat label="Impressions" value={t.impressions.toLocaleString()} />
            <Stat label="Clicks" value={t.clicks.toLocaleString()} />
            <Stat label="Avg CTR" value={t.ctr.toFixed(2) + "%"} />
            <Stat label="Dev payout" value={money(t.payout_usd)} />
            <Stat label="Platform margin" value={money(t.margin_usd)} accent />
          </div>
        )}

        {tab !== "platform" && (
          <Panel title="Campaigns" className="mt-6" onRefresh={() => void load()}>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2">Advertiser</th>
                  <th>Ad</th>
                  <th>Status</th>
                  <th className="text-right">Impr.</th>
                  <th className="text-right">Clicks</th>
                  <th className="text-right">CTR</th>
                  <th className="text-right">Spend</th>
                  <th className="text-right">Budget</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {metrics.campaigns.map((c) => {
                  const ctr = c.impressions ? ((c.clicks / c.impressions) * 100).toFixed(1) + "%" : "—";
                  return (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-3 font-semibold">{c.advertiser_name}</td>
                      <td className="max-w-[220px] text-muted-foreground">
                        <div className="truncate">{c.text}</div>
                        {c.review_flag && (
                          <div className="mt-0.5 flex items-start gap-1 text-xs text-amber-500">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {c.review_flag}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <Badge variant={c.active ? "success" : "secondary"}>{c.active ? "Running" : "Paused"}</Badge>
                          {c.review_flag && <Badge variant="warning">Flagged</Badge>}
                        </div>
                      </td>
                      <td className="text-right font-mono">{c.impressions.toLocaleString()}</td>
                      <td className="text-right font-mono">{c.clicks.toLocaleString()}</td>
                      <td className="text-right font-mono">{ctr}</td>
                      <td className="text-right font-mono">{money(c.spend)}</td>
                      <td className="text-right font-mono">{money(c.budget_remaining)}</td>
                      <td className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => void toggleActive(c.id, c.active)}>
                          {c.active ? "Pause" : "Resume"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {metrics.campaigns.length === 0 && (
                  <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">No campaigns yet.</td></tr>
                )}
              </tbody>
            </table>
          </Panel>
        )}
      </main>

      {showNew && <NewCampaignDialog onClose={() => setShowNew(false)} onCreated={() => void load()} />}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={cn("mt-1 text-2xl font-bold", accent && "text-primary")}>{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function TreasuryPanel({ tr, onRefresh }: { tr: Treasury; onRefresh: () => void }) {
  const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <Card>
      <div className="flex items-center justify-between border-b px-6 py-4">
        <h2 className="flex items-center gap-2 font-semibold"><Landmark className="h-4 w-4" /> Treasury</h2>
        <Button variant="ghost" size="sm" onClick={onRefresh}><RefreshCw className="h-4 w-4" /> Refresh</Button>
      </div>
      <CardContent className="space-y-5 pt-5">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <TStat icon={<ArrowDownToLine className="h-4 w-4 text-emerald-500" />} label="Collected" value={money(tr.collected_usd)} sub="in Stripe / Razorpay" />
          <TStat icon={<ArrowUpFromLine className="h-4 w-4 text-amber-500" />} label="OpenRouter spent" value={money(tr.openrouter_spent_usd)} sub="cost of redemptions" />
          <TStat icon={<Banknote className="h-4 w-4 text-foreground" />} label="Net cash" value={money(tr.net_cash_usd)} sub="collected − spent" />
        </div>
        <table className="w-full text-sm">
          <tbody>
            <Row k="Cash collected (advertiser payments)" v={money(tr.collected_usd)} />
            <Row k="Spent on OpenRouter (redemptions)" v={"−" + money(tr.openrouter_spent_usd)} />
            <Row k="Owed to advertisers (unspent wallet + budgets)" v={"−" + money(tr.advertiser_float_usd)} />
            <Row k="Developer credit liability (future OpenRouter cost)" v={"−" + money(tr.dev_liability_usd)} />
            <Row k="Distributable profit" v={money(tr.distributable_usd)} strong />
          </tbody>
        </table>
        <div className="rounded-md border bg-muted/40 p-4 text-xs text-muted-foreground">
          <p className="mb-1 font-semibold text-foreground">How to withdraw your profit</p>
          The collected cash sits in your <b>Stripe</b> (USD) and <b>Razorpay</b> (INR) balances.
          Add your bank account once in each provider&apos;s dashboard; they pay out automatically on a
          schedule (or trigger a manual payout). Keep at least the <b>owed-to-advertisers</b> and
          <b> developer-liability</b> amounts in reserve — the <b>distributable profit</b> above is what&apos;s
          safe to take out. Top up your OpenRouter balance to cover redemptions.
        </div>
      </CardContent>
    </Card>
  );
}

function TStat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{icon} {label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function Panel({ title, children, onRefresh, className }: { title: string; children: React.ReactNode; onRefresh: () => void; className?: string }) {
  return (
    <Card className={className}>
      <div className="flex items-center justify-between border-b px-6 py-4">
        <h2 className="font-semibold">{title}</h2>
        <Button variant="ghost" size="sm" onClick={onRefresh}><RefreshCw className="h-4 w-4" /> Refresh</Button>
      </div>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <tr className={cn("border-b last:border-0", strong && "font-bold")}>
      <td className="py-2.5">{k}</td>
      <td className={cn("py-2.5 text-right font-mono", strong && "text-primary")}>{v}</td>
    </tr>
  );
}
