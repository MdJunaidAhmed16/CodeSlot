# Security Policy

CodeSlot's first principle: **it never reads, transmits, or has access to your
source code, file contents, file paths, or any workspace data.** See
[docs/03-SECURITY.md](docs/03-SECURITY.md) for the full threat model.

## What the extension can access

- An anonymous device UUID it generates (in `globalState`, never per-project).
- Whether the VS Code window is focused (a boolean), to time impressions.
- Nothing else. No file, document, git, or workspace API is used anywhere in
  the codebase. This is verifiable by inspecting `src/` — there are no imports
  of `vscode.workspace.fs`, `textDocuments`, or similar.

## Controls implemented

**Extension**
- Hardcoded https-only backend; non-https overrides are refused.
- All network requests time out and disallow redirects.
- Webviews use a strict, nonce-based CSP (`default-src 'none'`,
  `script-src 'nonce-…'`, `connect-src 'none'`) — no inline scripts, no eval,
  no network from the webview itself.
- Ad URLs are validated to be `http(s)` before they are ever opened.
- The OpenRouter API key is held in the OS keychain (SecretStorage) and is
  never typed into a webview DOM.

**Backend**
- Row Level Security is deny-all; only service-role Edge Functions touch data.
- Crediting and redemption are atomic and idempotent (double-spend safe).
- Balances are recomputed server-side; client-sent balances are never trusted.
- Per-device rate limits and frequency caps (Upstash Redis).
- Global kill switch for ad serving (no extension update required).

## Reporting a vulnerability

Email **mohammedjunaidah@gmail.com** with details and reproduction steps.
Please do not open a public issue for security reports.
