import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SquareDot } from "lucide-react";

const NAV = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/terms", label: "Terms" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <SquareDot className="h-5 w-5 text-primary" />
          <span className="text-lg">CodeSlot</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <a href="https://marketplace.visualstudio.com/" target="_blank" rel="noreferrer">User Login</a>
          </Button>
          <Button asChild size="sm">
            <Link href="/login">Advertisers Portal</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
