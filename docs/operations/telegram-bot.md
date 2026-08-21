# Telegram Bot

GH-Store has one Telegram bot for both audiences: the store owner receives
operations alerts, and customers can link their account to see orders and
balance inside the chat. The bot has two halves:

1. **Webhook** — a Supabase Edge Function
   (`https://njlzgfddfnnqujaodbta.supabase.co/functions/v1/telegram-webhook`),
   gated by a token in the URL exactly like the G2Bulk callback. Commands the
   owner can use:

   - `/start` — register this chat as the owner chat and get a wallet balance.
   - `/stats` — active/completed orders, pending recharges, open support,
     undelivered alerts.
   - `/pending` — manual recharges waiting for review.
   - `/alerts` / `/help` — guidance.

2. **Scheduled drain** — on the Cloudflare Worker's five-minute cron, rows in
   `telegram_alerts` are delivered to the owner chat. Alerts fire for:

   - New orders placed.
   - Failed orders (including whether an automatic refund happened).
   - Manual recharge requests.
   - New support messages.
   - Low G2Bulk supplier wallet (deduplicated, so repeated checkouts do not
     flood the chat).

The store only ever writes the queue; it never calls Telegram synchronously, so
a Telegram outage cannot slow checkout or fulfillment.

## Setup

### From the dashboard (recommended)

The whole bot is configured from **Dashboard → Providers and API → Telegram
owner alerts**, without touching Cloudflare or a terminal:

1. Create the bot with [@BotFather](https://t.me/BotFather) and copy the token.
2. Set `SUPABASE_SERVICE_ROLE_KEY` as a **Worker secret** in the Cloudflare
   dashboard (Workers → gh-store → Settings → Variables and Secrets). This is
   what lets the Worker read the webhook secret and the alert queue back from
   Supabase — without it the webhook returns 401/503 and Telegram reports it
   as failing.
3. In the dashboard's Telegram panel, paste the token, save, and press **Verify
   bot**.
4. Press **Register the webhook** — the dashboard performs the `setWebhook`
   call itself. No curl needed.
5. Open the bot in Telegram and send `/start` from the chat that should receive
   alerts.
6. Verify: place a test order or send a support message; the alert arrives
   within five minutes.

### Manual setup (equivalent)

1. **Apply the migration** (adds `telegram_alerts` and stores bot settings in
   `store_settings.telegram`):

   ```bash
   supabase db push --project-ref njlzgfddfnnqujaodbta
   ```

2. **Set Worker secrets** in the Cloudflare dashboard for the `gh-store` Worker
   (or the Workers Builds "Variables and Secrets" section):

   | Secret | Value |
   |--------|-------|
   | `TELEGRAM_BOT_TOKEN` | The token BotFather gave you |
   | `TELEGRAM_WEBHOOK_SECRET` | A long random string (e.g. `openssl rand -hex 32`) |
   | `SUPABASE_URL` | `https://njlzgfddfnnqujaodbta.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Your project's service-role key |

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are **required** for two
   things: the alert drain, and the webhook itself — when the dashboard
   registers the webhook, the secret it stores lives in Supabase, so every
   incoming Telegram update is verified by reading it back from the database.
   Without the service key on the Worker the webhook cannot verify anything and
   answers 401/503, which Telegram logs as a failing webhook. `SUPABASE_URL`
   may be omitted if `NEXT_PUBLIC_SUPABASE_URL` is already set as a var — the
   Worker falls back to it.

3. **Point Telegram at the Edge Function** (run once):

   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://njlzgfddfnnqujaodbta.supabase.co/functions/v1/telegram-webhook?token=<TELEGRAM_WEBHOOK_SECRET>"
   ```

   The dashboard's **Register the webhook** button performs this same call with
   a freshly generated token, so the curl is only needed for manual setups.

4. **Register the owner chat**: open the bot in Telegram and send `/start`. The
   chat id is stored in `store_settings.telegram.chat_id`. Only that chat can
   use the bot's commands.

5. **Verify**: place a test order or send a support message; the alert should
   appear within five minutes. Worker logs are under Workers -> gh-store ->
   Logs with the `telegram` area tag. Webhook errors show under Supabase ->
   Edge Functions -> telegram-webhook -> Logs.

## Dashboard panel

Dashboard → Providers and API → **Telegram owner alerts**:

- **Bot token** — saved, write-only, replaced through the Edit button.
- **Deliver alerts** switch — turns delivery off without deleting the token.
- **Alert types** — per-event toggles: new orders, failed orders, manual
  recharge requests, new support messages, low supplier wallet.
- **Verify bot** — checks the token with Telegram, shows the bot's username,
  the registered webhook address, and whether the owner chat is linked.
- **Register / re-register the webhook** — performs `setWebhook` from the
  dashboard. Uses the Worker secret if one is set, otherwise generates and
  stores a fresh secret.

## Customers

The bot also serves customers, not just the owner. A customer links their
Telegram chat to their store account once, and the bot then answers with their
orders and wallet balance — no password ever goes through the bot.

### How a customer links (sign in)

The linking proof is a short-lived code, exactly like a two-factor backup:

1. On the site: **My account → Telegram bot** → **Get a link code** (with a
   **Copy** button). The code (e.g. `GS-1F4K2X`) is shown only to the signed-in
   account owner and expires in ten minutes. Re-minting retires the previous
   code.
2. In the bot: send the code as a message (or `/link <code>`). The bot
   validates it, binds the chat to the account, and marks the code used.

From then on the chat is linked: `/orders` shows the last five orders with
status, `/wallet` shows the balance, `/account` shows the profile, and the menu
buttons offer Catalog, Orders, Wallet, Browse the store, Support, and Unlink.
The owner chat is unaffected — it keeps the store operations.

### Catalog in the chat

The menu's **Catalog** button browses the store without leaving Telegram: pick
a category, then a game, then read the packages and prices. Text only — no
images. Back buttons return to the previous list, and the offers message links
to the site for checkout.

### Customer order notifications

A linked customer receives a Telegram message when an order of theirs is
delivered or fails, in the language they linked with (stored on the chat link
as `language_code`). Both directions share the `telegram_alerts` queue:

- alerts **without** `user_id` go to the owner chat (existing behavior);
- alerts **with** `user_id` go to that customer's linked chat.

The owner's per-type toggles apply only to the owner's own alerts; customer
alerts always reach the customer who owns the event.

### Data

- `telegram_chat_links` — `chat_id` → `user_id`, one chat per account, plus the
  `language_code` the customer linked with. RLS lets a customer read or delete
  only their own row; the bot writes with the service key.
- `telegram_link_codes` — one-use, ten-minute codes minted on the profile page
  and consumed by the bot.
- `telegram_alerts.user_id` — optional; routes a queued alert to a linked
  customer chat instead of the owner chat.

## Notes

- The bot token can live either as the Worker secret or in
  `store_settings.telegram.bot_token`; the dashboard stores it in the database,
  and the Worker falls back to it when no environment token exists.
- The webhook secret follows the same rule: environment secret first, stored
  secret as fallback. A database outage never breaks an already-registered
  webhook.
- Alerts stop if the worker misses the cron or if `store_settings.telegram.enabled`
  is set to `false`. Failed Telegram sends are retried on the next drain.
- Alert types disabled in the dashboard are skipped at delivery time, so a
  toggled-off event never reaches the chat even if it was queued.
- The bot never asks for a password. Customer sign-in is the code flow above;
  an email is only ever handled by the store itself.
