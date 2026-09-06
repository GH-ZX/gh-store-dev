# Completion
- Run the focused behavioral test/smoke scenario covering the changed contract first.
- Then applicable repository checks: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- For Cloudflare/deployment changes also run `pnpm build:cloudflare` and `pnpm validate:production-config`.
- Run `pnpm test:e2e` only when the changed user flow and configured browser/environment warrant it.
- Supabase schema/RPC changes: validate against local/test DB, run relevant tests under `supabase/tests` and `tests/supabase`, run DB/security advisors, and ensure an approved migration plus generated DB types match.
- Supabase Edge Functions require Supabase/Deno validation; root TypeScript and ESLint intentionally exclude them.
- Do not claim production behavior fixed without an observed production-safe scenario or precise limitation statement.