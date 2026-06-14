import * as vscode from "vscode";
import { ApiClient } from "./api/client";
import { TIMING } from "./config";
import { isSafeHttpUrl } from "./util/validation";
import type { Ad } from "./types";

type AdListener = (ad: Ad | null) => void;

/**
 * Polls /serve-ad on a timer, validates the payload, and notifies listeners.
 *
 * Resilience: any network/parse error is swallowed (logged to the output
 * channel) and the last good ad is kept — the UI must never break because the
 * backend is down (ROADMAP Phase 2 exit criteria).
 */
export class AdFetcher implements vscode.Disposable {
  private timer: NodeJS.Timeout | undefined;
  private inFlight: AbortController | undefined;
  private listeners: AdListener[] = [];
  private disposed = false;

  constructor(
    private readonly api: ApiClient,
    private readonly log: vscode.LogOutputChannel
  ) {}

  onAd(listener: AdListener): void {
    this.listeners.push(listener);
  }

  start(): void {
    void this.refresh();
  }

  /** Pause fetching (cancels timer + in-flight) without disposing. */
  stop(): void {
    this.inFlight?.abort();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    // Clear the slot so a stale ad isn't left showing while paused/signed-out.
    this.emit(null);
  }

  /** Fetch immediately and (re)arm the timer based on the server's hint. */
  async refresh(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.inFlight?.abort();
    const controller = new AbortController();
    this.inFlight = controller;

    let nextMs = TIMING.defaultAdRefreshMs;
    try {
      const res = await this.api.serveAd(controller.signal);
      const ad = this.validate(res.ad);
      this.emit(ad);
      if (res.next_in_seconds && res.next_in_seconds > 0) {
        nextMs = Math.max(60_000, res.next_in_seconds * 1000);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        this.log.warn(`serve-ad failed: ${describe(err)}`);
      }
      // Keep showing the last good ad; just reschedule.
    } finally {
      if (!this.disposed) {
        this.arm(nextMs);
      }
    }
  }

  private arm(ms: number): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => void this.refresh(), ms);
  }

  /** Drop any ad that fails validation rather than render something unsafe. */
  private validate(ad: Ad | null): Ad | null {
    if (!ad) {
      return null;
    }
    if (
      typeof ad.ad_id !== "string" ||
      typeof ad.text !== "string" ||
      ad.text.trim().length === 0 ||
      !isSafeHttpUrl(ad.url)
    ) {
      this.log.warn(`Dropped malformed ad payload (id=${String(ad.ad_id)}).`);
      return null;
    }
    return ad;
  }

  private emit(ad: Ad | null): void {
    for (const l of this.listeners) {
      try {
        l(ad);
      } catch (e) {
        this.log.error(`ad listener threw: ${describe(e)}`);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.inFlight?.abort();
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
