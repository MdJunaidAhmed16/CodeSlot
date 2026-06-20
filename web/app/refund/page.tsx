import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata = { title: "Refund & Cancellation Policy - CodeSlot" };

export default function RefundPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="container max-w-3xl flex-1 py-16">
        <h1 className="text-4xl font-extrabold tracking-tight">Refund &amp; Cancellation Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {new Date().getFullYear()}</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <P title="1. How billing works">
            Advertisers add funds to a prepaid wallet, then allocate budget to campaigns. You are
            charged from your wallet only as real impressions and clicks are delivered. Unspent
            wallet balance and undelivered campaign budget are never consumed.
          </P>
          <P title="2. Cancellation">
            You can pause or stop a campaign at any time from the advertiser portal. When a
            campaign is paused, no further impressions are served and no further spend occurs.
          </P>
          <P title="3. Refunds of unused balance">
            Unused wallet balance (funds not yet delivered as impressions/clicks) may be refunded
            on request to the original payment method. Email us from the account&rsquo;s registered
            address; eligible refunds are processed within 5-7 business days.
          </P>
          <P title="4. Non-refundable">
            Spend on impressions and clicks already delivered is non-refundable. Spend on campaigns
            later found to violate our <a href="/terms" className="text-primary underline-offset-4 hover:underline">Acceptable Use Policy</a> is non-refundable.
          </P>
          <P title="5. Failed or duplicate payments">
            If a payment is debited but your wallet is not credited, or you are charged twice,
            contact us with the transaction reference - we will verify and refund any duplicate or
            failed charge in full.
          </P>
          <P title="6. Currency">
            Payments may be made in USD or INR. International (USD) payments are settled and any
            refunds issued in the original transaction currency where supported by the processor.
          </P>
          <P title="7. Contact">
            For any billing or refund request, see our <a href="/contact" className="text-primary underline-offset-4 hover:underline">Contact</a> page.
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
