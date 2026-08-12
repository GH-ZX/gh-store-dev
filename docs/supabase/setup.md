# GH-Store Supabase Setup

## Projects

Create two new Supabase projects:

- `gh-store-staging` for migrations, provider tests, and UAT.
- `gh-store-production` for real customers after staging approval.

The old `echocore-store` Supabase project is not reused and is not modified.

## Local Variables

Copy `.env.example` to `.env.local` and provide only the staging values during development:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-staging-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Server-only credentials belong in the local secret file or Cloudflare/Supabase secret manager and must never be committed.

## Schema Process

1. Review `supabase/reference/gh-store-source-schema.sql` for behavior only.
2. Create ordered files under `supabase/migrations/`.
3. Add RLS and RPC tests with each security-sensitive migration.
4. Apply migrations to staging using the Supabase CLI.
5. Generate `src/types/database.ts` from staging.
6. Seed only approved catalog and website content.
7. Repeat the exact migration set in production after UAT.

Do not run the legacy source SQL directly. Do not apply destructive or mock sections to production.
