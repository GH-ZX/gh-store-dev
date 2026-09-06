# GH Store — React Router

The active storefront and administration application runs React Router framework
mode with server rendering on Cloudflare Workers. The previous Next.js source
in `../src/` is retained as a behavior reference.

From the repository root:

```sh
pnpm install
pnpm --dir storefront install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
```

Development uses http://localhost:5173. Public Supabase bindings are defined in
`wrangler.jsonc`. Server integration secrets can be provided locally in
`.dev.vars` (see `.dev.vars.example`); production secrets belong in Cloudflare.
Never commit `.dev.vars`, sessions, or account credentials.

Route loaders/actions live in `app/routes/`; authenticated services live under
`app/.server/`. Request context keeps sessions separate across concurrent
requests. The `legacy` subdirectory contains ported domain services and actions
with their original business contracts; it has no Next.js runtime dependency.

`pnpm preview` builds and serves the production Worker locally. `pnpm deploy`
builds and deploys to production; use it only after verifying the intended
environment. The scheduled Worker reconciles pending fulfillment and drains
Telegram alerts; local verification must mock these integrations.
