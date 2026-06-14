"use client";

import { getSupabase } from "./supabase";

const MAX_BYTES = 512 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/** Upload an advertiser logo to Supabase Storage; returns the public URL. */
export async function uploadLogo(file: File): Promise<string> {
  if (!ALLOWED.includes(file.type)) {
    throw new Error("Logo must be a PNG, JPG, WEBP, or SVG.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Logo must be under 512 KB.");
  }
  const sb = getSupabase();
  if (!sb) {
    throw new Error(
      "Logo upload needs the deployed site. In local dev, paste a logo image URL instead."
    );
  }
  const { data: userData } = await sb.auth.getUser();
  const uid = userData.user?.id ?? "anon";
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;

  const { error } = await sb.storage
    .from("ad-logos")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw new Error(error.message);

  return sb.storage.from("ad-logos").getPublicUrl(path).data.publicUrl;
}
