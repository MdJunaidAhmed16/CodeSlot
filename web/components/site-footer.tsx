import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="container flex flex-col items-center justify-between gap-4 py-10 text-sm text-muted-foreground md:flex-row">
        <p>© {new Date().getFullYear()} CodeSlot. Ads that pay developers in AI credits.</p>
        <div className="flex gap-6">
          <Link href="/how-it-works" className="hover:text-foreground">How it works</Link>
          <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
          <Link href="/terms" className="hover:text-foreground">Terms &amp; Acceptable Use</Link>
          <Link href="/login" className="hover:text-foreground">Advertisers</Link>
        </div>
      </div>
    </footer>
  );
}
