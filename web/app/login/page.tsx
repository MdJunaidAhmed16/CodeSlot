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
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
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

  async function emailAuth() {
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { error } = await sb.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        // If email confirmation is on, there's no session yet.
        const { data } = await sb.auth.getSession();
        if (data.session) router.push("/portal");
        else setNotice("Account created. Check your email to confirm, then sign in.");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        router.push("/portal");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
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
            <CardDescription>
              {mode === "signup" ? "Create your advertiser account." : "Sign in to launch and manage campaigns."}
            </CardDescription>
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

                <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
                  <div className="h-px flex-1 bg-border" /> or with email <div className="h-px flex-1 bg-border" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="email" placeholder="you@company.com"
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw">Password</Label>
                  <Input id="pw" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button className="w-full" disabled={busy || !email || !password} onClick={() => void emailAuth()}>
                  {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
                </Button>
                <button type="button" className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setErr(null); setNotice(null); }}>
                  {mode === "signup" ? "Already have an account? Sign in" : "New advertiser? Create an account"}
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  Local/dev mode - Supabase Auth isn&apos;t configured. Enter any email to sign in
                  against the local backend.
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
            {notice && <p className="text-center text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>}
            {err && <p className="text-center text-sm text-destructive">{err}</p>}
            <p className="text-center text-xs text-muted-foreground">
              By continuing you agree to our{" "}
              <Link href="/terms" className="text-primary underline-offset-4 hover:underline">Terms</Link>.
            </p>
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
