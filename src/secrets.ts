import * as vscode from "vscode";
import { looksLikeOpenRouterKey } from "./util/validation";

const OPENROUTER_KEY = "codeslot.openrouterApiKey";

/**
 * Thin wrapper over VS Code SecretStorage for the user's OpenRouter API key.
 *
 * The key is stored in the OS keychain via SecretStorage — never in
 * globalState, settings, or plaintext on disk (see SECURITY §5).
 */
export class Secrets {
  constructor(private readonly storage: vscode.SecretStorage) {}

  async getOpenRouterKey(): Promise<string | undefined> {
    const v = await this.storage.get(OPENROUTER_KEY);
    return v && looksLikeOpenRouterKey(v) ? v : undefined;
  }

  async setOpenRouterKey(key: string): Promise<void> {
    const trimmed = key.trim();
    if (!looksLikeOpenRouterKey(trimmed)) {
      throw new Error("That does not look like a valid OpenRouter API key.");
    }
    await this.storage.store(OPENROUTER_KEY, trimmed);
  }

  async clear(): Promise<void> {
    await this.storage.delete(OPENROUTER_KEY);
  }
}
