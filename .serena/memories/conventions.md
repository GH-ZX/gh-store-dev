# Conventions
- TypeScript strict mode; App Router modules under `src/app`; shared domain/integration code under `src/lib`; provider-specific adapters under `src/providers`.
- Import project code with `@/…`.
- Leading underscore marks intentionally unused parameters/variables/caught errors; ESLint permits only `^_` names.
- Deno Edge Functions under `supabase/functions` are excluded from TS/ESLint; validate them through Supabase tooling/deployment.
- Generated database types live in `src/types/database.ts`; schema source of truth is ordered files in `supabase/migrations`.
- Only one reconciliation scheduler: Cloudflare Worker cron calls protected `POST /api/reconcile`; Supabase callbacks receive events and must not become a competing scheduler.
- Keep production secrets/server keys server-only; never expose service-role/provider/payment credentials through `NEXT_PUBLIC_` variables.
- Read relevant `node_modules/next/dist/docs/` guides before Next changes; do not assume older Next APIs/conventions.