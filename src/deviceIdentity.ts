import * as vscode from "vscode";
import { randomUUID } from "crypto";
import { isValidUuid } from "./util/validation";

const DEVICE_ID_KEY = "codeslot.deviceId";

/**
 * Manages the anonymous device identifier.
 *
 * Stored in `globalState` (NOT `workspaceState`) so it is never linked to a
 * specific project/folder. This UUID is the ONLY client-generated identifier
 * sent to the backend. It is unguessable but not secret (see SECURITY §4).
 */
export class DeviceIdentity {
  private constructor(private readonly id: string) {}

  static load(context: vscode.ExtensionContext): DeviceIdentity {
    const existing = context.globalState.get<string>(DEVICE_ID_KEY);
    if (isValidUuid(existing)) {
      return new DeviceIdentity(existing);
    }
    const fresh = randomUUID();
    // Persisted lazily; failure to persist just regenerates next session.
    void context.globalState.update(DEVICE_ID_KEY, fresh);
    return new DeviceIdentity(fresh);
  }

  get value(): string {
    return this.id;
  }

  /** Forget the local device id (used by "Delete My Data"). */
  static async reset(context: vscode.ExtensionContext): Promise<void> {
    await context.globalState.update(DEVICE_ID_KEY, undefined);
  }
}
