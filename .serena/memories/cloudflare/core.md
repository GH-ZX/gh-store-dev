# Cloudflare/OpenNext
- Wrangler entry `worker.ts`, deployed Worker name `gh-store`, OpenNext artifact under `.open-next`; config `wrangler.jsonc`, adapter config `open-next.config.ts`.
- Compatibility date 2026-08-11; flags `nodejs_compat`, `global_fetch_strictly_public`; Smart Placement targets Supabase region latency.
- Observability is intentionally enabled with persisted invocation logs and 100% head sampling; preserve this for post-incident diagnosis.
- Only cron scheduler: Worker invokes protected `POST /api/reconcile`; README says every five minutes but current `wrangler.jsonc` cron is `*/15 * * * *`—treat this as documented drift, verify intent before changing.
- `WORKER_SELF_REFERENCE` service binding is required by OpenNext caching. Incremental R2/D1 caches are intentionally disabled until their resources exist; binding missing resources breaks deployment rather than degrading.
- Public vars in Wrangler identify the app URL and Supabase URL/publishable key; secret credentials remain Worker secrets outside git.