import { getApiBaseUrl, TIMING } from "../config";
import { isAcceptableBackendUrl, isValidUuid } from "../util/validation";
import type {
  BalanceResponse,
  EventType,
  RedeemResponse,
  ServeAdResponse,
  TrackEventResponse,
} from "../types";

const EXTENSION_VERSION = "0.1.0";

/**
 * Typed HTTPS client for the CodeSlot backend.
 *
 * Security properties:
 *  - Only ever talks to the configured https base URL (no dynamic hosts).
 *  - Sends exactly one client identifier (the device UUID) plus event
 *    metadata. It NEVER reads or transmits workspace/file data.
 *  - All requests time out so a hung backend can't wedge the UI.
 */
export class ApiClient {
  /** CodeSlot session token (set after GitHub sign-in). */
  private token: string | undefined;

  constructor(private readonly deviceId: string) {
    if (!isValidUuid(deviceId)) {
      throw new Error("CodeSlot: refusing to start with an invalid device id.");
    }
  }

  setToken(token: string | undefined): void {
    this.token = token;
  }

  private async request<T>(
    path: string,
    init: {
      method: "GET" | "POST" | "PATCH";
      body?: unknown;
      signal?: AbortSignal;
      auth?: boolean;
    }
  ): Promise<T> {
    const base = getApiBaseUrl();
    const url = new URL(path.replace(/^\//, ""), base + "/");

    // Defense in depth: never issue a request to a non-https remote host, even
    // if a future refactor lets a bad base URL through (loopback http is the
    // only allowed exception, for the local mock server).
    if (!isAcceptableBackendUrl(url.toString())) {
      throw new Error("CodeSlot: backend URL must be https (or localhost http).");
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      TIMING.requestTimeoutMs
    );

    try {
      if (init.auth && !this.token) {
        throw new ApiError(401, "Sign in required.");
      }

      const res = await fetch(url, {
        method: init.method,
        headers: {
          accept: "application/json",
          "x-codeslot-version": EXTENSION_VERSION,
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...(init.auth && this.token
            ? { authorization: `Bearer ${this.token}` }
            : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: init.signal ?? controller.signal,
        redirect: "error",
      });

      if (!res.ok) {
        const detail = await safeReadError(res);
        throw new ApiError(res.status, detail);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Exchange a GitHub access token for a CodeSlot session token. */
  authenticate(githubToken: string): Promise<AuthResponse> {
    return this.request<AuthResponse>("auth", {
      method: "POST",
      body: { github_token: githubToken },
    });
  }

  /** Ad serving is anonymous (device-keyed only, for display frequency cap). */
  serveAd(signal?: AbortSignal): Promise<ServeAdResponse> {
    const qs = new URLSearchParams({ device_id: this.deviceId }).toString();
    return this.request<ServeAdResponse>(`serve-ad?${qs}`, {
      method: "GET",
      signal,
    });
  }

  trackEvent(
    adId: string,
    eventType: EventType,
    idempotencyKey: string
  ): Promise<TrackEventResponse> {
    return this.request<TrackEventResponse>("track-event", {
      method: "POST",
      auth: true,
      body: {
        ad_id: adId,
        event_type: eventType,
        idempotency_key: idempotencyKey,
        // Client clock only — server timestamps authoritatively.
        client_ts: Date.now(),
      },
    });
  }

  balance(): Promise<BalanceResponse> {
    return this.request<BalanceResponse>("balance", {
      method: "GET",
      auth: true,
    });
  }

  redeem(args: {
    model: string;
    creditsToRedeem: number;
    idempotencyKey: string;
  }): Promise<RedeemResponse> {
    return this.request<RedeemResponse>("redeem-credits", {
      method: "POST",
      auth: true,
      body: {
        model: args.model,
        credits_to_redeem: args.creditsToRedeem,
        idempotency_key: args.idempotencyKey,
      },
    });
  }

  deleteData(): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>("delete-data", {
      method: "POST",
      auth: true,
      body: {},
    });
  }
}

export interface AuthResponse {
  token: string;
  user: { id: string; login: string; is_admin: boolean; balance: number };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function safeReadError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    return data.error ?? data.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
