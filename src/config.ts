import * as vscode from "vscode";
import { isAcceptableBackendUrl } from "./util/validation";

/**
 * Central configuration. The backend base URL is hardcoded by default so that
 * a compromised setting cannot silently redirect traffic to a malicious host
 * (see docs/03-SECURITY.md §3). A user MAY override it via settings, but only
 * with an https URL - this is gated for self-hosting/testing.
 */

/** Default, hardcoded backend. Replace with the real deployment URL. */
export const DEFAULT_API_BASE_URL =
  "https://codeslot-api.functions.supabase.co";

/** Marketing site (the advertiser portal lives at /login). Used by the
 *  "Advertise on CodeSlot" placeholder shown when no campaign is available.
 *  Replace with the real deployed site URL before publishing. */
export const MARKETING_URL = "https://codeslot.dev";

/** Client-side polling / timing constants (docs/06-UNIT-ECONOMICS.md §1). */
export const TIMING = {
  /** Continuous visible+focused dwell required to count one impression. */
  impressionDwellMs: 5_000,
  /** Ad rotation interval (3-5 min); also gated by server `next_in_seconds`. */
  defaultAdRefreshMs: 4 * 60_000,
  /** Minimum spacing the client enforces between impression reports per ad. */
  clientFreqCapMs: 4 * 60_000,
  /** Network request timeout. */
  requestTimeoutMs: 10_000,
} as const;

/** Returns the effective backend base URL, validated to be https. */
export function getApiBaseUrl(): string {
  const override = vscode.workspace
    .getConfiguration("codeslot")
    .get<string>("apiBaseUrl", "")
    .trim();

  if (override.length > 0) {
    // Allow https anywhere, or http only for loopback (local mock server).
    if (!isAcceptableBackendUrl(override)) {
      vscode.window.showErrorMessage(
        "CodeSlot: codeslot.apiBaseUrl must use https (http is allowed only for localhost). " +
          "Falling back to the default endpoint."
      );
      return DEFAULT_API_BASE_URL;
    }
    return override.replace(/\/+$/, "");
  }
  return DEFAULT_API_BASE_URL;
}

export function isEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("codeslot")
    .get<boolean>("enabled", true);
}
