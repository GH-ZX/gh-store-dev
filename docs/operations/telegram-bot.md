# Owner Telegram Bot

GH-Store notifies the store owner over Telegram. The bot has two halves, both in
the Cloudflare Worker:

1. **Webhook** — `POST https://gh-store.me/telegram-webhook`, verified with the
   secret token Telegram sends. Commands the owner can use:

   - `/start` — register this chat as the owner chat and get a wallet balance.
   - `/stats` — active/completed orders, pending recharges, open support,
     undelivered alerts.
   - `/pending` — manual recharges waiting for review.
   - `/alerts` / `/help` — guidance.

2. **Scheduled drain** — on the Worker's five-minute cron, rows in
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
2. In the dashboard's Telegram panel, paste the token, save, and press **Verify
   bot**.
3. Press **Register the webhook** — the dashboard performs the `setWebhook`
   call itself. No curl needed.
4. Open the bot in Telegram and send `/start` from the chat that should receive
   alerts.
5. Verify: place a test order or send a support message; the alert arrives
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

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are required for the alert
   drain (the reconciliation cron only needs `RECONCILE_CRON_SECRET`). Set both
   on the Worker or the bot will log `alerts_not_configured` and do nothing.

3. **Point Telegram at the Worker** (run once):

   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://gh-store.me/telegram-webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```

   The webhook path is handled by the Worker directly; it never reaches the
   Next.js application. When the dashboard registers the webhook, it reuses a
   Worker `TELEGRAM_WEBHOOK_SECRET` if one is set, so the two paths never
   disagree about the secret.

4. **Register the owner chat**: open the bot in Telegram and send `/start`. The
   chat id is stored in `store_settings.telegram.chat_id`. Only that chat can
   use the bot's commands.

5. **Verify**: place a test order or send a support message; the alert should
   appear within five minutes. Worker logs are under Workers -> gh-store ->
   Logs with the `telegram` area tag.

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
- Customer-facing Telegram account linking (orders and balance inside the chat)
  is intentionally not part of this build; it is a larger feature that needs a
  chat-id link flow in the store.
