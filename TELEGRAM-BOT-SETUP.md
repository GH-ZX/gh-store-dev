# Telegram Bot Setup — Quick Steps

The bot is already built and committed. The owner's chat is a full admin
control centre — stats, orders, recharges, support, customers, wallet
adjustments, and service health — and customers can browse, buy, link their
account, check orders and balance, and open support inside the chat. You only
need to complete these steps to go live.

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


## Step 3 — Point Telegram at the Edge Function (run once)

The dashboard's **Register the webhook** button does this correctly and also
registers the command menu. The manual equivalent is:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "content-type: application/json" \
  -d '{"url":"https://njlzgfddfnnqujaodbta.supabase.co/functions/v1/telegram-webhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>","allowed_updates":["message","callback_query"]}'
```

Telegram then sends `X-Telegram-Bot-Api-Secret-Token` on every update. The
legacy `?token=` query fallback is still accepted.

## Step 4 — Register your owner chat

1. Open your bot in Telegram.
2. Send `/start <WEBHOOK_SECRET>`, replacing `<WEBHOOK_SECRET>` with the secret
   shown in the dashboard after registering the webhook.
3. The first successful claim stores your chat id in
   `store_settings.telegram.chat_id`. Further chats cannot claim ownership.

The webhook secret is used only for this one-time bootstrap. Treat it like a
password and never publish it.

## Step 5 — Verify

- As owner, send `/stats` or open the control centre with `/menu`.
- Place a test order or send a support message as a customer.
- The alert should arrive in the relevant chat within **five minutes**.
- Worker logs are under Workers → gh-store → Logs, tagged `telegram`.

## Bot commands

### Owner — admin control centre

| Command | What it does |
|---|---|
| `/start <secret>` | Register the first owner chat (one-time) |
| `/menu` `/admin` `/start` | Open the control centre with buttons |
| `/stats` | Store totals, active orders, recharges, support, stock |
| `/orders` | Active orders with refund / mark-delivered actions |
| `/pending` `/recharges` | Top-ups awaiting approval with approve/reject |
| `/support` | Open support tickets with reply/close |
| `/customers <query>` | Search customers, view wallet, add/deduct balance |
| `/catalog` | Active games/offers summary |
| `/health` | Provider and payment configuration status |
| `/help` | Control centre help |
| `/cancel` | Cancel the current pending prompt |

All money-moving actions are gated by `is_admin(auth.uid())` in the database
and carry an idempotency key. Wallet, order, and support changes also notify
the affected customer in-app and over Telegram when their chat is linked.

### Customers

| Command | What it does |
|---|---|
| `/start` | Welcome and main menu |
| `/link CODE` or code alone | Link Telegram to the store account |
| `/catalog` `/search` `/deals` | Browse categories, games, offers |
| `/orders` | Recent orders with delivery status |
| `/wallet` | Balance and recharge link |
| `/support` | Open a support thread (subject then body) |
| `/account` | Profile card |
| `/unlink` | Unlink this chat |
| `/language` | Toggle Arabic/English |

Buying is guided inside the chat: pick an offer, choose wallet or recharge,
answer the game's fields, and confirm. Delivery codes appear on the order page
and are also pushed to Telegram when linked.

## Prerequisites already handled
- Migrations `20260821030000_telegram_alerts.sql`,
  `20260822010000_telegram_customer_links.sql`,
  `20260827100000_stored_products_hardening.sql`, and
  `20260827110000_telegram_admin_operations.sql` — **already applied** to
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
