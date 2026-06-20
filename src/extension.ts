import * as vscode from "vscode";
import { DeviceIdentity } from "./deviceIdentity";
import { ApiClient, ApiError } from "./api/client";
import { Secrets } from "./secrets";
import { AuthService } from "./auth";
import { StatusBarAd } from "./statusBarAd";
import { AdFetcher } from "./adFetcher";
import { ImpressionTracker } from "./impressionTracker";
import { WalletPanel } from "./webview/walletPanel";
import { RedeemPanel } from "./webview/redeemPanel";
import { isEnabled, MARKETING_URL } from "./config";
import { isSafeHttpUrl } from "./util/validation";
import { creditsToMoney, formatCredits } from "./economics";
import { resolveMoney } from "./money";

/**
 * Activation entry point.
 *
 * Wiring: identity/auth → api client → ad fetcher + impression tracker → status
 * bar. Earning requires a GitHub sign-in (anti-fraud). No workspace, document,
 * or filesystem API is touched anywhere here - the core privacy guarantee.
 */
export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel("CodeSlot", { log: true });
  context.subscriptions.push(log);
  log.info("CodeSlot activated.");

  const device = DeviceIdentity.load(context);
  const api = new ApiClient(device.value);
  const secrets = new Secrets(context.secrets);
  const auth = new AuthService(context, api, log);

  const statusBar = new StatusBarAd();
  const fetcher = new AdFetcher(api, log);
  const tracker = new ImpressionTracker(api, log);
  context.subscriptions.push(statusBar, fetcher, tracker, auth);

  fetcher.onAd((ad) => {
    tracker.setAd(ad);
    if (ad) {
      statusBar.setAd(ad);
    } else if (isEnabled() && auth.state.signedIn) {
      // No paid campaign available - keep the slot filled (non-earning) rather
      // than leaving an empty/$0 slot.
      statusBar.showAdPlaceholder();
    } else {
      statusBar.setAd(null);
    }
  });

  tracker.onCredit((newBalance) => {
    statusBar.setBalance(newBalance);
    WalletPanel.instance?.pushBalance(newBalance);
  });

  // Re-evaluate the UI whenever sign-in state changes.
  context.subscriptions.push(auth.onDidChange(() => applyState()));

  // Restore any saved session, then render the right state.
  void auth.init().then(() => applyState());

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("codeslot.enabled")) {
        applyState();
      }
      if (e.affectsConfiguration("codeslot.apiBaseUrl")) {
        void fetcher.refresh();
      }
      if (e.affectsConfiguration("codeslot.displayCurrency")) {
        void refreshMoney();
      }
    })
  );

  registerCommands(context, { api, auth, secrets, statusBar, fetcher, tracker, log });

  function applyState(): void {
    const on = isEnabled();
    const signedIn = auth.state.signedIn;

    if (!on) {
      tracker.setPaused(true);
      fetcher.stop();
      statusBar.showPaused();
      return;
    }
    if (!signedIn) {
      // Required to earn: no ads served and no tracking until signed in.
      tracker.setPaused(true);
      fetcher.stop();
      statusBar.showSignIn();
      return;
    }
    // Enabled and signed in → serve ads, track impressions, show balance.
    tracker.setPaused(false);
    statusBar.showConnecting();
    fetcher.start();
    void refreshMoney();
    void refreshBalance();
  }

  async function refreshMoney(): Promise<void> {
    const { currency, rate } = await resolveMoney(api);
    statusBar.setMoney(currency, rate);
  }

  async function refreshBalance(): Promise<void> {
    try {
      const b = await api.balance();
      statusBar.setBalance(b.balance);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await auth.signOut(); // token expired/invalid → back to sign-in
        return;
      }
      log.warn(`balance fetch failed: ${describe(err)}`);
      statusBar.setBalance(null);
    }
  }
}

interface Deps {
  api: ApiClient;
  auth: AuthService;
  secrets: Secrets;
  statusBar: StatusBarAd;
  fetcher: AdFetcher;
  tracker: ImpressionTracker;
  log: vscode.LogOutputChannel;
}

function registerCommands(context: vscode.ExtensionContext, deps: Deps): void {
  const { api, auth, secrets, statusBar, fetcher, tracker, log } = deps;

  const reg = (id: string, fn: (...a: never[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  reg("codeslot.signIn", async () => {
    const ok = await auth.signIn();
    if (ok) {
      void vscode.window.showInformationMessage(
        `CodeSlot: signed in as @${auth.state.login}. You're now earning credits.`
      );
    }
  });

  reg("codeslot.signOut", async () => {
    await auth.signOut();
    void vscode.window.showInformationMessage("CodeSlot: signed out.");
  });

  reg("codeslot.openWallet", () => {
    if (!auth.state.signedIn) {
      void auth.signIn();
      return;
    }
    WalletPanel.show(context.extensionUri, api, {
      onRedeem: () => RedeemPanel.show(context.extensionUri, api),
      onSetEnabled: async (enabled) =>
        vscode.workspace
          .getConfiguration("codeslot")
          .update("enabled", enabled, vscode.ConfigurationTarget.Global),
      isEnabled,
    });
  });

  reg("codeslot.redeemCredits", () => {
    if (!auth.state.signedIn) {
      void auth.signIn();
      return;
    }
    RedeemPanel.show(context.extensionUri, api);
  });

  reg("codeslot.showBalance", async () => {
    if (!auth.state.signedIn) {
      void auth.signIn();
      return;
    }
    try {
      const b = await api.balance();
      statusBar.setBalance(b.balance);
      const { currency, rate } = await resolveMoney(api);
      void vscode.window.showInformationMessage(
        `CodeSlot: you've earned ${creditsToMoney(b.balance, currency, rate)} ` +
          `(${formatCredits(b.balance)}) · redeemed ${formatCredits(b.lifetime_redeemed)}.`
      );
    } catch (err) {
      void vscode.window.showErrorMessage(
        `CodeSlot: could not fetch balance - ${describe(err)}`
      );
    }
  });

  reg("codeslot.togglePause", async () => {
    const cfg = vscode.workspace.getConfiguration("codeslot");
    const next = !cfg.get<boolean>("enabled", true);
    await cfg.update("enabled", next, vscode.ConfigurationTarget.Global);
    void vscode.window.showInformationMessage(
      next
        ? "CodeSlot resumed - you're earning credits again."
        : "CodeSlot paused - ads hidden and credit accrual stopped."
    );
  });

  reg("codeslot.advertise", async () => {
    await vscode.env.openExternal(vscode.Uri.parse(MARKETING_URL));
  });

  reg("codeslot.openCurrentAd", async () => {
    const ad = statusBar.ad;
    if (!ad) {
      return;
    }
    if (!isSafeHttpUrl(ad.url)) {
      void vscode.window.showWarningMessage(
        "CodeSlot: blocked an ad with an unsafe link."
      );
      return;
    }
    // Fire-and-forget the click event; opening the link is the priority.
    void tracker.reportClick(ad);
    await vscode.env.openExternal(vscode.Uri.parse(ad.url));
  });

  reg("codeslot.deleteMyData", async () => {
    if (!auth.state.signedIn) {
      void vscode.window.showInformationMessage(
        "CodeSlot: sign in first to delete your account data."
      );
      return;
    }
    const confirm = await vscode.window.showWarningMessage(
      "Delete all CodeSlot data for your account? This erases your credit " +
        "balance and history on the server and signs you out. This cannot be undone.",
      { modal: true },
      "Delete My Data"
    );
    if (confirm !== "Delete My Data") {
      return;
    }
    try {
      await api.deleteData();
    } catch (err) {
      log.warn(`delete-data failed: ${describe(err)}`);
      void vscode.window.showErrorMessage(
        "CodeSlot: server deletion failed, but local data will still be cleared."
      );
    }
    await secrets.clear();
    await auth.signOut();
    await DeviceIdentity.reset(context);
    fetcher.stop();
    statusBar.setAd(null);
    void vscode.window.showInformationMessage(
      "CodeSlot data deleted and signed out."
    );
  });
}

export function deactivate(): void {
  // Disposables are cleaned up via context.subscriptions.
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
