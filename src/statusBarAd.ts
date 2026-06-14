import * as vscode from "vscode";
import { isHexColor, isHttpsUrl } from "./util/validation";
import { creditsToUsd, formatCredits, formatUsd } from "./economics";
import type { Ad } from "./types";

/**
 * Renders the single sponsored slot in the status bar plus a small balance
 * readout. Pure view layer — it holds no network logic and never touches the
 * workspace. Clicks are routed to a command, not handled inline.
 */
export class StatusBarAd implements vscode.Disposable {
  private readonly adItem: vscode.StatusBarItem;
  private readonly balanceItem: vscode.StatusBarItem;
  private currentAd: Ad | null = null;

  constructor() {
    // Ad slot sits at the far right, low priority so it never crowds out
    // language/diagnostic items.
    this.adItem = vscode.window.createStatusBarItem(
      "codeslot.ad",
      vscode.StatusBarAlignment.Right,
      0
    );
    this.adItem.name = "CodeSlot Sponsored Slot";
    this.adItem.command = "codeslot.openCurrentAd";

    this.balanceItem = vscode.window.createStatusBarItem(
      "codeslot.balance",
      vscode.StatusBarAlignment.Right,
      1
    );
    this.balanceItem.name = "CodeSlot Credits";
    this.balanceItem.command = "codeslot.openWallet";
  }

  get ad(): Ad | null {
    return this.currentAd;
  }

  setAd(ad: Ad | null): void {
    this.currentAd = ad;
    if (!ad) {
      this.adItem.hide();
      return;
    }
    const label = truncate(ad.text, 60);
    this.adItem.text = `$(megaphone) ${label}`;

    // Apply the advertiser's brand color to the slot text, but only if it's a
    // valid hex string — never trust arbitrary content from the ad payload.
    this.adItem.color = isHexColor(ad.brand_color) ? ad.brand_color : undefined;

    const tip = new vscode.MarkdownString(undefined, true);
    tip.isTrusted = false; // ad content is untrusted: no command links
    tip.supportHtml = false;
    // Logo (https image only). Markdown image with a fixed small size.
    if (isHttpsUrl(ad.logo_url)) {
      tip.appendMarkdown(
        `![logo](${ad.logo_url}|width=16,height=16) `
      );
    }
    tip.appendMarkdown(`**Sponsored** · ${escapeMd(ad.advertiser_name)}\n\n`);
    if (ad.description) {
      tip.appendMarkdown(`${escapeMd(ad.description)}\n\n`);
    }
    tip.appendMarkdown(`$(link-external) Click to open · earns you credits`);
    this.adItem.tooltip = tip;
    this.adItem.show();
  }

  /** @param balanceCredits whole credits, or null if the backend is unreachable */
  setBalance(balanceCredits: number | null): void {
    this.resetBalanceCommand();
    if (balanceCredits === null) {
      // Backend not reachable yet — stay visible so CodeSlot is always
      // present and clickable (opening the wallet still works offline).
      this.balanceItem.text = "$(credit-card) CodeSlot";
      this.balanceItem.tooltip =
        "CodeSlot — connecting to the backend… Click to open your wallet.";
      this.balanceItem.show();
      return;
    }
    this.balanceItem.text = `$(credit-card) ${formatUsd(creditsToUsd(balanceCredits))}`;
    this.balanceItem.tooltip = `${formatCredits(balanceCredits)} · click to open your wallet`;
    this.balanceItem.show();
  }

  /** Show an immediate presence on activation, before any network call. */
  showConnecting(): void {
    this.resetBalanceCommand();
    this.balanceItem.text = "$(credit-card) CodeSlot";
    this.balanceItem.tooltip =
      "CodeSlot — starting up. Click to open your wallet.";
    this.balanceItem.show();
  }

  /** Prompt the user to sign in before they can earn. */
  showSignIn(): void {
    this.currentAd = null;
    this.adItem.hide();
    this.balanceItem.text = "$(sign-in) Sign in to earn — CodeSlot";
    this.balanceItem.tooltip =
      "CodeSlot requires a GitHub sign-in to earn credits (prevents abuse). Click to sign in.";
    this.balanceItem.command = "codeslot.signIn";
    this.balanceItem.show();
  }

  /** Restore the default click target (wallet) after sign-in/pause changes. */
  private resetBalanceCommand(): void {
    this.balanceItem.command = "codeslot.openWallet";
  }

  showPaused(): void {
    this.resetBalanceCommand();
    this.currentAd = null;
    this.adItem.hide();
    this.balanceItem.text = "$(circle-slash) CodeSlot paused";
    this.balanceItem.tooltip =
      "Ads paused — no credits are being earned. Click to manage.";
    this.balanceItem.show();
  }

  dispose(): void {
    this.adItem.dispose();
    this.balanceItem.dispose();
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function escapeMd(s: string): string {
  return s.replace(/[\\`*_{}[\]()#+\-.!|>]/g, "\\$&");
}
