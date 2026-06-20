"use client";

// Pre-launch developer waitlist: captures an email so we can email earners when
// earning goes live. Public endpoint (no auth); the backend inserts via the
// service role. Idempotent on email.
const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"
).replace(/\/+$/, "");

export async function joinWaitlist(email: string, source = "site"): Promise<void> {
  const res = await fetch(`${API_BASE}/waitlist`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: email.trim(), source }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || "Could not join the waitlist");
  }
}
