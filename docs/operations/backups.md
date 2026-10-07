# Database Backups & Recovery Guide

## 1. Supabase Automated Backups & Point-in-Time Recovery (PITR)
Supabase provides built-in enterprise database backups:
- **Daily Backups**: Automatically executed every 24 hours. Retained according to project billing tier.
- **Point-in-Time Recovery (PITR)**: If enabled on the Supabase project dashboard (Project Settings → Database → Backups), PostgreSQL WAL (Write-Ahead Logging) streams continuously, enabling restoration to any second in the past 7 to 30 days.
- **Restoration procedure**:
  1. Open Supabase Dashboard → Database → Backups.
  2. Select Point-in-Time Recovery or choose the desired daily backup snapshot.
  3. Restore to a new project or current project.

## 2. Nightly Automated GitHub Action (`nightly-backup.yml`)
As a redundancy layer independent of Cloudflare and Supabase hosts:
- A scheduled GitHub Action runs daily at `02:00 UTC`.
- It executes `supabase db dump` using the Postgres direct connection URL (`SUPABASE_DB_URL`).
- Dumps schema and data into encrypted/gzipped artifacts retained for 30 days in GitHub Artifacts.

## 3. Manual On-Demand Backup
To take a manual snapshot before schema changes or migrations:
```bash
# Dump full database (schema + public tables)
npx supabase db dump --db-url "$SUPABASE_DB_URL" -f backup_$(date +%Y%m%d_%H%M%S).sql

# Dump data only for customer orders and transactions
npx supabase db dump --db-url "$SUPABASE_DB_URL" --data-only -f data_backup.sql
```

## 4. Disaster Recovery Checklist
1. Export the latest dump from GitHub Actions artifacts or Supabase daily backups.
2. Verify integrity by inspecting the top SQL header and line count.
3. Apply to a clean database using `psql "$TARGET_DB_URL" < backup.sql`.
4. Run store health checks: `/dashboard/sync` and vitest test suite.
