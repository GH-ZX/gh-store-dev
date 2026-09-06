# Supabase
- Production project ref `njlzgfddfnnqujaodbta`, region noted in Worker config as `ap-southeast-1`; migrations are explicit release steps and are not auto-pushed.
- Schema source `supabase/migrations`; generated application types `src/types/database.ts`; Deno Edge Functions `supabase/functions`; DB-focused tests `supabase/tests` and `tests/supabase`.
- Edge event receivers: `sam-webhook`, `g2bulk-webhook`, `binance-webhook`; deployment workflow runs after relevant main-branch changes when access token exists. They receive events; Cloudflare remains the sole reconciliation scheduler.
- Production Supabase/provider credentials live outside git. Browser receives only URL and publishable key; service-role key is server-only.
- For schema work: inspect tables/functions first, test locally, use an approved migration, regenerate DB types, run advisors/security checks. Exposed tables require RLS; privileged functions need explicit auth/ownership and EXECUTE review.