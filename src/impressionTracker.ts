import * as vscode from "vscode";
import { randomUUID } from "crypto";
import { ApiClient, ApiError } from "./api/client";
import { TIMING } from "./config";
import type { Ad, EventType } from "./types";

type CreditListener = (newBalance: number, earned: number) => void;

/**
 * Counts an impression after the user has had the window focused (and an ad
 * visible) for a continuous dwell period.
 *
 * Privacy: the ONLY editor signal consulted is `vscode.window.state.focused`
 * (a boolean). No documents, paths, selections, or workspace APIs are touched.
 */
export class ImpressionTracker implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private dwellTimer: NodeJS.Timeout | undefined;
  private currentAd: Ad | null = null;
  private paused = false;
  /** Per-ad client-side frequency cap: last reported impression time. */
  private lastImpressionAt = new Map<string, number>();
  private listeners: CreditListener[] = [];

  constructor(
    private readonly api: ApiClient,
    private readonly log: vscode.LogOutputChannel
  ) {
    this.disposables.push(
      vscode.window.onDidChangeWindowState((s) => this.onFocusChange(s.focused))
    );
  }

  onCredit(listener: CreditListener): void {
    this.listeners.push(listener);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.clearDwell();
    } else {
      this.maybeStartDwell();
    }
  }

  /** Called whenever the visible ad changes. */
  setAd(ad: Ad | null): void {
    this.currentAd = ad;
    this.clearDwell();
    this.maybeStartDwell();
  }

  private onFocusChange(focused: boolean): void {
    if (focused) {
      this.maybeStartDwell();
    } else {
      // Lost focus → dwell must restart from zero next time.
      this.clearDwell();
    }
  }

  private maybeStartDwell(): void {
    if (
      this.paused ||
      !this.currentAd ||
      !vscode.window.state.focused ||
      this.dwellTimer
    ) {
      return;
    }
    const ad = this.currentAd;
    this.dwellTimer = setTimeout(() => {
      this.dwellTimer = undefined;
      void this.report(ad, "impression");
    }, TIMING.impressionDwellMs);
  }

  private clearDwell(): void {
    if (this.dwellTimer) {
      clearTimeout(this.dwellTimer);
      this.dwellTimer = undefined;
    }
  }

  /** Public: called by the click handler in extension.ts. */
  async reportClick(ad: Ad): Promise<void> {
    await this.report(ad, "click");
  }

  private async report(ad: Ad, type: EventType): Promise<void> {
    if (this.paused) {
      return;
    }
    if (type === "impression") {
      const last = this.lastImpressionAt.get(ad.ad_id) ?? 0;
      if (Date.now() - last < TIMING.clientFreqCapMs) {
        return; // client-side cap; server enforces authoritatively too
      }
      this.lastImpressionAt.set(ad.ad_id, Date.now());
    }

    try {
      const res = await this.api.trackEvent(ad.ad_id, type, randomUUID());
      if (res.success) {
        for (const l of this.listeners) {
          l(res.new_balance, res.credits_earned);
        }
      }
    } catch (err) {
      // Rate-limited or offline: roll back the cap stamp so we can retry later.
      if (type === "impression") {
        this.lastImpressionAt.delete(ad.ad_id);
      }
      const status = err instanceof ApiError ? ` (HTTP ${err.status})` : "";
      this.log.warn(`track-event ${type} failed${status}: ${describe(err)}`);
    }
  }

  dispose(): void {
    this.clearDwell();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
