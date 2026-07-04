import * as vscode from "vscode";
import { ApiClient } from "./api/client";

const SESSION_TOKEN_KEY = "codeslot.sessionToken";
const USER_LOGIN_KEY = "codeslot.userLogin";
const WAITLISTED_KEY = "codeslot.waitlisted";
const WAITLIST_POS_KEY = "codeslot.waitlistPosition";
const GITHUB_SCOPES = ["read:user"];

export interface AuthState {
  /** Admitted and earning (has a CodeSlot session token). */
  signedIn: boolean;
  /** GitHub auth succeeded but the developer is on the capacity waitlist. */
  waitlisted: boolean;
  login?: string;
  /** 1-based queue position while waitlisted. */
  waitlistPosition?: number;
}

/**
 * GitHub-based authentication for CodeSlot.
 *
 * Uses VS Code's built-in GitHub authentication provider - no custom OAuth
 * flow, webview, or client secret. The GitHub access token is exchanged at the
 * backend `/auth` endpoint for a CodeSlot session token (a signed JWT), which
 * is stored in SecretStorage and attached to user-scoped API calls.
 *
 * Earning credits requires this session, which closes the credit-farming hole
 * that an anonymous device id left open.
 */
export class AuthService implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<AuthState>();
  readonly onDidChange = this.emitter.event;

  private signedIn = false;
  private waitlisted = false;
  private waitlistPosition: number | undefined;
  private login: string | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly api: ApiClient,
    private readonly log: vscode.LogOutputChannel
  ) {
    // If the user revokes the GitHub session in VS Code, drop our session too.
    this.disposables.push(
      vscode.authentication.onDidChangeSessions((e) => {
        if (e.provider.id === "github") {
          void this.refreshFromGitHub();
        }
      })
    );
  }

  get state(): AuthState {
    return {
      signedIn: this.signedIn,
      waitlisted: this.waitlisted,
      login: this.login,
      waitlistPosition: this.waitlistPosition,
    };
  }

  /** Restore a stored session token at startup (no network, no prompt). */
  async init(): Promise<void> {
    const token = await this.context.secrets.get(SESSION_TOKEN_KEY);
    if (token) {
      this.api.setToken(token);
      this.login = this.context.globalState.get<string>(USER_LOGIN_KEY);
      this.signedIn = true;
      this.emitter.fire(this.state);
      return;
    }
    // Previously waitlisted: re-check silently in case a slot has opened
    // (Phase-1 promotion shows up on the next launch).
    if (this.context.globalState.get<boolean>(WAITLISTED_KEY)) {
      this.waitlisted = true;
      this.login = this.context.globalState.get<string>(USER_LOGIN_KEY);
      this.waitlistPosition = this.context.globalState.get<number>(WAITLIST_POS_KEY);
      this.emitter.fire(this.state);
      void this.refreshFromGitHub();
    }
  }

  /**
   * Interactive sign-in. Prompts for a GitHub session (if needed), exchanges it
   * for a CodeSlot session token, and persists it.
   */
  async signIn(): Promise<boolean> {
    let session: vscode.AuthenticationSession;
    try {
      session = await vscode.authentication.getSession("github", GITHUB_SCOPES, {
        createIfNone: true,
      });
    } catch (err) {
      this.log.warn(`GitHub sign-in cancelled/failed: ${describe(err)}`);
      return false;
    }
    return this.exchange(session.accessToken);
  }

  /** Silent re-auth using an existing GitHub session, if one exists. */
  private async refreshFromGitHub(): Promise<void> {
    try {
      const session = await vscode.authentication.getSession(
        "github",
        GITHUB_SCOPES,
        { createIfNone: false, silent: true }
      );
      if (session) {
        await this.exchange(session.accessToken);
      } else {
        await this.signOut();
      }
    } catch {
      // Ignore - leave current state as-is.
    }
  }

  private async exchange(githubToken: string): Promise<boolean> {
    try {
      const res = await this.api.authenticate(githubToken);

      // Capacity waitlist: signed in with GitHub but not yet admitted.
      if (res.status === "waitlisted" || !res.token) {
        await this.context.secrets.delete(SESSION_TOKEN_KEY);
        await this.context.globalState.update(USER_LOGIN_KEY, res.user.login);
        await this.context.globalState.update(WAITLISTED_KEY, true);
        await this.context.globalState.update(WAITLIST_POS_KEY, res.position);
        this.api.setToken(undefined);
        this.signedIn = false;
        this.waitlisted = true;
        this.waitlistPosition = res.position;
        this.login = res.user.login;
        this.emitter.fire(this.state);
        return false;
      }

      await this.context.secrets.store(SESSION_TOKEN_KEY, res.token);
      await this.context.globalState.update(USER_LOGIN_KEY, res.user.login);
      await this.context.globalState.update(WAITLISTED_KEY, false);
      await this.context.globalState.update(WAITLIST_POS_KEY, undefined);
      this.api.setToken(res.token);
      this.signedIn = true;
      this.waitlisted = false;
      this.waitlistPosition = undefined;
      this.login = res.user.login;
      this.emitter.fire(this.state);
      return true;
    } catch (err) {
      this.log.warn(`CodeSlot /auth failed: ${describe(err)}`);
      void vscode.window.showErrorMessage(
        `CodeSlot: sign-in failed - ${describe(err)}`
      );
      return false;
    }
  }

  async signOut(): Promise<void> {
    await this.context.secrets.delete(SESSION_TOKEN_KEY);
    await this.context.globalState.update(USER_LOGIN_KEY, undefined);
    await this.context.globalState.update(WAITLISTED_KEY, false);
    await this.context.globalState.update(WAITLIST_POS_KEY, undefined);
    this.api.setToken(undefined);
    this.signedIn = false;
    this.waitlisted = false;
    this.waitlistPosition = undefined;
    this.login = undefined;
    this.emitter.fire(this.state);
  }

  dispose(): void {
    this.emitter.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
