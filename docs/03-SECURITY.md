# CodeSlot — Security & Privacy

## 1. Threat Model Summary

CodeSlot runs inside developers' editors with access (in principle) to their workspace. The single highest-priority security goal is: **CodeSlot must never read, transmit, or have access to source code, file contents, file paths, or any workspace data.** Any breach of this trust destroys the product.

Secondary concerns: credit-farming/fraud, API abuse, and advertiser data integrity.

## 2. Data Collection — Strict Boundaries

### Collected (and why)
- `device_id` — anonymous UUID, generated client-side, used solely for credit ledger
- Event timestamps — for impression/click logging
- Ad ID shown/clicked — for analytics and advertiser billing
- VS Code window focus state (boolean) — used only to gate impression timer, never transmitted with content

### Explicitly NOT collected
- File names, file paths, file contents, workspace folder names
- Git repo info, branch names, commit messages
- Any telemetry from VS Code's workspace APIs beyond focus/visibility state
- IP address beyond what's inherent to HTTPS requests (not logged/stored explicitly)
- User identity (no email, no GitHub login required for v1 — anonymous device ID only)

### Privacy Commitment Statement (for marketplace listing & README)
> "CodeSlot only knows that VS Code is open and focused. It cannot and does not read your code, files, or project information. The only data transmitted is an anonymous device identifier and ad interaction events (impression/click)."

## 3. Client-Side Security

- Extension code reviewed to ensure no use of `vscode.workspace.fs`, `vscode.workspace.textDocuments`, or similar APIs that could access file content
- All network calls go to a fixed, hardcoded Supabase Edge Function base URL (no dynamic/remote-config URLs that could be hijacked)
- `device_id` stored in `context.globalState` (not `workspaceState`, to avoid any per-project linkage)
- No `eval`, no remote code execution, no dynamically loaded scripts — critical for VS Code Marketplace review and general trust

## 4. Backend (Supabase Edge Functions) Security

### Authentication
- v1 has no user auth — `device_id` is the only identifier, treated as a bearer-like token (not secret, but unguessable UUID)
- Edge Functions validate `device_id` format (valid UUID) before processing

### Rate Limiting & Abuse Prevention
- Per-`device_id` rate limits on `/track-event` via Upstash Redis (e.g., max 1 impression per 4 minutes per ad, max N events/hour total)
- Frequency capping prevents same ad being credited repeatedly in short windows
- Server-side validation of dwell time is NOT possible (client-reported), so credit rates per event should be kept low enough that abuse isn't economically meaningful at MVP scale; monitor for anomalous device_ids with abnormal event frequency

### Database Security
- Row Level Security (RLS) enabled on all Supabase tables
- Edge Functions use service role key (server-side only, never exposed to client)
- Client never has direct DB access — all interaction via Edge Functions

### Secrets Management
- OpenRouter API keys/credentials stored as Supabase Edge Function environment secrets, never in code or client
- Upstash Redis credentials similarly stored as secrets

## 5. Redemption Flow Security

- `/redeem-credits` must validate:
  - Sufficient balance (server-side recalculation from ledger, not trusting client-sent balance)
  - Redemption amount within reasonable bounds (prevent integer overflow / negative amounts)
  - Idempotency: redemption requests should include a client-generated idempotency key to prevent double-spend on retry
- OpenRouter linking (account ref) should be validated before any credit application — TBD pending OpenRouter API capabilities

## 6. Compliance Considerations

- GDPR: since only anonymous UUIDs are collected (no PII), GDPR burden is minimal, but:
  - Provide a way for users to request deletion of their device_id's data (extension command: "Delete my CodeSlot data")
  - Document data retention policy (e.g., impressions older than 12 months aggregated/anonymized)
- VS Code Marketplace policies: review Microsoft's marketplace extension guidelines specifically around advertising content before submission — this is a potential rejection risk and should be checked early (Phase 1)

## 7. Advertiser-Side Security (v1, manual process)

- Ad submissions reviewed manually before insertion into `ads` table (prevent malicious URLs, phishing links, malware)
- `url` field validated against an allowlist pattern or basic malware-scanning service (e.g., Google Safe Browsing API check) before activation
- Budget fields server-validated to prevent negative/overflow values

## 8. Incident Response Plan (Lightweight, v1)

- Kill switch: ability to disable ad serving entirely via a feature flag (e.g., `/serve-ad` returns empty if flag set), without requiring extension update
- Monitoring: basic alerting on anomalous spike in `/track-event` calls (potential abuse) or `/redeem-credits` failures (potential OpenRouter integration issue)
