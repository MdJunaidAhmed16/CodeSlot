import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Card, CardContent } from "@/components/ui/card";
import { Check, X } from "lucide-react";

export const metadata = { title: "Terms & Acceptable Use - CodeSlot" };

const ALLOWED = [
  "Developer tools, IDEs, libraries, and frameworks",
  "Cloud, hosting, infrastructure, CI/CD, and observability",
  "AI / ML products, APIs, and model providers",
  "SaaS, productivity, and B2B software",
  "Tech education, courses, books, and conferences",
  "Open-source projects and dev communities",
];

const PROHIBITED = [
  "Adult / 18+ / sexual content, escort or dating-for-sex services",
  "Gambling, betting, casinos, lotteries, and loot-box schemes",
  "Illegal drugs, controlled substances, or drug paraphernalia",
  "Weapons, firearms, ammunition, or explosives",
  "Hate speech, harassment, extremist or terrorist content",
  "Malware, spyware, carding, hacking-for-hire, or phishing",
  "Brand impersonation or deceptive look-alike domains",
  "Crypto scams: doublers, fake airdrops, wallet drainers, guaranteed returns",
  "Counterfeit goods, replicas, or stolen credentials",
  "Fake, parked, or non-functional destination websites",
  "URL shorteners or redirectors that hide the true destination",
];

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="container max-w-4xl py-20">
          <h1 className="text-4xl font-extrabold tracking-tight">Terms &amp; Acceptable Use Policy</h1>
          <p className="mt-4 text-muted-foreground">
            CodeSlot serves a single sponsored slot inside developers&apos; editors. To keep that space
            trustworthy, every campaign is automatically screened against the rules below before it can
            serve. Submitting a campaign means you agree to this policy.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <Card>
              <CardContent className="pt-6">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                  <Check className="h-5 w-5" /> What you can advertise
                </h2>
                <ul className="space-y-2.5">
                  {ALLOWED.map((a) => (
                    <li key={a} className="flex gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> {a}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="border-destructive/40">
              <CardContent className="pt-6">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-destructive">
                  <X className="h-5 w-5" /> Strictly prohibited
                </h2>
                <ul className="space-y-2.5">
                  {PROHIBITED.map((p) => (
                    <li key={p} className="flex gap-2 text-sm text-muted-foreground">
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> {p}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="mt-12 space-y-6 text-sm leading-relaxed text-muted-foreground">
            <Section title="1. Automated moderation & enforcement">
              Every submission is screened in real time for prohibited categories, unsafe or
              deceptive URLs (IP-literal hosts, punycode look-alikes, URL shorteners, high-risk
              TLDs), brand impersonation, and known malware/phishing via Google Safe Browsing.
              Campaigns that fail are rejected automatically with a reason. We may additionally
              suspend any account, remove any campaign, and withhold spend for violations - at any
              time and without notice.
            </Section>
            <Section title="2. Destination URLs">
              Destination URLs must be live, https, and accurately represent the advertised product.
              No cloaking, redirect chains, or post-approval bait-and-switch. Changing a live
              campaign&apos;s destination re-triggers moderation.
            </Section>
            <Section title="3. Honest claims">
              No false, misleading, or deceptive claims; no impersonation of CodeSlot, GitHub,
              OpenRouter, or any third party. Financial, health, and similar claims must comply with
              applicable law.
            </Section>
            <Section title="4. Privacy">
              CodeSlot never collects developers&apos; code, files, or project data. Advertisers receive
              only aggregate impression/click metrics - never personal data about individual developers.
            </Section>
            <Section title="5. Billing & refunds">
              You pay only for budget-backed impressions and clicks actually served. Unused budget is
              not charged. Spend on campaigns later found in violation is non-refundable.
            </Section>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold text-foreground">{title}</h3>
      <p className="mt-1">{children}</p>
    </div>
  );
}
