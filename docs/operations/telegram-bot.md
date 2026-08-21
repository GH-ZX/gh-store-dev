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

1. **Create the bot** with [@BotFather](https://t.me/BotFather) and copy the
   token.

2. **Apply the migration** (adds `telegram_alerts` and stores bot settings in
   `store_settings.telegram`):

   ```bash
   supabase db push --project-ref njlzgfddfnnqujaodbta
   ```

3. **Set Worker secrets** in the Cloudflare dashboard for the `gh-store` Worker
   (or the Workers Builds "Variables and Secrets" section):

   | Secret | Value |
   |--------|-------|
   | `TELEGRAM_BOT_TOKEN` | The token BotFather gave you |
   | `TELEGRAM_WEBHOOK_SECRET` | A long random string (e.g. `openssl rand -hex 32`) |
   | `SUPABASE_URL` | `https://njlzgfddfnnqujaodbta.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Your project's service-role key |

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are new for the Telegram
   drain (the reconciliation cron only needs `RECONCILE_CRON_SECRET`). Set both
   on the Worker or the bot will log `alerts_not_configured` and do nothing.

4. **Point Telegram at the Worker** (run once):

   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://gh-store.me/telegram-webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```

   The webhook path is handled by the Worker directly; it never reaches the
   Next.js application.

5. **Register the owner chat**: open the bot in Telegram and send `/start`. The
   chat id is stored in `store_settings.telegram.chat_id`. Only that chat can
   use the bot's commands.

6. **Verify**: place a test order or send a support message; the alert should
   appear within five minutes. Worker logs are under Workers -> gh-store ->
   Logs with the `telegram` area tag.

## Notes

- The bot token can live either as the Worker secret or in
  `store_settings.telegram.bot_token`; the Worker secret is the recommended
  home and the database value is a fallback.
- Alerts stop if the worker misses the cron or if `store_settings.telegram.enabled`
  is set to `false`. Failed Telegram sends are retried on the next drain.
- Customer-facing Telegram account linking (orders and balance inside the chat)
  is intentionally not part of this build; it is a larger feature that needs a
  chat-id link flow in the store.
