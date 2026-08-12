---
name: gh-store-orientation
---

# GH-Store Orientation

Use this skill before exploring a new GH-Store domain.

1. Read the matching file in `docs/reference/` first.
2. Open only the route, service, provider, or migration files needed for that domain.
3. Keep `echocore-store` read-only and use it only to compare behavior.
4. Load `gh-store-standards` for UI, i18n, and architecture changes.
5. Load `g2bulk-api` or `sam-api-wallet` before touching those providers.

## Current Boundaries

| Domain | GH-Store location |
|--------|------------------|
| Routes and layouts | `src/app/` |
| Services and use cases | `src/lib/services/` and `src/lib/use-cases/` |
| Providers | `src/providers/` |
| Validation | `src/lib/validation/` |
| Supabase | `src/lib/supabase/` and `supabase/` |
| Public contract docs | `docs/reference/` and `docs/providers/` |
