import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HOW_IT_WORKS } from "@/lib/content";

export const metadata = { title: "How it works — CodeSlot" };

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="container py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">How CodeSlot works</h1>
            <p className="mt-4 text-muted-foreground">
              A two-sided model that aligns advertisers and developers — built privacy-first
              and safe by default.
            </p>
          </div>

          <ol className="mx-auto mt-14 max-w-3xl space-y-5">
            {HOW_IT_WORKS.map((s, i) => (
              <li key={s.title}>
                <Card>
                  <CardContent className="flex gap-5 pt-6">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                      {i + 1}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">{s.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>

          <div className="mx-auto mt-14 max-w-3xl rounded-xl border bg-muted/30 p-6">
            <h3 className="font-semibold">Our privacy promise</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              CodeSlot only knows that VS Code is open and focused. It never reads your code,
              files, or project information. The only thing transmitted is an anonymous,
              GitHub-verified account id and ad-interaction events (impression / click).
            </p>
          </div>

          <div className="mt-12 text-center">
            <Button asChild size="lg"><Link href="/login">Start advertising</Link></Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
