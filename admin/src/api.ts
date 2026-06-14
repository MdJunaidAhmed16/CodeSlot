import type { Campaign, Metrics, NewAd } from "./types";

const BASE = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787"
).replace(/\/+$/, "");

const TOKEN_KEY = "codeslot.admin.token";
const LOGIN_KEY = "codeslot.admin.login";
const OWNER_KEY = "codeslot.admin.owner";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null): void {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LOGIN_KEY);
    localStorage.removeItem(OWNER_KEY);
  }
}
export function getLogin(): string | null {
  return localStorage.getItem(LOGIN_KEY);
}
export function getIsOwner(): boolean {
  return localStorage.getItem(OWNER_KEY) === "1";
}

async function req<T>(
  path: string,
  init: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.body) headers["content-type"] = "application/json";
  if (init.auth !== false) {
    const t = getToken();
    if (t) headers["authorization"] = `Bearer ${t}`;
  }
  const res = await fetch(`${BASE}/${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j.error ?? j.message ?? msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Exchange a GitHub access token for a CodeSlot session token. */
export async function exchangeGithubToken(githubToken: string) {
  const r = await req<{
    token: string;
    user: { id: string; login: string; is_admin: boolean; is_owner?: boolean };
  }>("auth", { method: "POST", body: { github_token: githubToken }, auth: false });
  setToken(r.token);
  localStorage.setItem(LOGIN_KEY, r.user.login);
  localStorage.setItem(OWNER_KEY, r.user.is_owner ? "1" : "0");
  return r.user;
}

export const getMetrics = () => req<Metrics>("admin-metrics");
export const listAds = () => req<{ ads: Campaign[] }>("admin-ads");
export const createAd = (ad: NewAd) =>
  req<{ ad: Campaign }>("admin-ads", { method: "POST", body: ad });
export const patchAd = (id: string, patch: Record<string, unknown>) =>
  req<{ ad: Campaign }>("admin-ads", { method: "PATCH", body: { id, ...patch } });
export const setFlag = (key: string, value: boolean) =>
  req<{ key: string; value: boolean }>("admin-flags", {
    method: "POST",
    body: { key, value },
  });
