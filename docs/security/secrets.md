# GH-Store Secrets Policy

## Secret Locations

| Secret | Location | Browser visibility |
|--------|----------|--------------------|
| Supabase URL | `NEXT_PUBLIC_SUPABASE_URL` | Public |
| Supabase publishable key | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public with RLS |
| Supabase service-role key | Cloudflare/Supabase secret | Never |
| `G2BULK_API_KEY` | Supabase Edge secret or Worker secret | Never |
| `G2BULK_CRON_SECRET` | Supabase secret and cron configuration | Never |
| `SAM_API_KEY` | Supabase Edge secret or Worker secret | Never |
| Sam webhook secret | Supabase secret/database protected by admin policy | Never |
| Binance credentials | Worker secret | Never |
| IGDB client secret | Edge/Worker secret | Never |
| `RECONCILE_CRON_SECRET` | Worker secret, checked by `POST /api/reconcile` | Never |
| Telegram bot token / webhook secret | Worker secret or `store_settings.telegram` (server-side) | Never |
| `MAXSTORE_API_TOKEN` / `BATSTORE_API_TOKEN` | Worker env or `store_settings.providers` (server-side) | Never |

## Rules

- Never select secrets with `*` from settings tables.
- Public payment configuration returns flags only, never tokens or keys.
- Provider API calls run only in server code or Supabase Edge Functions.
- Webhooks validate signatures or shared tokens, expected entity, amount, currency, and current status.
- Duplicate webhook events return success without duplicating balance credit or fulfillment.
- Logs contain correlation IDs and safe error codes, not credentials or payment secrets.
