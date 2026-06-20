import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MODEL_POINTS } from "@/lib/content";
import { WhereAdShows } from "@/components/where-ad-shows";
import { EarningsExplainer } from "@/components/earnings-explainer";
import { WaitlistForm } from "@/components/waitlist-form";
import { ArrowRight, Code2, ShieldCheck, Sparkles, Megaphone } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.12),transparent)]" />
          <div className="container relative flex flex-col items-center py-24 text-center md:py-32">
            <Badge variant="secondary" className="mb-5 gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Ads that pay developers in AI credits
            </Badge>
            <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight md:text-6xl">
              Reach developers <span className="text-primary">where they code.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              One unobtrusive sponsored slot in the VS Code status bar. Developers earn
              AI usage credits while they work; you reach an engaged technical audience -
              with self-serve campaigns that auto-screen for safety.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/login">Start advertising <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/how-it-works">See how it works</Link>
              </Button>
            </div>

            {/* Status-bar mock */}
            <div className="mt-16 w-full max-w-3xl">
              <div className="rounded-xl border bg-card p-2 shadow-lg">
                <div className="flex items-center justify-between rounded-lg bg-[#0d1117] px-4 py-2 font-mono text-xs text-zinc-300">
                  <span className="text-zinc-500">main ✓  TypeScript</span>
                  <span className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-primary">
                      <Megaphone className="h-3.5 w-3.5" /> Vercel - Deploy in seconds →
                    </span>
                    <span className="text-emerald-400">$0.04 cr</span>
                  </span>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                A real sponsored slot - tinted with your brand color, one line, never blocking work.
              </p>
            </div>
          </div>
        </section>

        {/* Model strip */}
        <section className="border-b bg-muted/30">
          <div className="container grid grid-cols-2 gap-6 py-12 md:grid-cols-4">
            {MODEL_POINTS.map((p) => (
              <div key={p.label} className="text-center">
                <div className="text-2xl font-bold text-primary">{p.stat}</div>
                <div className="mt-1 text-sm text-muted-foreground">{p.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Where the ad shows */}
        <WhereAdShows />

        {/* What developers earn */}
        <EarningsExplainer />

        {/* Developer waitlist */}
        <section className="border-t bg-muted/30">
          <div className="container flex flex-col items-center gap-5 py-20 text-center">
            <Badge variant="secondary" className="gap-1.5"><Code2 className="h-3.5 w-3.5" /> For developers</Badge>
            <h2 className="text-3xl font-bold">Earning opens soon - get in early</h2>
            <p className="max-w-xl text-muted-foreground">
              CodeSlot pays you AI credits for one tiny status-bar slot while you code. Join the
              waitlist and we&apos;ll email you the moment earning goes live.
            </p>
            <WaitlistForm source="home" />
          </div>
        </section>

        {/* Value props */}
        <section className="container py-24">
          <div className="grid gap-6 md:grid-cols-3">
            <Feature icon={<Code2 className="h-6 w-6 text-primary" />} title="Engaged technical audience"
              body="Developers spend 6-10 hours a day in their editor. CodeSlot reaches them in a high-attention, ad-free surface - without interrupting their flow." />
            <Feature icon={<ShieldCheck className="h-6 w-6 text-primary" />} title="Safe by default"
              body="Every campaign is auto-screened for adult, gambling, malware, phishing, and brand-impersonation content before it can ever serve." />
            <Feature icon={<Sparkles className="h-6 w-6 text-primary" />} title="Aligned incentives"
              body="Developers are paid in AI credits they actually want. You only pay for real, budget-backed impressions and clicks." />
          </div>
        </section>

        {/* CTA */}
        <section className="border-t bg-muted/30">
          <div className="container flex flex-col items-center gap-5 py-20 text-center">
            <h2 className="text-3xl font-bold">Launch your first campaign in minutes</h2>
            <p className="max-w-xl text-muted-foreground">
              Sign in with Google or GitHub, set a budget, and go live the same day.
            </p>
            <Button asChild size="lg"><Link href="/login">Open the Advertisers Portal <ArrowRight className="h-4 w-4" /></Link></Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">{icon}</div>
        <h3 className="mb-2 text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}
