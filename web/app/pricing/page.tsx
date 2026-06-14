import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PRICING } from "@/lib/content";
import { Check } from "lucide-react";

export const metadata = { title: "Pricing — CodeSlot" };

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="container py-20 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">Simple, usage-based pricing</h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Pay for impressions or clicks. No platform fee to start, no minimums while in beta —
            you only pay for real, budget-backed events.
          </p>

          <div className="mx-auto mt-14 grid max-w-5xl gap-6 md:grid-cols-3">
            {PRICING.map((tier) => (
              <Card key={tier.name} className={tier.highlight ? "relative border-primary shadow-md" : ""}>
                {tier.highlight && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Most popular</Badge>
                )}
                <CardHeader className="text-left">
                  <CardTitle>{tier.name}</CardTitle>
                  <CardDescription>{tier.blurb}</CardDescription>
                  <div className="pt-2">
                    <span className="text-4xl font-extrabold">{tier.price}</span>
                    <span className="ml-1 text-sm text-muted-foreground">{tier.unit}</span>
                  </div>
                </CardHeader>
                <CardContent className="text-left">
                  <ul className="space-y-2.5">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Button asChild className="mt-6 w-full" variant={tier.highlight ? "default" : "outline"}>
                    <Link href="/login">Get started</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="mx-auto mt-10 max-w-2xl text-sm text-muted-foreground">
            Developers earn ~45–55% of ad value as AI credits (1 credit = $0.001). The remaining
            margin covers redemption and platform costs. See <Link href="/how-it-works" className="text-primary underline-offset-4 hover:underline">how it works</Link>.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
