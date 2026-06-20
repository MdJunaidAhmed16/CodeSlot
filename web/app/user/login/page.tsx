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
import { supabaseConfigured } from "@/lib/supabase";
import { devSignIn, signInWithGitHub, userToken } from "@/lib/userApi";
import { Github } from "lucide-react";

export default function UserLoginPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (userToken()) router.replace("/user");
  }, [router]);

  async function dev() {
    setBusy(true);
    setErr(null);
    try {
      await devSignIn(token);
      router.push("/user");
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
            <CardTitle className="text-2xl">Developer sign in</CardTitle>
            <CardDescription>
              View your credit balance, earnings, and redeem for AI tokens - the same
              wallet as the CodeSlot extension.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {supabaseConfigured ? (
              <Button className="w-full" variant="outline" onClick={() => void signInWithGitHub()}>
                <Github className="h-4 w-4" /> Continue with GitHub
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  Local/dev mode - Supabase Auth not configured. Enter any token to sign in
                  against the local backend.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="tok">GitHub token (optional in mock mode)</Label>
                  <Input id="tok" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
                </div>
                <Button className="w-full" disabled={busy} onClick={() => void dev()}>
                  {busy ? "Signing in…" : "Sign in (dev)"}
                </Button>
              </div>
            )}
            {err && <p className="text-center text-sm text-destructive">{err}</p>}
            <p className="text-center text-xs text-muted-foreground">
              New here? <Link href="/" className="text-primary underline-offset-4 hover:underline">Install the extension</Link> to start earning.
            </p>
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
