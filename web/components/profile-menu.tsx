"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { type Account, getAccount, deleteAccount, devSignOut } from "@/lib/api";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { LogOut, Trash2, ChevronDown } from "lucide-react";

export function ProfileMenu({ email }: { email: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (open && !account) getAccount().then(setAccount).catch(() => {});
  }, [open, account]);

  async function signOut() {
    if (supabaseConfigured) await getSupabase()?.auth.signOut();
    else devSignOut();
    router.replace("/login");
  }

  async function remove() {
    setBusy(true);
    setDelErr(null);
    try {
      await deleteAccount();
      if (supabaseConfigured) await getSupabase()?.auth.signOut();
      else devSignOut();
      router.replace("/");
    } catch (e) {
      setDelErr(e instanceof Error ? e.message : "Could not delete account.");
      setBusy(false);
    }
  }

  const initial = (email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-2 text-sm hover:bg-accent"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{initial}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border bg-card p-2 shadow-xl">
          <div className="flex items-center gap-3 px-2 py-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{initial}</span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{account?.email ?? email ?? "Advertiser"}</div>
              <div className="text-xs capitalize text-muted-foreground">{account?.provider ?? ""} account</div>
            </div>
          </div>

          <div className="my-1 grid grid-cols-2 gap-2 px-2">
            <Stat label="Wallet" value={account ? "$" + account.wallet_usd.toFixed(2) : "—"} />
            <Stat label="Campaigns" value={account ? String(account.campaigns) : "—"} />
          </div>

          <div className="my-1 border-t" />
          <ThemeToggle />
          <div className="my-1 border-t" />

          {!confirming ? (
            <>
              <button onClick={() => setConfirming(true)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" /> Delete account
              </button>
              <button onClick={() => void signOut()} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </>
          ) : (
            <div className="space-y-2 px-2 py-2">
              <p className="text-xs text-muted-foreground">
                Delete your account, all campaigns, and wallet history? This can&apos;t be undone.
              </p>
              {delErr && <p className="text-xs text-destructive">{delErr}</p>}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirming(false)}>Cancel</Button>
                <Button variant="destructive" size="sm" className="flex-1" disabled={busy} onClick={() => void remove()}>
                  {busy ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}