import * as vscode from "vscode";
import { randomUUID } from "crypto";
import { ApiClient } from "../api/client";
import { renderWebviewHtml } from "./html";
import {
  creditsToUsd,
  MIN_REDEEM_CREDITS,
  PLATFORM_FEE_RATE,
} from "../economics";
import { resolveMoney } from "../money";
import type { RedeemModel } from "../types";

/** Offline fallback if the live OpenRouter catalog can't be fetched. */
const FALLBACK_MODELS: RedeemModel[] = [
  { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5", vendor: "Anthropic" },
  { id: "openai/gpt-4o", name: "GPT-4o", vendor: "OpenAI" },
  { id: "google/gemini-1.5-pro", name: "Gemini 1.5 Pro", vendor: "Google" },
  { id: "mistralai/mistral-large", name: "Mistral Large", vendor: "Mistral" },
  { id: "meta-llama/llama-3.1-405b", name: "Llama 3.1 405B", vendor: "Meta", freeTier: true },
  { id: "deepseek/deepseek-v3", name: "DeepSeek V3", vendor: "DeepSeek" },
];

/**
 * The 3-step "Redeem Credits → AI Tokens" flow.
 *
 * On confirm, the BACKEND provisions a brand-new OpenRouter API key whose
 * spend limit equals the redeemed value, then returns that key once. The user
 * never supplies their own key; the platform's provisioning key stays
 * server-side. The minted key is shown to the user to copy.
 */
export class RedeemPanel {
  private static current: RedeemPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private busy = false;
  private models: RedeemModel[] = FALLBACK_MODELS;

  static show(extensionUri: vscode.Uri, api: ApiClient): void {
    if (RedeemPanel.current) {
      RedeemPanel.current.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "codeslot.redeem",
      "Redeem Credits",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
      }
    );
    RedeemPanel.current = new RedeemPanel(panel, extensionUri, api);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly api: ApiClient
  ) {
    panel.webview.html = renderWebviewHtml({
      webview: panel.webview,
      extensionUri,
      scriptFile: "redeem.js",
      styleFile: "redeem.css",
      title: "Redeem Credits",
      bodyHtml: REDEEM_BODY,
    });

    this.disposables.push(
      panel.webview.onDidReceiveMessage((m) => this.onMessage(m))
    );
    panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private async onMessage(msg: unknown): Promise<void> {
    if (!msg || typeof msg !== "object") {
      return;
    }
    const m = msg as {
      type?: string;
      model?: unknown;
      amount?: unknown;
      key?: unknown;
    };
    switch (m.type) {
      case "ready":
        await this.sendInit();
        break;
      case "confirm":
        await this.confirm(String(m.model), m.amount);
        break;
      case "copyKey":
        if (typeof m.key === "string" && m.key.startsWith("sk-or-")) {
          await vscode.env.clipboard.writeText(m.key);
          void vscode.window.showInformationMessage(
            "OpenRouter key copied to clipboard."
          );
        }
        break;
      default:
        break;
    }
  }

  private async sendInit(): Promise<void> {
    let balanceCredits = 0;
    try {
      balanceCredits = (await this.api.balance()).balance;
    } catch {
      // Show the form anyway; confirm will re-check server-side.
    }
    // Live, price-aware catalog; fall back to the static list on any failure.
    try {
      const { models } = await this.api.redeemModels();
      if (Array.isArray(models) && models.length > 0) {
        this.models = models;
      }
    } catch {
      this.models = FALLBACK_MODELS;
    }
    const money = await resolveMoney(this.api);
    this.post({
      type: "init",
      models: this.models,
      balanceCredits,
      minCredits: MIN_REDEEM_CREDITS,
      creditUsd: creditsToUsd(1),
      feeRate: PLATFORM_FEE_RATE,
      currency: money.currency,
      rate: money.rate,
    });
  }

  private async confirm(modelId: string, rawAmount: unknown): Promise<void> {
    if (this.busy) {
      return;
    }
    const model = this.models.find((x) => x.id === modelId);
    if (!model) {
      this.post({ type: "result", ok: false, message: "Unknown model." });
      return;
    }

    // Re-fetch the authoritative balance (in credits); never trust the webview.
    let balanceCredits: number;
    try {
      balanceCredits = (await this.api.balance()).balance;
    } catch {
      this.post({
        type: "result",
        ok: false,
        message: "Could not verify your balance. Try again.",
      });
      return;
    }

    // Amount is in whole credits, clamped to the available balance.
    const requested = Math.floor(Number(rawAmount));
    const amount = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 0), balanceCredits)
      : 0;
    if (amount < MIN_REDEEM_CREDITS) {
      this.post({
        type: "result",
        ok: false,
        message: `Minimum redemption is ${MIN_REDEEM_CREDITS.toLocaleString()} credits (~$${creditsToUsd(MIN_REDEEM_CREDITS).toFixed(2)}).`,
      });
      return;
    }

    this.busy = true;
    this.post({ type: "busy", value: true });
    try {
      const res = await this.api.redeem({
        model: model.id,
        creditsToRedeem: amount,
        idempotencyKey: randomUUID(),
      });
      if (res.success && res.openrouter_key) {
        // Also drop the key on the clipboard immediately as a convenience.
        void vscode.env.clipboard.writeText(res.openrouter_key);
      }
      this.post({
        type: "result",
        ok: res.success,
        message: res.success
          ? `Redeemed ${amount.toLocaleString()} credits → $${res.openrouter_credit_applied.toFixed(2)} OpenRouter key created.`
          : res.message ?? "Redemption failed.",
        newBalance: res.new_balance,
        tokens: res.estimated_tokens,
        key: res.openrouter_key,
        keyName: res.openrouter_key_name,
        credit: res.openrouter_credit_applied,
      });
    } catch (err) {
      this.post({
        type: "result",
        ok: false,
        message: err instanceof Error ? err.message : "Redemption failed.",
      });
    } finally {
      this.busy = false;
      this.post({ type: "busy", value: false });
    }
  }

  private post(message: unknown): void {
    void this.panel.webview.postMessage(message);
  }

  dispose(): void {
    RedeemPanel.current = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

const REDEEM_BODY = `
<div class="modal">
  <header class="modal-head">
    <div>
      <h1>Redeem Credits <span class="arrow">→</span> AI Tokens</h1>
      <p id="subtitle" class="subtitle">Your balance: <b id="bal">—</b> · Select where to spend it (min 5,000 cr ≈ $5)</p>
    </div>
  </header>

  <section id="step1" class="step">
    <div id="models" class="model-grid"></div>
  </section>

  <section id="step2" class="step" hidden>
    <button class="back" data-back="1">← Back</button>
    <div class="amount-wrap">
      <div class="amount-display">$<span id="amountBig">0.00</span></div>
      <div class="quick">
        <button class="chip" data-amt="5">$5</button>
        <button class="chip" data-amt="10">$10</button>
        <button class="chip" data-amt="25">$25</button>
        <button class="chip" data-amt="all" id="chipAll">All</button>
      </div>
      <table class="breakdown">
        <tr><td>Redeeming</td><td id="bdCredits">$0.00</td></tr>
        <tr><td>Platform fee (5%)</td><td id="bdFee">-$0.00</td></tr>
        <tr class="strong"><td>OpenRouter credit</td><td id="bdNet">$0.00</td></tr>
      </table>
      <p id="minHint" class="warn" hidden></p>
    </div>
  </section>

  <section id="step3" class="step" hidden>
    <button class="back" data-back="2">← Back</button>
    <div class="confirm">
      <div class="confirm-icon">✓</div>
      <table class="breakdown">
        <tr><td>Target model</td><td id="cfModel">—</td></tr>
        <tr class="strong"><td>Redemption value</td><td id="cfValue">$0.00</td></tr>
      </table>
      <p class="warn">Credits are non-refundable once redeemed. We'll create a
        new OpenRouter API key loaded with this amount and show it once — copy
        and store it somewhere safe.</p>
    </div>
  </section>

  <section id="keybox" class="keybox" hidden>
    <div class="key-title">✅ Your OpenRouter key is ready</div>
    <p class="key-sub" id="keySub"></p>
    <div class="key-row">
      <input id="keyField" class="key-field" type="password" readonly value="" />
      <button id="keyReveal" class="key-btn" title="Show / hide">👁</button>
      <button id="keyCopy" class="key-btn" title="Copy">⧉</button>
    </div>
    <p class="key-warn">⚠️ This key is shown only once and can't be retrieved
      again. Use it as your OpenRouter API key (base URL https://openrouter.ai/api/v1).</p>
  </section>

  <footer class="modal-foot">
    <button id="next" class="btn btn-primary" disabled>Next →</button>
  </footer>
  <p id="status" class="status" hidden></p>
  <p class="secure">🔒 Secure transaction — the key is minted server-side and shown only to you.</p>
</div>
`;
