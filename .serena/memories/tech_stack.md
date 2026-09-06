# Stack
- Node 24 (`.nvmrc`), pnpm 11.17.0, TypeScript 5.9 strict/noEmit, ES modules/bundler resolution, alias `@/* -> src/*`.
- Next.js 16.3.0 App Router, React/ReactDOM 19.2.8. Repo `AGENTS.md` requires reading relevant installed Next docs before code changes because APIs differ from prior versions.
- Supabase JS 2.112.3 + SSR 0.12.4; Postgres migrations/RPCs and Deno Edge Functions.
- Cloudflare Workers via OpenNext adapter 1.20.2 and Wrangler 4.120.1; Tailwind 4.3.3.
- Vitest 4.1.10 unit/integration; Playwright 1.62.1 browser tests; ESLint 9 with Next core-web-vitals/typescript configs.
- Exact dependency pins and scripts: `package.json`; lockfile `pnpm-lock.yaml`.