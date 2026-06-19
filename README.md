# CodeSlot

**Earn AI usage credits for a single, unobtrusive sponsored slot in your VS Code status bar.**

CodeSlot shows one small sponsored message at the bottom-right of your editor.
While you code, it quietly accrues credits you can redeem for AI tokens
(via OpenRouter — Claude, GPT, Gemini, and more). That's it. One slot, real
rewards, and a hard line on privacy.

## 🔒 Privacy first — we never read your code

> CodeSlot only knows that VS Code is open and focused. It cannot and does not
> read your code, files, or project information. The only data transmitted is
> an anonymous device identifier and ad interaction events (impression/click).

Concretely, the extension:

- **Never** uses any workspace/file API (`vscode.workspace.fs`,
  `textDocuments`, file paths, git info, etc.).
- Sends exactly **one** identifier — an anonymous random UUID generated on your
  machine — plus impression/click events.
- Only consults a single editor signal: whether the window is **focused**
  (a boolean), used solely to time impressions.
- Talks only to a fixed, hardcoded **https** backend (no dynamic/remote URLs).
- Stores your OpenRouter API key in the OS keychain (VS Code SecretStorage),
  never in plaintext, settings, or the cloud.

## How it works

1. **Sign in with GitHub** (one click, via VS Code's built-in GitHub auth) — this
   is required to earn, and is what keeps credits honest (no anonymous farming).
2. A small `📣 Sponsored …` item appears at the right of your status bar, next
   to a `💳 $balance` readout.
3. After ~5 seconds of focused dwell, an impression is counted and you earn a
   small credit.
4. Click the slot to open the advertiser's link (and earn a click credit).
5. Open **CodeSlot: Open Wallet** to see your balance, today's earnings, and
   recent activity.
6. Run **CodeSlot: Redeem Credits** to convert credits into OpenRouter credit.

## Commands

| Command | What it does |
|---|---|
| `CodeSlot: Sign in with GitHub` | Authenticate to start earning |
| `CodeSlot: Sign out` | Clear your CodeSlot session |
| `CodeSlot: Open Wallet` | Balance, earnings, ad preferences, recent activity |
| `CodeSlot: Redeem Credits` | 3-step flow to convert credits → AI tokens |
| `CodeSlot: Show Balance` | Quick balance notification |
| `CodeSlot: Pause / Resume Ads` | Stop/start the slot (pausing stops earning) |
| `CodeSlot: Open Current Ad` | Open the current sponsor link |
| `CodeSlot: Delete My Data` | Erase your device's server data and forget the local id |

## Settings

| Setting | Default | Description |
|---|---|---|
| `codeslot.enabled` | `true` | Show the slot and accrue credits |
| `codeslot.displayCurrency` | `auto` | Currency your earnings are shown in (`auto` / `usd` / `inr`) |
| `codeslot.apiBaseUrl` | `""` | Advanced: self-host override (must be `https://`) |

## Development

```bash
npm install
npm run watch      # bundle with esbuild in watch mode
# Press F5 in VS Code to launch the Extension Development Host
```

Other scripts: `npm run check-types`, `npm run lint`, `npm run package`.

### Try it locally without Supabase

A zero-dependency mock backend implements all five endpoints with in-memory
state so you can see live ads, impressions, clicks, balance, and a fake
redemption in the dev host:

```bash
npm run mock       # starts http://localhost:8787
```

Then set in your VS Code settings (the extension allows plain http **only** for
loopback hosts):

```json
"codeslot.apiBaseUrl": "http://localhost:8787"
```

Press F5, focus the editor for ~5s to see an impression land, and click the
status-bar slot to register a click. The mock rotates ads every 30s.

The serverless backend (Supabase Edge Functions + Postgres + Upstash Redis)
lives in [`backend/`](backend/README.md). The advertiser/admin console (Vite +
React) lives in [`admin/`](admin/README.md).

## Security

See [docs/03-SECURITY.md](docs/03-SECURITY.md) and
[SECURITY.md](SECURITY.md) for the threat model, data boundaries, and the
controls implemented in both the extension and the backend.

## License

MIT © junaid.builds
