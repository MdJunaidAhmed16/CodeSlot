import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata = { title: "Privacy Policy - CodeSlot" };

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="container max-w-3xl flex-1 py-16">
        <h1 className="text-4xl font-extrabold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {new Date().getFullYear()}</p>

        <div className="prose mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <P title="1. Who we are">
            CodeSlot operates a VS Code extension and websites that let developers earn AI
            usage credits for a single sponsored status-bar slot, and let advertisers run
            campaigns. This policy explains what we collect and why.
          </P>
          <P title="2. The most important thing">
            The CodeSlot extension <b>never reads, transmits, or stores your source code, file
            contents, file names, or project data.</b> It only knows whether the editor window is
            focused (to time impressions). This is the core of our product.
          </P>
          <P title="3. What we collect">
            <ul className="ml-5 list-disc space-y-1">
              <li><b>Developers:</b> a GitHub-verified account id and ad-interaction events (impression/click) used to credit your wallet. No code or files.</li>
              <li><b>Advertisers:</b> the email/identity from your Google or GitHub sign-in, and the campaign details you submit.</li>
              <li><b>Payments:</b> processed by Razorpay. We never see or store card numbers; we only receive a payment confirmation and amount.</li>
              <li><b>Logos you upload</b> are stored to serve your ad.</li>
            </ul>
          </P>
          <P title="4. How we use it">
            To operate the credit ledger, serve and bill campaigns, prevent fraud and abuse,
            and comply with law. We do not sell personal data.
          </P>
          <P title="5. Service providers">
            We rely on Supabase (database/auth/storage), Upstash (rate limiting), Razorpay
            (payments), and OpenRouter (AI token redemption). They process data only to
            provide their service.
          </P>
          <P title="6. Cookies">
            We use only essential storage needed to keep you signed in. No advertising trackers.
          </P>
          <P title="7. Retention & deletion">
            We retain account and transaction records as needed for operation and legal
            compliance. Developers can erase their data from the extension (&ldquo;Delete My Data&rdquo;);
            advertisers can request deletion via the contact below.
          </P>
          <P title="8. Your rights">
            You may request access, correction, or deletion of your personal data by contacting
            us.
          </P>
          <P title="9. Contact">
            Questions? See our <a href="/contact" className="text-primary underline-offset-4 hover:underline">Contact</a> page.
          </P>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function P({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-1">{children}</div>
    </section>
  );
}
