#!/usr/bin/env node
/**
 * Build one pasteable SQL file from this upgrade's migrations.
 *
 * The owner applies schema changes in the hosted Supabase SQL editor rather than
 * through a local Docker stack, so this concatenates the upgrade migrations in
 * timestamp order into `supabase/apply/apply-all-upgrade-migrations.sql`.
 *
 * Deliberately not `supabase db push`: three migrations dated 20260911 are
 * absent from the remote migration history and one of them invents prices, so a
 * push would try to insert them. This script only ever reads the files listed in
 * UPGRADE_MIGRATIONS below and writes one output file. It touches no database.
 *
 * Run from the repository root:  node scripts/build-migration-bundle.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");
const outputDir = join(root, "supabase", "apply");
const outputFile = join(outputDir, "apply-all-upgrade-migrations.sql");

/**
 * The migrations belonging to this upgrade, in the order they must run.
 *
 * An explicit list rather than "every file newer than X": the order is a
 * correctness property (later migrations reference tables earlier ones create),
 * and a silent glob would happily bundle a half-finished file.
 */
const UPGRADE_MIGRATIONS = [
  // 20261010000000_product_points_names.sql and
  // 20261010000001_delete_rejected_test_recharges.sql are already applied
  // directly against live data and verified.
  "20261010010000_order_hold_state.sql",
  "20261010030000_batstore_stock_sync.sql",
  "20261010050000_region_variant_disambiguation.sql",
  "20261010090000_customer_telegram_channel.sql",
  "20261010100000_coupons.sql",
  "20261010110000_referral_loop.sql",
  "20261010120000_repeat_purchase_reminders.sql",
  "20261010140000_consolidate_categories.sql",
  "20261010150000_split_services_category.sql",
  "20261010160000_coupon_safety_and_permissions.sql",
];

const banner = `-- ===========================================================================
-- GH Store upgrade: all new migrations, in order, for the SQL editor.
--
-- GENERATED FILE — do not edit by hand.
-- Regenerate with:  node scripts/build-migration-bundle.mjs
--
-- HOW TO USE
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--   It is safe to re-run: every statement is idempotent.
--
-- WHY NOT "supabase db push"
--   Three migrations dated 20260911 are missing from remote migration history
--   and one of them invents prices. A push would offer to insert them. Applying
--   this bundle leaves migration history untouched.
--
-- AFTER RUNNING
--   Deploy the storefront from the same commit. The schema alone changes nothing
--   visible; the dashboard features need the new code.
-- ===========================================================================

`;

const parts = [banner];
const missing = [];
let included = 0;

for (const name of UPGRADE_MIGRATIONS) {
  const path = join(migrationsDir, name);

  if (!existsSync(path)) {
    // Absence is reported, not fatal: this file is regenerated as work lands,
    // and a partial bundle is more useful than a failed build.
    missing.push(name);
    continue;
  }

  const sql = readFileSync(path, "utf8").replace(/\s+$/, "");
  included += 1;

  parts.push(
    `\n-- ---------------------------------------------------------------------------\n` +
      `-- BEGIN ${name}\n` +
      `-- ---------------------------------------------------------------------------\n\n` +
      `${sql}\n\n` +
      `-- ---------------------------------------------------------------------------\n` +
      `-- END ${name}\n` +
      `-- ---------------------------------------------------------------------------\n`,
  );
}

parts.push(`
-- ===========================================================================
-- Post-apply verification. Every query below must return the stated result.
-- ===========================================================================

-- 1. Orders now accept 'held', and carry the hold metadata.
select pg_get_constraintdef(oid) as orders_status_constraint
  from pg_constraint
 where conrelid = 'public.orders'::regclass and conname = 'orders_status_check';

select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'orders'
   and column_name in ('held_reason', 'held_at');

select status, count(*) from public.orders group by status order by status;

-- 2. Every numeric-only active offer has a currency name (expects 0).
select count(*) as unlabelled_numeric_offers
  from public.offers o
  join public.products p on p.id = o.product_id
 where o.is_active
   and o.name_en ~ '^[0-9]+$'
   and coalesce(p.points_name_en, '') = '';

select slug, points_name_en, points_name_ar
  from public.products
 where coalesce(points_name_en, '') <> ''
 order by slug;

-- 3. Test recharges gone, ledger untouched (expects rejected = 2, credited 19.50).
select status, count(*) from public.recharge_requests group by status order by status;
select sum(wallet_credit_amount) as credited_total from public.recharge_requests;
select count(*) as deposit_rows, sum(amount) as deposit_total
  from public.wallet_transactions where type = 'deposit';

-- 4. Catalogue untouched by the upgrade (expects 663 active offers, 678 mappings).
select count(*) as active_offers from public.offers where is_active;
select count(*) as mapping_rows from public.provider_offer_mappings;
`);

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputFile, parts.join(""), "utf8");

console.log(`bundled ${included} migration(s) -> supabase/apply/apply-all-upgrade-migrations.sql`);
if (missing.length > 0) {
  console.log(`not present yet (skipped): ${missing.length}`);
  for (const name of missing) console.log(`  - ${name}`);
}
