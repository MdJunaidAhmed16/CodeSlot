"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { type Analytics, type Currency, getAnalytics } from "@/lib/api";
import { fmt, inrHint } from "@/lib/currency";
import { TimeSeriesChart } from "@/components/charts";
import { Eye, MousePointerClick, Percent, DollarSign } from "lucide-react";

const IMPR = "hsl(var(--primary))";
const CLICK = "#f59e0b";

function label(day: string): string {
  const d = new Date(day + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function AnalyticsPanel({ pref, rate }: { pref: Currency | null; rate: number }) {
  const [days, setDays] = useState<7 | 30>(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: 7 | 30) => {
    setLoading(true);
    try {
      setData(await getAnalytics(d));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(days); }, [days, load]);

  const t = data?.totals;
  const points = (data?.series ?? []).map((r) => ({
    label: label(r.day),
    values: { impressions: r.impressions, clicks: r.clicks, spend: r.spend_usd },
  }));

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Performance</CardTitle>
          <CardDescription>Impressions, clicks &amp; spend over time</CardDescription>
        </div>
        <div className="flex overflow-hidden rounded-md border text-xs">
          {([7, 30] as const).map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={"px-3 py-1 " + (days === d ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
              {d}d
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric icon={<Eye className="h-4 w-4" />} label="Impressions" value={t ? t.impressions.toLocaleString() : "-"} />
          <Metric icon={<MousePointerClick className="h-4 w-4" />} label="Clicks" value={t ? t.clicks.toLocaleString() : "-"} />
          <Metric icon={<Percent className="h-4 w-4" />} label="CTR" value={t ? t.ctr.toFixed(2) + "%" : "-"} />
          <Metric icon={<DollarSign className="h-4 w-4" />} label="Spend"
            value={t ? fmt(t.spend_usd, "usd", rate) : "-"}
            sub={t && pref === "inr" ? inrHint(t.spend_usd, rate) : undefined} />
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : loading && !data ? (
          <div className="h-[200px] animate-pulse rounded-md bg-muted/40" />
        ) : t && t.impressions + t.clicks === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No impressions or clicks yet in this window. Once your campaigns start serving, trends show here.
          </p>
        ) : (
          <div className="space-y-6 text-foreground">
            <div>
              <div className="mb-1 flex items-center gap-4 text-xs text-muted-foreground">
                <Legend color={IMPR} text="Impressions" />
                <Legend color={CLICK} text="Clicks" />
              </div>
              <TimeSeriesChart
                points={points}
                series={[
                  { key: "impressions", label: "Impressions", color: IMPR, kind: "area" },
                  { key: "clicks", label: "Clicks", color: CLICK, kind: "line" },
                ]}
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Spend ($)</div>
              <TimeSeriesChart
                points={points}
                series={[{ key: "spend", label: "Spend", color: IMPR, kind: "area" }]}
                formatValue={(v) => "$" + v.toFixed(2)}
                height={150}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon} {label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      {text}
    </span>
  );
}
