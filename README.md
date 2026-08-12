# GH-Store

Next.js digital gaming store with a new visual identity and Cloudflare deployment.

## Current Status

Phase 1 foundation: Next.js App Router, TypeScript, Tailwind CSS, Cloudflare Workers, and OpenNext are configured. Product features are intentionally not copied yet; they will be rebuilt from the `echocore-store` reference in controlled phases.

## Requirements

- Node.js 24
- pnpm 11
- Cloudflare account for preview/deployment

## Local Development

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3000.

## Quality Checks

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Cloudflare Preview

```bash
pnpm run preview
```

The preview uses OpenNext to build a Worker and Wrangler to run it locally.

## Deployment

```bash
pnpm run deploy
```

Production deployment will be enabled after Supabase, provider secrets, webhooks, and acceptance tests are configured.
