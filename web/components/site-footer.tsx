import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="container flex flex-col items-center justify-between gap-4 py-10 text-sm text-muted-foreground md:flex-row">
        <p>© {new Date().getFullYear()} CodeSlot. Ads that pay developers in AI credits.</p>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          <Link href="/how-it-works" className="hover:text-foreground">How it works</Link>
          <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/refund" className="hover:text-foreground">Refund &amp; Cancellation</Link>
          <Link href="/contact" className="hover:text-foreground">Contact</Link>
        </div>
      </div>
    </footer>
  );
}
