# GH-Store Documentation

This documentation describes the new GH-Store implementation. The old `echocore-store` repository is a read-only source of behavior and historical contracts.

## Start Here

| Need | Document |
|------|----------|
| What must be reproduced | [Reference routes](./reference/routes.md) · [Feature matrix](./reference/features.md) |
| External integrations | [Integration inventory](./reference/integrations.md) |
| SQL decisions | [SQL inventory](./reference/sql-inventory.md) · [Supabase setup](./supabase/setup.md) |
| Secrets and security | [Secrets policy](./security/secrets.md) |
| Domain and hosting | [Cloudflare domain guide](./operations/domain-cloudflare.md) |
| G2Bulk contract | [G2Bulk API](./providers/g2bulk-api.md) |
| IGDB contract | [IGDB API](./providers/igdb-api.md) |
| Owner overview | [Owner guide](./owner-guide.md) |

## Runtime

```text
Customer -> Cloudflare Workers + Next.js -> Supabase Auth/PostgreSQL/Storage
                                      -> Supabase Edge Functions
                                      -> G2Bulk / Sam / Binance Pay / IGDB
```

## Rules

- The product name is **GH-Store**.
- `echocore-store` is reference material only.
- `gh-store-old` is an archive only.
- Do not run the legacy source SQL directly against the new project.
- Production secrets stay in Cloudflare or Supabase secret stores.
