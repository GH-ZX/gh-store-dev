# GH-Store Integration Inventory

| Integration | Purpose | Runtime boundary | Source |
|-------------|---------|------------------|--------|
| Supabase Auth | Identity and sessions | Next.js SSR clients | New staging/production projects |
| Supabase PostgreSQL | Catalog, wallets, orders, audit | Server services, RPC, RLS | `supabase/` |
| Supabase Storage | Product and game media | Server/admin upload path | `product-images` bucket |
| G2Bulk | Catalog, UID top-up, redeem codes | Server adapter / Edge Functions | `docs/providers/g2bulk-api.md` |
| Sam API | Wallets, invoices, transfers | Server adapter / Edge Functions | `.agents/skills/sam-api-wallet/` |
| ShamCash | Manual and Sam-backed recharge | Admin/customer payment flow | Sam and manual contracts |
| SyriatelCash | Sam-backed recharge and transfer | Server adapter / Edge Functions | Sam API contract |
| Binance Pay | Optional recharge method | Signed server webhook | Provider configuration |
| IGDB | Game cover and artwork search | Server/Edge proxy only | `docs/providers/igdb-api.md` |
| Cloudflare Workers | Hosting, edge runtime, WAF | OpenNext Worker | `wrangler.jsonc` |

## Provider Rules

- React components never call an external provider directly.
- API keys are server-only and never use `NEXT_PUBLIC_` names.
- Every webhook validates authenticity, checks the expected local record, and is idempotent.
- Provider responses are normalized before business services use them.
- Customer messages never expose supplier cost, provider wallet balance, or raw provider diagnostics.
