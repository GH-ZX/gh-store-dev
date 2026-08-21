# Telegram Bot Setup — Quick Steps

The bot is already built and committed. It delivers order, failed-order,
recharge, support, and low-wallet alerts to the owner's Telegram chat, and it
lets customers link their account to see orders and balance inside the chat. You
only need to complete these steps to go live.

Full details: [`docs/operations/telegram-bot.md`](docs/operations/telegram-bot.md)

---

## Step 1 — Create the bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram.
2. Send `/newbot` and follow the prompts (name, username).
3. Copy the **bot token** BotFather gives you.

> **Before registering the webhook**, make sure `SUPABASE_SERVICE_ROLE_KEY` is
> set as a `gh-store` Worker secret. The webhook verifies incoming updates by
> reading the stored secret from Supabase; without the key it answers 401/503
> and Telegram shows a webhook error.

## Step 2 — Add the Worker secrets

In Cloudflare → Workers → `gh-store` → Settings → **Variables and Secrets**,
add these four secrets:

| Secret | Value |
|--------|-------|
| `TELEGRAM_BOT_TOKEN` | The token BotFather gave you |
| `TELEGRAM_WEBHOOK_SECRET` | A long random string, e.g. `openssl rand -hex 32` |
| `SUPABASE_URL` | `https://njlzgfddfnnqujaodbta.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Your project's service-role key |

> `SUPABASE_SERVICE_ROLE_KEY` is **required**: the Worker reads the stored
> webhook secret and the alert queue from Supabase with it, so without it the
> webhook answers 401/503 and Telegram reports the webhook as failing.
> `SUPABASE_URL` may be omitted if `NEXT_PUBLIC_SUPABASE_URL` is already set
> as a var — the Worker falls back to it.

## Step 3 — Point Telegram at the Worker (run once)

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://njlzgfddfnnqujaodbta.supabase.co/functions/v1/telegram-webhook?token=<TELEGRAM_WEBHOOK_SECRET>"
```

Replace `<TOKEN>` and `<TELEGRAM_WEBHOOK_SECRET>` with your real values. The
webhook is a Supabase Edge Function (like the G2Bulk callback), so it works
however the store is deployed. The dashboard's **Register the webhook** button
does this same call with a freshly generated token — the curl is only for
manual setups.

## Step 4 — Register your chat

1. Open your bot in Telegram.
2. Send `/start`.
3. Your chat id is stored in `store_settings.telegram.chat_id`. Only that chat
   can use the bot's commands.

## Step 5 — Verify

- Place a test order or send a support message.
- The alert should arrive in your Telegram within **five minutes**.
- Worker logs are under Workers → gh-store → Logs, tagged `telegram`.

## Bot commands

| Command | What it does |
|---------|--------------|
| `/start` | Register this chat as owner + show G2Bulk wallet balance |
| `/stats` | Store totals and balances |
| `/pending` | Recharges waiting for review |
| `/alerts` | Alert type guidance |
| `/help` | Help message |

## Prerequisites already handled

- Migrations `20260821030000_telegram_alerts.sql` and
  `20260822010000_telegram_customer_links.sql` — **already applied** to
  Supabase.
- Database types regenerated — the build typechecks.
- The webhook lives in a Supabase Edge Function and deploys via the `Deploy
  Supabase Edge Functions` GitHub workflow (or manually with
  `supabase functions deploy telegram-webhook`). The alert drain stays in the
  Cloudflare Worker.

## For customers

Customers link their account from **My account → Telegram bot** on the site:
press **Get a link code**, then send the code to the bot. The bot then answers
with orders, balance, and store/support buttons. No password ever goes through
the bot.
