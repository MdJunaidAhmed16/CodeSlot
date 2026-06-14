import * as vscode from "vscode";
import { ApiClient } from "../api/client";
import { renderWebviewHtml } from "./html";
import type { BalanceResponse } from "../types";

/**
 * The "Wallet" webview: balance, today's earnings, recently shown ads, and
 * an ad-preferences toggle. All data is fetched by the extension host and
 * pushed to the webview via postMessage; the webview never makes its own
 * network calls (connect-src 'none').
 */
export class WalletPanel {
  private static current: WalletPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  static show(
    extensionUri: vscode.Uri,
    api: ApiClient,
    callbacks: WalletCallbacks
  ): void {
    if (WalletPanel.current) {
      WalletPanel.current.panel.reveal();
      void WalletPanel.current.refresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "codeslot.wallet",
      "CodeSlot Wallet",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
      }
    );
    WalletPanel.current = new WalletPanel(panel, extensionUri, api, callbacks);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly api: ApiClient,
    private readonly callbacks: WalletCallbacks
  ) {
    panel.webview.html = renderWebviewHtml({
      webview: panel.webview,
      extensionUri,
      scriptFile: "wallet.js",
      styleFile: "wallet.css",
      title: "CodeSlot Wallet",
      bodyHtml: WALLET_BODY,
    });

    this.disposables.push(
      panel.webview.onDidReceiveMessage((msg) => this.onMessage(msg))
    );
    panel.onDidDispose(() => this.dispose(), null, this.disposables);

    void this.refresh();
  }

  private async onMessage(msg: unknown): Promise<void> {
    if (!msg || typeof msg !== "object") {
      return;
    }
    const type = (msg as { type?: unknown }).type;
    switch (type) {
      case "ready":
      case "refresh":
        await this.refresh();
        break;
      case "redeem":
        this.callbacks.onRedeem();
        break;
      case "setEnabled":
        await this.callbacks.onSetEnabled(
          Boolean((msg as { value?: unknown }).value)
        );
        this.post({ type: "enabled", value: this.callbacks.isEnabled() });
        break;
      default:
        break;
    }
  }

  private async refresh(): Promise<void> {
    this.post({ type: "enabled", value: this.callbacks.isEnabled() });
    try {
      const balance = await this.api.balance();
      this.post({ type: "balance", data: sanitize(balance) });
    } catch (err) {
      this.post({
        type: "error",
        message:
          err instanceof Error ? err.message : "Could not load your balance.",
      });
    }
  }

  /** Push current balance to the webview after an event updates it. */
  pushBalance(balance: number): void {
    this.post({ type: "balanceQuick", value: balance });
  }

  private post(message: unknown): void {
    void this.panel.webview.postMessage(message);
  }

  dispose(): void {
    WalletPanel.current = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  static get instance(): WalletPanel | undefined {
    return WalletPanel.current;
  }
}

export interface WalletCallbacks {
  onRedeem: () => void;
  onSetEnabled: (enabled: boolean) => Promise<void>;
  isEnabled: () => boolean;
}

/** Strip the response down to display fields; never trust arbitrary HTML. */
function sanitize(b: BalanceResponse): BalanceResponse {
  return {
    balance: num(b.balance),
    lifetime_earned: num(b.lifetime_earned),
    lifetime_redeemed: num(b.lifetime_redeemed),
    stats_today: b.stats_today
      ? {
          impressions: num(b.stats_today.impressions),
          clicks: num(b.stats_today.clicks),
          earned: num(b.stats_today.earned),
        }
      : undefined,
    recent: Array.isArray(b.recent)
      ? b.recent.slice(0, 10).map((r) => ({
          advertiser_name: String(r.advertiser_name ?? "Sponsor"),
          event_type: r.event_type === "click" ? "click" : "impression",
          credits_awarded: num(r.credits_awarded),
          created_at: String(r.created_at ?? ""),
        }))
      : [],
  };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const WALLET_BODY = `
<header class="hero">
  <div class="hero-row">
    <div>
      <div class="hero-label">CODESLOT WALLET</div>
      <div id="balance" class="hero-balance">—</div>
      <div id="tokens" class="hero-sub">credits</div>
    </div>
    <div class="hero-bolt">⚡</div>
  </div>
  <div class="hero-actions">
    <button id="redeem" class="btn btn-primary">Redeem Credits</button>
    <button id="refresh" class="btn btn-ghost">Refresh</button>
  </div>
</header>

<section class="card">
  <div class="section-title">TODAY</div>
  <div id="today" class="today">No activity yet today.</div>
</section>

<section class="card">
  <div class="section-title">AD PREFERENCES</div>
  <label class="toggle-row">
    <span>Status bar ads &amp; credit earning</span>
    <input type="checkbox" id="enabled" class="toggle" />
  </label>
  <p class="hint">Turning this off hides the sponsored slot and stops credit accrual.</p>
</section>

<section class="card">
  <div class="section-title">RECENTLY SHOWN</div>
  <ul id="recent" class="recent"></ul>
</section>

<p id="error" class="error" hidden></p>
<footer class="footnote">CodeSlot never reads your code, files, or project data.</footer>
`;
