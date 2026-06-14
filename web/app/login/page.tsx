"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { devSignIn, isSignedIn } from "@/lib/api";
import { Github, Mail } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Already signed in (e.g. returning from OAuth) → go to the portal.
    void isSignedIn().then((yes) => yes && router.replace("/portal"));
  }, [router]);

  async function oauth(provider: "google" | "github") {
    const sb = getSupabase();
    if (!sb) return;
    await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/portal`, scopes: provider === "github" ? "read:user user:email" : undefined },
    });
  }

  async function dev() {
    setBusy(true);
    setErr(null);
    try {
      await devSignIn(email.trim() || "advertiser@example.com");
      router.push("/portal");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center py-16">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Advertisers Portal</CardTitle>
            <CardDescription>Sign in to launch and manage campaigns.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {supabaseConfigured ? (
              <>
                <Button className="w-full" variant="outline" onClick={() => void oauth("google")}>
                  <Mail className="h-4 w-4" /> Continue with Google
                </Button>
                <Button className="w-full" variant="outline" onClick={() => void oauth("github")}>
                  <Github className="h-4 w-4" /> Continue with GitHub
                </Button>
              </>
            ) : (
              <div className="space-y-3">
                <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  Local/dev mode — Supabase Auth isn&apos;t configured, so Google/GitHub are
                  disabled. Enter any email to sign in against the local backend.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="you@company.com"
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <Button className="w-full" disabled={busy} onClick={() => void dev()}>
                  {busy ? "Signing in…" : "Sign in (dev)"}
                </Button>
              </div>
            )}
            {err && <p className="text-center text-sm text-destructive">{err}</p>}
            <p className="text-center text-xs text-muted-foreground">
              By continuing you agree to our{" "}
              <Link href="/terms" className="text-primary underline-offset-4 hover:underline">Terms &amp; Acceptable Use</Link>.
            </p>
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
