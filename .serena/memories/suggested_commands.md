# Commands
- Install: `pnpm install`; local setup: copy `.env.example` to `.env.local`; dev: `pnpm dev`; local URL `http://localhost:3000`.
- Unit/integration: `pnpm test`; browser: `pnpm test:e2e` (configured Chrome/environment required; admin tests also need `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`).
- Static checks: `pnpm lint`; `pnpm typecheck`; production config: `pnpm validate:production-config`.
- Build: `pnpm build`; Cloudflare artifact: `pnpm build:cloudflare`; local Worker preview: `pnpm preview`; production deploy: `pnpm deploy`; upload without deploy: `pnpm upload`.
- Cloudflare env types: `pnpm cf-typegen`.
- Supabase CLI changes frequently: discover exact command/flags with `supabase --help` / subgroup `--help`; prefer Supabase MCP for remote read-only inspection.