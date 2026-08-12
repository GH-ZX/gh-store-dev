# GH-Store Supabase Setup

## Projects

Create two new Supabase projects:

- `gh-store-staging` for migrations, provider tests, and UAT.
- `gh-store-production` for real customers after staging approval.

The old `echocore-store` Supabase project is not reused and is not modified.

## Hosted-Only Workflow

GH-Store does not use the Supabase Docker stack for development. Keep the migration files and CLI configuration in the repository, but apply and verify them against the hosted staging project.

Do not run:

```bash
supabase start
supabase test db
```

Use the hosted workflow instead:

```bash
supabase link --project-ref <staging-project-ref>
supabase db push --dry-run
supabase db push
supabase gen types typescript --linked > src/types/database.ts
```

RLS and migration checks are run against staging through the Supabase SQL editor or a controlled database connection. Production is never used for development tests.

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
4. Link the CLI to the hosted staging project.
5. Apply migrations to staging using `supabase db push`.
6. Generate `src/types/database.ts` from the linked staging project.
7. Seed only approved catalog and website content.
8. Repeat the exact migration set in production after UAT.

Do not run the legacy source SQL directly. Do not apply destructive or mock sections to production.
