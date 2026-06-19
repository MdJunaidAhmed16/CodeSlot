"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anon);

let advClient: SupabaseClient | null = null;
let userClient: SupabaseClient | null = null;

/**
 * Advertiser-portal Supabase client. The advertiser and the developer ("user")
 * portals keep SEPARATE auth sessions, each in its own storage key — otherwise
 * signing in (or out) on one portal would clobber the other when the same
 * person is both an advertiser and a developer in the same browser.
 */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  if (!advClient) {
    advClient = createClient(url!, anon!, {
      auth: { storageKey: "sb-codeslot-advertiser" },
    });
  }
  return advClient;
}

/** Developer-portal Supabase client (independent session/storage). */
export function getUserSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  if (!userClient) {
    userClient = createClient(url!, anon!, {
      auth: { storageKey: "sb-codeslot-user" },
    });
  }
  return userClient;
}
