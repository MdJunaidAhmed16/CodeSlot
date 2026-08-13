import * as vscode from "vscode";
import { isHexColor, isHttpsUrl } from "./util/validation";
import { creditsToMoney, formatCredits, type DisplayCurrency } from "./economics";
import type { Ad } from "./types";

/** How long the slot stays "awake" (highlighted) after a new ad rotates in. */
const HIGHLIGHT_MS = 2500;

/**
 * Renders the single sponsored slot in the status bar plus a small balance
 * readout. Pure view layer - it holds no network logic and never touches the
 * workspace. Clicks are routed to a command, not handled inline.
 */
export class StatusBarAd implements vscode.Disposable {
  private readonly adItem: vscode.StatusBarItem;
  private readonly balanceItem: vscode.StatusBarItem;
  private currentAd: Ad | null = null;
  private currency: DisplayCurrency = "usd";
  private rate = 1;
  private lastBalance: number | null = null;
  private highlightTimer: ReturnType<typeof setTimeout> | undefined;

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
    // Restore the click target (a placeholder may have repointed it).
    this.adItem.command = "codeslot.openCurrentAd";
    const label = truncate(ad.text, 60);
    this.adItem.text = `$(megaphone) ${label}`;

    // Apply the advertiser's brand color to the slot text, but only if it's a
    // valid hex string - never trust arbitrary content from the ad payload.
    this.adItem.color = isHexColor(ad.brand_color) ? ad.brand_color : undefined;

    const tip = new vscode.MarkdownString(undefined, true);
    tip.isTrusted = false; // ad content is untrusted: no command links
    tip.supportHtml = false;
    // Brand-colored banner (SVG data URI): the advertiser's product in white
    // text on their brand color. All content is XML-escaped and the color is
    // hex-validated, so untrusted ad data cannot break out of the markup.
    tip.appendMarkdown(`${brandBanner(ad)}\n\n`);
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
    // Only promise credits when a click on THIS campaign actually pays. On a
    // CPM ad the advertiser is billed per impression and a click earns nothing,
    // so claiming otherwise would read as the product cheating the developer.
    tip.appendMarkdown(
      ad.rewards_click
        ? `$(link-external) Click to open · earns you credits`
        : `$(link-external) Click to open · you're earning per view`
    );
    this.adItem.tooltip = tip;
    this.adItem.show();

    // "Wake up" the slot briefly so a freshly rotated ad catches the eye, then
    // settle back to the calm, unobtrusive state.
    this.flashAttention();
  }

  /** Briefly emphasize the slot on rotation, then revert. */
  private flashAttention(): void {
    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer);
    }
    this.adItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
    this.highlightTimer = setTimeout(() => {
      this.adItem.backgroundColor = undefined;
      this.highlightTimer = undefined;
    }, HIGHLIGHT_MS);
  }

  /** Sets the currency earnings are shown in (and the live rate for INR). */
  setMoney(currency: DisplayCurrency, rate: number): void {
    this.currency = currency;
    this.rate = rate > 0 ? rate : 1;
    if (this.lastBalance !== null) {
      this.setBalance(this.lastBalance); // re-render with the new currency
    }
  }

  /** @param balanceCredits whole credits, or null if the backend is unreachable */
  setBalance(balanceCredits: number | null): void {
    this.resetBalanceCommand();
    this.lastBalance = balanceCredits;
    if (balanceCredits === null) {
      // Backend not reachable yet - stay visible so CodeSlot is always
      // present and clickable (opening the wallet still works offline).
      this.balanceItem.text = "$(credit-card) CodeSlot";
      this.balanceItem.tooltip =
        "CodeSlot - connecting to the backend… Click to open your wallet.";
      this.balanceItem.show();
      return;
    }
    // Lead with real money; keep raw credits as a secondary tooltip note.
    this.balanceItem.text = `$(credit-card) ${creditsToMoney(balanceCredits, this.currency, this.rate)}`;
    this.balanceItem.tooltip = `You've earned ${formatCredits(balanceCredits)} · click to open your wallet`;
    this.balanceItem.show();
  }

  /**
   * Fill the slot when no paid campaign is available, so it's never empty (and
   * never an empty/$0 first impression). Non-earning: the impression tracker is
   * cleared separately, so this placeholder accrues nothing. Clicking it opens
   * the advertiser portal.
   */
  showAdPlaceholder(): void {
    this.currentAd = null;
    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer);
      this.highlightTimer = undefined;
    }
    this.adItem.backgroundColor = undefined;
    this.adItem.text = "$(megaphone) Advertise on CodeSlot";
    this.adItem.color = undefined;
    this.adItem.command = "codeslot.advertise";
    const tip = new vscode.MarkdownString(undefined, true);
    tip.isTrusted = false;
    tip.supportHtml = false;
    tip.appendMarkdown(
      "No sponsor right now - your slot is open.\n\n$(link-external) Click to advertise on CodeSlot."
    );
    this.adItem.tooltip = tip;
    this.adItem.show();
  }

  /** Show an immediate presence on activation, before any network call. */
  showConnecting(): void {
    this.resetBalanceCommand();
    this.balanceItem.text = "$(credit-card) CodeSlot";
    this.balanceItem.tooltip =
      "CodeSlot - starting up. Click to open your wallet.";
    this.balanceItem.show();
  }

  /** Prompt the user to sign in before they can earn. */
  showSignIn(): void {
    this.currentAd = null;
    this.adItem.hide();
    this.balanceItem.text = "$(sign-in) Sign in to earn - CodeSlot";
    this.balanceItem.tooltip =
      "CodeSlot requires a GitHub sign-in to earn credits (prevents abuse). Click to sign in.";
    this.balanceItem.command = "codeslot.signIn";
    this.balanceItem.show();
  }

  /** Signed in with GitHub but on the capacity waitlist (not yet earning). */
  showWaitlisted(position?: number): void {
    this.currentAd = null;
    this.adItem.hide();
    const pos = position && position > 0 ? ` #${position}` : "";
    this.balanceItem.text = `$(clock) CodeSlot: waitlisted${pos}`;
    this.balanceItem.tooltip =
      "You're on the CodeSlot waitlist" +
      (position && position > 0 ? ` (position ${position})` : "") +
      ". We admit developers as advertiser funding grows - you'll be let in " +
      "automatically on a later launch once a slot opens. Click to learn more.";
    this.balanceItem.command = "codeslot.advertise";
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
      "Ads paused - no credits are being earned. Click to manage.";
    this.balanceItem.show();
  }

  dispose(): void {
    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer);
    }
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

/**
 * A brand-colored banner as an inline SVG data URI: white product text on the
 * advertiser's brand color. Security: the color is hex-validated (else a neutral
 * default), every advertiser string is XML-escaped, and the SVG contains only
 * shapes + text - no <script>, <foreignObject>, or external references - so
 * untrusted ad content can neither inject markup nor fetch anything.
 */
function brandBanner(ad: Ad): string {
  const color = isHexColor(ad.brand_color) ? ad.brand_color : "#24292e";
  const name = escapeXml(truncate(ad.advertiser_name, 26));
  const text = escapeXml(truncate(ad.text, 42));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="72">` +
    `<rect width="340" height="72" rx="8" fill="${color}"/>` +
    `<text x="16" y="30" font-family="sans-serif" font-size="12" fill="#ffffff" fill-opacity="0.8">${name}</text>` +
    `<text x="16" y="52" font-family="sans-serif" font-size="16" font-weight="700" fill="#ffffff">${text}</text>` +
    `</svg>`;
  const b64 = Buffer.from(svg, "utf8").toString("base64");
  return `![sponsored banner](data:image/svg+xml;base64,${b64})`;
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&apos;"
  );
}
