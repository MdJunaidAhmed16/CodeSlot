import * as vscode from "vscode";
import { ApiClient } from "./api/client";

const SESSION_TOKEN_KEY = "codeslot.sessionToken";
const USER_LOGIN_KEY = "codeslot.userLogin";
const GITHUB_SCOPES = ["read:user"];

export interface AuthState {
  signedIn: boolean;
  login?: string;
}

/**
 * GitHub-based authentication for CodeSlot.
 *
 * Uses VS Code's built-in GitHub authentication provider — no custom OAuth
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
    return { signedIn: this.signedIn, login: this.login };
  }

  /** Restore a stored session token at startup (no network, no prompt). */
  async init(): Promise<void> {
    const token = await this.context.secrets.get(SESSION_TOKEN_KEY);
    if (token) {
      this.api.setToken(token);
      this.login = this.context.globalState.get<string>(USER_LOGIN_KEY);
      this.signedIn = true;
      this.emitter.fire(this.state);
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
      // Ignore — leave current state as-is.
    }
  }

  private async exchange(githubToken: string): Promise<boolean> {
    try {
      const res = await this.api.authenticate(githubToken);
      await this.context.secrets.store(SESSION_TOKEN_KEY, res.token);
      await this.context.globalState.update(USER_LOGIN_KEY, res.user.login);
      this.api.setToken(res.token);
      this.signedIn = true;
      this.login = res.user.login;
      this.emitter.fire(this.state);
      return true;
    } catch (err) {
      this.log.warn(`CodeSlot /auth failed: ${describe(err)}`);
      void vscode.window.showErrorMessage(
        `CodeSlot: sign-in failed — ${describe(err)}`
      );
      return false;
    }
  }

  async signOut(): Promise<void> {
    await this.context.secrets.delete(SESSION_TOKEN_KEY);
    await this.context.globalState.update(USER_LOGIN_KEY, undefined);
    this.api.setToken(undefined);
    this.signedIn = false;
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
