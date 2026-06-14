import { useState } from "react";
import { signInDev, signInWithGitHub, supabaseConfigured } from "../auth";
import { ApiError } from "../api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { SquareDot, Github } from "lucide-react";

export function Login({ onSignedIn, notice }: { onSignedIn: () => void; notice?: string | null }) {
  const [devToken, setDevToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function dev() {
    setBusy(true);
    setErr(null);
    try {
      const user = await signInDev(devToken);
      if (!user.is_admin) {
        setErr("That account is not authorized for the console.");
        return;
      }
      onSignedIn();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex items-center gap-2 text-xl font-bold">
            <SquareDot className="h-6 w-6 text-primary" /> CodeSlot
          </div>
          <CardTitle>Owner Console</CardTitle>
          <CardDescription>Platform metrics, campaigns &amp; kill switch.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {supabaseConfigured ? (
            <Button className="w-full" variant="outline" onClick={() => void signInWithGitHub()}>
              <Github className="h-4 w-4" /> Continue with GitHub
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                Local/dev mode — Supabase Auth not configured. Paste a GitHub token or just
                continue to sign in against the mock backend.
              </p>
              <Input
                type="password"
                placeholder="GitHub token (optional in mock mode)"
                value={devToken}
                onChange={(e) => setDevToken(e.target.value)}
              />
              <Button className="w-full" disabled={busy} onClick={() => void dev()}>
                {busy ? "Signing in…" : "Sign in (dev)"}
              </Button>
            </div>
          )}
          {notice && <p className="text-center text-sm text-destructive">{notice}</p>}
          {err && <p className="text-center text-sm text-destructive">{err}</p>}
          <p className="text-center text-xs text-muted-foreground">
            Access is restricted to the product owner&apos;s allow-listed GitHub account.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
