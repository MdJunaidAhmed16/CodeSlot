# CodeSlot - earn AI credits while you code

**Put one small sponsored slot in your VS Code status bar and earn AI usage
credits while you work.** Redeem them for real AI tokens via OpenRouter - Claude,
GPT, Gemini, and more. One slot, real rewards, and a hard line on privacy.

## 🔒 Privacy first - CodeSlot never reads your code

> CodeSlot only knows that VS Code is open and focused. It cannot and does not
> read your code, files, or project information. The only data it sends is an
> anonymous device identifier and ad-interaction events (impression / click).

- **Never** uses any workspace or file API - no file contents, paths, git info,
  or project data, ever.
- Sends exactly **one** identifier - an anonymous random id generated on your
  machine - plus impression/click events.
- The only editor signal it reads is whether the window is **focused**
  (a boolean), used solely to time impressions.
- Talks only to a fixed **https** backend - no dynamic or third-party hosts.
- Your redeemed OpenRouter API key is stored in your OS keychain (VS Code
  SecretStorage) - never in plaintext, settings, or the cloud.

## How it works

1. **Sign in with GitHub** (one click, via VS Code's built-in GitHub auth). This
   is required to earn and keeps rewards honest - no anonymous farming.
2. A small `📣 Sponsored …` item appears at the right of your status bar, next
   to a `💳 balance` readout.
3. After ~5 seconds of focused dwell, an impression is counted and you earn a
   small credit.
4. Click the slot to open the sponsor's link and earn a click credit.
5. Open **CodeSlot: Open Wallet** to see your balance, today's earnings, and
   recent activity.
6. Run **CodeSlot: Redeem Credits** to turn credits into an OpenRouter API key
   loaded with that value.

Your earnings are shown as **real money** - dollars or rupees - so you always
know what your credits are worth (switch via `codeslot.displayCurrency`).

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
| `CodeSlot: Delete My Data` | Erase your server data and forget the local id |

## Settings

| Setting | Default | Description |
|---|---|---|
| `codeslot.enabled` | `true` | Show the slot and accrue credits |
| `codeslot.displayCurrency` | `auto` | Currency your earnings are shown in (`auto` / `usd` / `inr`) |
| `codeslot.apiBaseUrl` | `""` | Advanced override of the backend URL (`https://` only) |

## Support

Questions, feedback, or a problem? Email **scrollarapp@gmail.com** and we'll
help you out.

---

CodeSlot is a proprietary product. © CodeSlot. All rights reserved.
