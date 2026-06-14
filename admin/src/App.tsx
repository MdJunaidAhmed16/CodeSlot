import { useEffect, useState } from "react";
import { Login } from "./components/Login";
import { Dashboard } from "./components/Dashboard";
import { getIsOwner, getLogin, getMetrics, getToken, ApiError } from "./api";
import { completeSupabaseLogin, signOut, supabaseConfigured } from "./auth";

type Status = "loading" | "out" | "in";

export function App() {
  const [status, setStatus] = useState<Status>("loading");
  const [login, setLogin] = useState<string>("");
  const [notice, setNotice] = useState<string | null>(null);

  // On load: finish any OAuth redirect, then validate the stored session.
  useEffect(() => {
    (async () => {
      if (supabaseConfigured) {
        try {
          await completeSupabaseLogin();
        } catch {
          /* ignore */
        }
      }
      if (!getToken()) {
        setStatus("out");
        return;
      }
      try {
        // A successful admin call confirms the token is valid + admin.
        await getMetrics();
        setLogin(getLogin() ?? "admin");
        setStatus("in");
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          if (e.status === 403) {
            setNotice(
              "This dashboard is restricted to the product owner. Your GitHub account is not authorized."
            );
          }
          await signOut();
          setStatus("out");
        } else {
          // Network error — assume the stored session is fine, let Dashboard retry.
          setStatus("in");
        }
      }
    })();
  }, []);

  async function handleSignOut() {
    await signOut();
    setLogin("");
    setStatus("out");
  }

  if (status === "loading") {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (status === "out") {
    return (
      <Login
        notice={notice}
        onSignedIn={() => {
          setNotice(null);
          setLogin(getLogin() ?? "admin");
          setStatus("in");
        }}
      />
    );
  }
  return (
    <Dashboard
      login={login || "admin"}
      isOwner={getIsOwner()}
      onSignOut={() => void handleSignOut()}
    />
  );
}
