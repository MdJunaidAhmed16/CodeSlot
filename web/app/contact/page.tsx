import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Mail, MapPin, Clock } from "lucide-react";

export const metadata = { title: "Contact Us — CodeSlot" };

// TODO: replace the placeholders below with your registered business details
// before submitting to Razorpay (they verify a real contact + address).
const SUPPORT_EMAIL = "mohammedjunaidah@gmail.com";
const BUSINESS_NAME = "CodeSlot";
const PHONE_NUMBER = "+919866581615"; // ← add your support phone number with country code
const ADDRESS = "302, S-2, Siva Towers, Tadepalle bypass, Vijayawada"; // ← add your full registered address
const HOURS = "Mon–Fri, 10:00–18:00 IST";

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="container max-w-3xl flex-1 py-16">
        <h1 className="text-4xl font-extrabold tracking-tight">Contact Us</h1>
        <p className="mt-3 text-muted-foreground">
          Questions about campaigns, billing, refunds, or your developer wallet? We&rsquo;re happy to help.
        </p>

        <div className="mt-10 space-y-5">
          <Row icon={<Mail className="h-5 w-5 text-primary" />} label="Email">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline-offset-4 hover:underline">{SUPPORT_EMAIL}</a>
          </Row>
          <Row icon={<MapPin className="h-5 w-5 text-primary" />} label={BUSINESS_NAME}>
            {ADDRESS}
          </Row>
          <Row icon={<Clock className="h-5 w-5 text-primary" />} label="Support hours">
            {HOURS}
          </Row>
        </div>

        <p className="mt-10 text-sm text-muted-foreground">
          For data deletion or privacy requests, see our{" "}
          <a href="/privacy" className="text-primary underline-offset-4 hover:underline">Privacy Policy</a>.
          For billing, see our{" "}
          <a href="/refund" className="text-primary underline-offset-4 hover:underline">Refund &amp; Cancellation Policy</a>.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-4">
      <div>{icon}</div>
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}
