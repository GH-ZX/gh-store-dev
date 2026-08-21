# Telegram Bot Setup — Quick Steps

The owner bot is already built and committed. It delivers order, failed-order,
recharge, support, and low-wallet alerts to your Telegram chat. You only need to
complete these steps to go live.

Full details: [`docs/operations/telegram-bot.md`](docs/operations/telegram-bot.md)

---

## Step 1 — Create the bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram.
2. Send `/newbot` and follow the prompts (name, username).
3. Copy the **bot token** BotFather gives you.

## Step 2 — Add the Worker secrets

In Cloudflare → Workers → `gh-store` → Settings → **Variables and Secrets**,
add these four secrets:

| Secret | Value |
|--------|-------|
| `TELEGRAM_BOT_TOKEN` | The token BotFather gave you |
| `TELEGRAM_WEBHOOK_SECRET` | A long random string, e.g. `openssl rand -hex 32` |
| `SUPABASE_URL` | `https://njlzgfddfnnqujaodbta.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Your project's service-role key |

> `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are required for the alert
> drain. Without them the bot logs `alerts_not_configured` and does nothing.

## Step 3 — Point Telegram at the Worker (run once)

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://gh-store.me/telegram-webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Replace `<TOKEN>` and `<TELEGRAM_WEBHOOK_SECRET>` with your real values.

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

- Migration `20260821030000_telegram_alerts.sql` — **already applied** to
  Supabase.
- Database types regenerated — the build typechecks.
- The bot webhook and alert drain live in the Cloudflare Worker and deploy with
  the app (push this branch to GitHub so Cloudflare deploys it).
