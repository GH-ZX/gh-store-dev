---
name: gh-store-standards
---

# GH-Store Standards

## Localization

- Arabic is the default locale and must render RTL.
- English must render LTR.
- Do not write inline Arabic/English ternaries in components.
- Add user-facing messages to both locale message files.
- Use message keys and formatting helpers for placeholders.
- Category names must be concise/single-word without compound '&' or 'and' (e.g. VPN, not VPN & Security).
- Maintain strict bilingual separation: English and Arabic stay in their dedicated fields (`name_en` / `name_ar`), never concatenated.

## Architecture

- Server Components are the default.
- Client Components are limited to interaction and browser APIs.
- Pages compose services; pages do not contain database or provider business logic.
- All external input is validated with Zod before reaching a service.
- Browser code never calls G2Bulk, Sam, Binance Pay, or IGDB.
- Provider credentials and service-role keys are server-only.

## Commerce Safety

- Recalculate prices and totals on the server.
- Use database transactions/RPC for wallet debit and order creation.
- Use idempotency keys for checkout, payments, webhooks, and fulfillment retries.
- Keep wallet transactions append-only.
- Never expose supplier cost or provider diagnostics to customers.

## Quality

- New behavior starts with a failing test.
- Keep services small and domain-focused.
- Run `pnpm check` after TypeScript or route changes.
- Run build to verify Cloudflare compatibility.

## Deployment & CI/CD

- The GitHub repository (`origin/main`) is connected directly to Cloudflare.
- Pushing commits to `main` triggers automatic deployment.
- Never manually run `wrangler deploy` or attempt CLI deployment.
