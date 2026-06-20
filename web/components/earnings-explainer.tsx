"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Coins, Eye, MousePointerClick, Sparkles } from "lucide-react";

// Developer-facing rates (mirror of the backend rate card).
const CREDIT_USD = 0.001;
const REWARD_IMPRESSION = 4; // credits per impression (CPM ads)
const REWARD_CLICK = 90; // credits per click (CPC ads)
const MIN_REDEEM = 5000; // credits (~$5)
const ROTATION_PER_HOUR = 15; // a fresh ad ~every 4 min

const usd = (cr: number) => "$" + (cr * CREDIT_USD).toFixed(2);

export function EarningsExplainer() {
  const [hours, setHours] = useState(5); // focused hours/day
  const [clicks, setClicks] = useState(1); // clicks/day

  const impressionsPerDay = Math.round(hours * ROTATION_PER_HOUR);
  const creditsPerDay = impressionsPerDay * REWARD_IMPRESSION + clicks * REWARD_CLICK;
  const perMonth = creditsPerDay * 20; // ~20 active days
  const daysToRedeem = creditsPerDay > 0 ? Math.ceil(MIN_REDEEM / creditsPerDay) : 0;

  return (
    <section className="border-y bg-muted/30">
      <div className="container py-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">What developers earn</h2>
          <p className="mt-3 text-muted-foreground">
            Install the free extension, sign in with GitHub, and earn AI usage credits while you
            code. Credits redeem for OpenRouter tokens (Claude, GPT, Gemini, and more).
          </p>
        </div>

        {/* Rates */}
        <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-3">
          <Rate icon={<Eye className="h-5 w-5 text-primary" />} title={`${REWARD_IMPRESSION} credits / impression`}
            sub={`≈ ${usd(REWARD_IMPRESSION)} · on CPM campaigns (5s focused view)`} />
          <Rate icon={<MousePointerClick className="h-5 w-5 text-primary" />} title={`${REWARD_CLICK} credits / click`}
            sub={`≈ ${usd(REWARD_CLICK)} · on CPC campaigns`} />
          <Rate icon={<Sparkles className="h-5 w-5 text-primary" />} title={`Redeem from ${MIN_REDEEM.toLocaleString()} cr`}
            sub={`≈ ${usd(MIN_REDEEM)} → an OpenRouter API key`} />
        </div>

        {/* Calculator */}
        <Card className="mx-auto mt-8 max-w-4xl">
          <CardContent className="grid gap-8 pt-6 md:grid-cols-2">
            <div className="space-y-5">
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">Focused hours coding / day</span>
                  <span className="font-mono text-muted-foreground">{hours} h</span>
                </div>
                <input type="range" min={1} max={10} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" />
                <p className="mt-1 text-xs text-muted-foreground">≈ {impressionsPerDay} ad impressions/day (one ad rotates ~every 4 min)</p>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">Ad clicks / day</span>
                  <span className="font-mono text-muted-foreground">{clicks}</span>
                </div>
                <input type="range" min={0} max={10} value={clicks} onChange={(e) => setClicks(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" />
              </div>
            </div>

            <div className="flex flex-col justify-center gap-3 rounded-lg border bg-background p-5">
              <Line label="You earn / day" value={`${creditsPerDay.toLocaleString()} cr`} sub={usd(creditsPerDay)} />
              <Line label="Per month (~20 days)" value={`${perMonth.toLocaleString()} cr`} sub={usd(perMonth)} accent />
              <Line label="First $5 redemption in" value={`~${daysToRedeem} day${daysToRedeem === 1 ? "" : "s"}`} sub="" />
            </div>
          </CardContent>
        </Card>

        <div className="mx-auto mt-6 max-w-4xl rounded-lg border bg-background p-4 text-center text-sm text-muted-foreground">
          <Coins className="mr-1 inline h-4 w-4 text-primary" />
          Reach your first redemption with about <b className="text-foreground">{Math.ceil(MIN_REDEEM / REWARD_IMPRESSION).toLocaleString()} impressions</b> or{" "}
          <b className="text-foreground">{Math.ceil(MIN_REDEEM / REWARD_CLICK)} clicks</b>. We support two
          campaign types - <b className="text-foreground">CPM</b> (you earn per impression) and{" "}
          <b className="text-foreground">CPC</b> (you earn per click). Estimates only; actual earnings depend on the ads shown.
        </div>
      </div>
    </section>
  );
}

function Rate({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">{icon}</div>
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{sub}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Line({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className={"text-lg font-bold " + (accent ? "text-primary" : "")}>{value}</span>
        {sub && <span className="ml-2 text-xs text-muted-foreground">{sub}</span>}
      </span>
    </div>
  );
}
