import { useState } from "react";
import { createAd, ApiError } from "../api";
import type { NewAd } from "../types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { X } from "lucide-react";

export function NewCampaignDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<NewAd>({
    advertiser_name: "",
    text: "",
    url: "https://",
    description: "",
    brand_color: "",
    logo_url: "",
    weight: 1,
    budget_remaining: 50,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof NewAd>(k: K, v: NewAd[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const payload: NewAd = {
        ...form,
        brand_color: form.brand_color || undefined,
        logo_url: form.logo_url || undefined,
        description: form.description || undefined,
      };
      await createAd(payload);
      onCreated();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not create campaign.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Campaign</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-3">
          <Field label="Advertiser name">
            <Input value={form.advertiser_name} onChange={(e) => set("advertiser_name", e.target.value)} />
          </Field>
          <Field label="Ad text (≤120 chars)">
            <Input value={form.text} maxLength={120} onChange={(e) => set("text", e.target.value)} />
          </Field>
          <Field label="Click URL (http/https)">
            <Input value={form.url} onChange={(e) => set("url", e.target.value)} />
          </Field>
          <Field label="Description">
            <Input value={form.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand color">
              <Input placeholder="#3ecf8e" value={form.brand_color} onChange={(e) => set("brand_color", e.target.value)} />
            </Field>
            <Field label="Logo URL (https)">
              <Input placeholder="https://…/logo.png" value={form.logo_url} onChange={(e) => set("logo_url", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Weight">
              <Input type="number" min={0} value={form.weight} onChange={(e) => set("weight", Number(e.target.value))} />
            </Field>
            <Field label="Budget (USD)">
              <Input type="number" min={0} step="0.01" value={form.budget_remaining} onChange={(e) => set("budget_remaining", Number(e.target.value))} />
            </Field>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={() => void submit()}>{busy ? "Creating…" : "Create Campaign"}</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
