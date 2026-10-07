-- ===========================================================================
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


-- ---------------------------------------------------------------------------
-- BEGIN 20261010010000_order_hold_state.sql
-- ---------------------------------------------------------------------------

-- Order hold state.
--
-- `held` means: the customer paid, the goods are not out, and the store is
-- waiting on a supplier wallet the owner controls. It is not a failure and not
-- a refund — the money was already taken at checkout and stays taken; the order
-- simply cannot be bought from the supplier until the owner recharges that
-- supplier account and presses "I recharged — deliver now" in the dashboard.
--
-- Why a status rather than the old behaviour: a supplier that answered
-- "Insufficient balance to complete this order." used to leave the order at
-- `processing`, which nothing ever picked up again (the reconciliation sweep
-- does not re-buy for an existing attempt). Three live orders died that way —
-- paid, invisible in any queue, and never delivered. `held` is visible: it is
-- excluded from the sweep and from auto-refund, and it is what the dashboard's
-- held queue and the per-order "deliver now" button key off.
--
-- Two companion columns so the held queue can be sorted and explained without
-- opening each order:
--   * `held_at`     — when the hold started, for hold age.
--   * `held_reason` — the supplier's answer / what the owner must do, refreshed
--                     on every failed retry so the queue never shows a stale
--                     reason.
--
-- Idempotent and safe to re-run: the constraint is dropped by name (with the
-- two names it could have been auto-generated under) and re-added, and the
-- columns use `if not exists`. Re-running changes nothing.
--
-- Scope: no data migration. Three historical orders sit in `processing` with an
-- `insufficient_balance` attempt; their status is deliberately NOT rewritten
-- here. The dashboard and customer read paths treat that state as held-like, so
-- they surface in the held queue with the same button without a blind UPDATE
-- that would hide what the supplier actually recorded.

-- ---------------------------------------------------------------------------
-- 1. Allow 'held' alongside every existing status.
-- ---------------------------------------------------------------------------

alter table public.orders
  drop constraint if exists orders_status_check;

-- The name Postgres gives an inline `check (status in (...))` on this table.
alter table public.orders
  drop constraint if exists orders_status_check1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'orders'
      and c.conname = 'orders_status_check'
  ) then
    alter table public.orders
      add constraint orders_status_check check (
        status in (
          'pending',
          'payment_pending',
          'paid',
          'processing',
          'fulfilling',
          'held',
          'completed',
          'failed',
          'refunded',
          'cancelled'
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Hold metadata.
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists held_reason text;

alter table public.orders
  add column if not exists held_at timestamptz;

comment on column public.orders.held_reason is
  'Why this order is held: the supplier''s answer, refreshed on each failed retry. Null when the order is not held.';
comment on column public.orders.held_at is
  'When the order entered the held state, for hold age in the dashboard queue. Null when the order is not held.';

-- The dashboard sorts the held queue oldest first and counts it; the existing
-- orders_status_created_idx already leads with `status`, so no new index is
-- needed for the queue itself. This one serves the age ordering within a status.
create index if not exists orders_held_at_idx
  on public.orders (held_at)
  where held_at is not null;

-- ---------------------------------------------------------------------------
-- Verification (run after applying; all four must hold):
--
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.orders'::regclass and conname = 'orders_status_check';
--   -- expects a definition containing 'held' and all nine pre-existing values.
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'orders'
--      and column_name in ('held_reason', 'held_at');
--   -- expects 2 rows, both nullable (text / timestamp with time zone).
--
--   select count(*) from public.orders where status = 'held';
--   -- expects 0 immediately after this migration: nothing is migrated into it.
--
--   select status, count(*) from public.orders group by status order by status;
--   -- unchanged from before the migration.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- END 20261010010000_order_hold_state.sql
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- BEGIN 20261010030000_batstore_stock_sync.sql
-- ---------------------------------------------------------------------------

-- BatStore stock sync: throttle state, a sync-log kind, and the index the
-- sweep needs.
--
-- Why this exists: BatStore is a Telegram-bot reseller with dynamic stock. The
-- store decides visibility from `offers.is_active`, and the import service can
-- park a zero-stock offer (`is_active = false` + `metadata.parked_by_stock_sync
-- = true`). Nothing ran that logic on a schedule, so an offer that was in stock
-- when it was imported stayed active through the supplier running dry, and the
-- customer was charged for a product BatStore could not deliver (live evidence:
-- fulfillment_attempts for BatStore product #16, "Insufficient stock ... available
-- 0"). The Worker's 5-minute tick now runs a throttled stock sweep instead.
--
-- Three parts, all idempotent:
--   1. `provider_sync_state` — one throttle row per (provider, kind), so a
--      5-minute tick can refresh BatStore at most once every N minutes and can
--      be inspected by an operator.
--   2. `provider_sync_logs.kind` gains `stock_sync` (the existing check
--      constraint allows only catalog_import/catalog_sync/wallet_check/
--      reconciliation).
--   3. An index on `provider_offer_mappings (provider_name, offer_id)` so the
--      sweep can read the 57 BatStore mappings without a sequential scan, and
--      so the checkout preflight can find one offer's mapping in one lookup.

-- 1. Throttle state -----------------------------------------------------------

create table if not exists public.provider_sync_state (
  id uuid primary key default gen_random_uuid(),

  -- Stable identity of one throttled sweep: 'batstore' + 'stock_sync'.
  provider_name text not null,
  kind text not null,

  -- When the sweep last actually ran (not last attempted). The throttle reads
  -- this and skips while `now - last_run_at < interval`.
  last_run_at timestamptz,

  -- Free-form per-run reporting: counts, whether it was throttled, and the
  -- reason it did nothing. Shown to an operator; never read by the sweep.
  details jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  unique (provider_name, kind)
);

create index if not exists provider_sync_state_kind_idx
  on public.provider_sync_state (kind, last_run_at desc nulls last);

drop trigger if exists provider_sync_state_set_updated_at on public.provider_sync_state;
create trigger provider_sync_state_set_updated_at
before update on public.provider_sync_state
for each row
execute function public.set_updated_at();

alter table public.provider_sync_state enable row level security;

-- Admin-only, exactly like provider_sync_logs: the details name supplier
-- product ids and stock counts.
drop policy if exists provider_sync_state_admin_all on public.provider_sync_state;
create policy provider_sync_state_admin_all
on public.provider_sync_state
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

grant select, insert, update, delete on public.provider_sync_state to authenticated;

-- 2. A sync-log kind for stock sweeps ----------------------------------------
-- `drop ... if exists` then re-add covers both the original inline check
-- constraint and any prior run of this migration.

alter table public.provider_sync_logs
  drop constraint if exists provider_sync_logs_kind_check;

alter table public.provider_sync_logs
  add constraint provider_sync_logs_kind_check
  check (kind in ('catalog_import', 'catalog_sync', 'wallet_check', 'reconciliation', 'stock_sync'));

-- 3. The index the sweep and the preflight need -------------------------------

create index if not exists provider_offer_mappings_provider_offer_idx
  on public.provider_offer_mappings (provider_name, offer_id);

-- ---------------------------------------------------------------------------
-- END 20261010030000_batstore_stock_sync.sql
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- BEGIN 20261010050000_region_variant_disambiguation.sql
-- ---------------------------------------------------------------------------

-- Item 9 — regional variants of the same product must be distinguishable.
--
-- Owner's words: "those MLBB are different regions, keep them, not compatible
-- with each other — help me with that."
--
-- This migration keeps every product, offer, price and provider mapping exactly
-- as it is. It only adds the region facts a shopper needs, taken from the
-- supplier's own published notes in `provider_game_mappings.metadata->>'notes'`
-- (synced 2026-09-10/24), plus region words a shopper actually types in Arabic.
--
-- What is deliberately NOT done:
--   * No product is merged, retired or redirected.
--   * No region name is invented. G2Bulk's notes for `mlbb_special` and
--     `mlbb_exclusive` state only which countries are excluded, not which
--     region the package serves, so `region.label_*` stays absent for those two
--     and the page says the supplier has not published a region. The owner must
--     supply those two labels, or confirm them with the supplier.
--   * No price, mapping, offer, or administrator override is touched.
--
-- `products.metadata.region` is the machine-readable record:
--   { "label_en": …, "label_ar": …, "excluded": [...], "note_en": …,
--     "note_ar": …, "region_status": …, "source": … }
-- `label_en`/`label_ar` are absent when the supplier published no region;
-- `region_status` is 'not_recorded' in that case.

begin;

-- 1. Mobile Legends, three separate regional packages.
--    `mlbb` is the global package; G2Bulk excludes ID/SG/MY/PH/RU/VN from it.
update public.products set
  description_en = 'Mobile Legends: Bang Bang diamond top-up delivered straight to your game account. This is the global Mobile Legends package, not the Special or Exclusive package, and the three are not interchangeable: the package is only valid for the region the supplier allocated to it. The supplier publishes this package as available everywhere except Indonesia, Singapore, Malaysia, the Philippines, Russia and Vietnam — players inside those countries must order the Mobile Legends Special package instead. Check which package your account can accept before you pay — a top-up sent to the wrong regional package cannot be moved or refunded. Enter your player ID and server ID exactly as they appear in the game, because those two values are what the supplier uses to find your account. Diamond credit is delivered to the account you name, not a code you redeem yourself.',
  description_ar = 'شحن جواهر Mobile Legends: Bang Bang مباشرة إلى حسابك في اللعبة. هذه هي باقة Mobile Legends العالمية، وليست باقة Special ولا باقة Exclusive، والباقات الثلاث غير متبادلة: كل باقة صالحة فقط للمنطقة التي خُصّصت لها عند المورّد. ينشر المورّد هذه الباقة كمتاحة في كل المناطق باستثناء إندونيسيا وسنغافورة وماليزيا والفلبين وروسيا وفيتنام، وعلى اللاعبين داخل هذه الدول طلب باقة Mobile Legends Special بدلًا منها. تأكد من الباقة التي يقبلها حسابك قبل الدفع؛ فالشحن المرسل إلى باقة منطقة غير مطابقة لا يمكن نقله ولا استرجاعه. أدخل معرّف اللاعب ومعرّف السيرفر كما يظهران في اللعبة تمامًا، فهاتان القيمتان هما ما يستخدمه المورّد للوصول إلى حسابك. تُسلَّم الجواهر إلى الحساب الذي تحدده، وليست كودًا تستبدله بنفسك.',
  search_aliases = search_aliases || array['mobile legends global', 'mlbb global', 'موبايل ليجند العالميه', 'موبايل ليجند العالمية'],
  metadata = metadata || jsonb_build_object('region', jsonb_build_object(
    'label_en', 'Global (supplier excludes Indonesia, Singapore, Malaysia, the Philippines, Russia and Vietnam)',
    'label_ar', 'عالمية (يستثني المورّد إندونيسيا وسنغافورة وماليزيا والفلبين وروسيا وفيتنام)',
    'excluded', jsonb_build_array('ID', 'SG', 'MY', 'PH', 'RU', 'VN'),
    'note_en', 'Not available for Indonesia users, Indonesian users can use mlbb_global. Not available for SG/MY/PH/RU/VN',
    'note_ar', 'غير متاحة للمستخدمين في إندونيسيا؛ على مستخدمي إندونيسيا استخدام باقة mlbb_global. وغير متاحة في سنغافورة وماليزيا والفلبين وروسيا وفيتنام.',
    'region_status', 'published',
    'source', 'provider_game_mappings.metadata.notes'
  ))
where slug = 'mlbb';

update public.products set
  description_en = 'Mobile Legends: Bang Bang diamond top-up for the supplier''s Special regional package, delivered straight to your game account. This is a different regional package from the global Mobile Legends package and from Mobile Legends Exclusive — the three are not interchangeable, and a top-up sent to the wrong one cannot be moved or refunded. The supplier has not published which region this package serves — it states only that Indonesia is excluded and that Indonesian players must use the global or Indonesia package. If you are unsure which package your account accepts, ask our support team before paying and include your player ID and server ID so the correct package can be confirmed. Enter your player ID and server ID exactly as they appear in the game. Diamond credit is delivered to the account you name, not a code you redeem yourself.',
  description_ar = 'شحن جواهر Mobile Legends: Bang Bang عبر باقة Special الإقليمية لدى المورّد، ويُسلَّم مباشرة إلى حسابك في اللعبة. هذه باقة إقليمية مختلفة عن باقة Mobile Legends العالمية وعن باقة Mobile Legends Exclusive، والباقات الثلاث غير متبادلة، والشحن المرسل إلى باقة غير مطابقة لا يمكن نقله ولا استرجاعه. لم ينشر المورّد المنطقة التي تخدمها هذه الباقة؛ فهو يذكر فقط أن إندونيسيا مستثناة وأن على لاعبي إندونيسيا استخدام الباقة العالمية أو باقة إندونيسيا. إن لم تكن متأكدًا من الباقة التي يقبلها حسابك فاسأل فريق الدعم قبل الدفع واذكر معرّف اللاعب ومعرّف السيرفر للتأكد من الباقة الصحيحة. أدخل معرّف اللاعب ومعرّف السيرفر كما يظهران في اللعبة تمامًا. تُسلَّم الجواهر إلى الحساب الذي تحدده، وليست كودًا تستبدله بنفسك.',
  search_aliases = search_aliases || array['mobile legends special', 'mlbb special', 'موبايل ليجند باقة خاصه', 'موبايل ليجند باقة خاصة', 'موبايل ليجند سبيشال'],
  metadata = metadata || jsonb_build_object('region', jsonb_build_object(
    'excluded', jsonb_build_array('ID'),
    'note_en', 'Not available for Indonesia users, Indonesian users can use mlbb_global/mlbb_indo',
    'note_ar', 'غير متاحة لمستخدمي إندونيسيا؛ على مستخدمي إندونيسيا استخدام mlbb_global أو mlbb_indo.',
    'region_status', 'not_recorded',
    'source', 'provider_game_mappings.metadata.notes'
  ))
where slug = 'mlbb-special';

update public.products set
  description_en = 'Mobile Legends: Bang Bang diamond top-up for the supplier''s Exclusive regional package, delivered straight to your game account. This is a different regional package from the global Mobile Legends package and from Mobile Legends Special — the three are not interchangeable, and a top-up sent to the wrong one cannot be moved or refunded. The supplier has not published which region this package serves — it states only that Indonesia, Singapore, Malaysia, Russia and Vietnam are excluded. If you are unsure which package your account accepts, ask our support team before paying and include your player ID and server ID so the correct package can be confirmed. Enter your player ID and server ID exactly as they appear in the game. Diamond credit is delivered to the account you name, not a code you redeem yourself.',
  description_ar = 'شحن جواهر Mobile Legends: Bang Bang عبر باقة Exclusive الإقليمية لدى المورّد، ويُسلَّم مباشرة إلى حسابك في اللعبة. هذه باقة إقليمية مختلفة عن باقة Mobile Legends العالمية وعن باقة Mobile Legends Special، والباقات الثلاث غير متبادلة، والشحن المرسل إلى باقة غير مطابقة لا يمكن نقله ولا استرجاعه. لم ينشر المورّد المنطقة التي تخدمها هذه الباقة؛ فهو يذكر فقط أن إندونيسيا وسنغافورة وماليزيا وروسيا وفيتنام مستثناة. إن لم تكن متأكدًا من الباقة التي يقبلها حسابك فاسأل فريق الدعم قبل الدفع واذكر معرّف اللاعب ومعرّف السيرفر للتأكد من الباقة الصحيحة. أدخل معرّف اللاعب ومعرّف السيرفر كما يظهران في اللعبة تمامًا. تُسلَّم الجواهر إلى الحساب الذي تحدده، وليست كودًا تستبدله بنفسك.',
  search_aliases = search_aliases || array['mobile legends exclusive', 'mlbb exclusive', 'موبايل ليجند باقة حصريه', 'موبايل ليجند باقة حصرية', 'موبايل ليجند اكسلوسيف'],
  metadata = metadata || jsonb_build_object('region', jsonb_build_object(
    'excluded', jsonb_build_array('ID', 'SG', 'MY', 'RU', 'VN'),
    'note_en', 'Not available for ID/SG/MY/RU/VN',
    'note_ar', 'غير متاحة في إندونيسيا وسنغافورة وماليزيا وروسيا وفيتنام.',
    'region_status', 'not_recorded',
    'source', 'provider_game_mappings.metadata.notes'
  ))
where slug = 'mlbb-exclusive';

-- 2. Free Fire, three separate regional packages. The supplier names the region
--    for the Middle East and Europe packages; the global package carries
--    exclusions instead.
update public.products set
  metadata = metadata || jsonb_build_object('region', jsonb_build_object(
    'label_en', 'Middle East',
    'label_ar', 'الشرق الأوسط',
    'excluded', jsonb_build_array(),
    'note_en', 'Available for Middle East Users',
    'note_ar', 'متاحة لمستخدمي الشرق الأوسط.',
    'region_status', 'published',
    'source', 'provider_game_mappings.metadata.notes'
  )),
  search_aliases = search_aliases || array['freefire middle east', 'free fire middle east', 'فري فاير الشرق الاوسط', 'فري فاير الشرق الأوسط', 'فري فاير ميدل ايست']
where slug = 'freefire-me';

update public.products set
  metadata = metadata || jsonb_build_object('region', jsonb_build_object(
    'label_en', 'Europe',
    'label_ar', 'أوروبا',
    'excluded', jsonb_build_array(),
    'note_en', 'Available for Europe Users',
    'note_ar', 'متاحة لمستخدمي أوروبا.',
    'region_status', 'published',
    'source', 'provider_game_mappings.metadata.notes'
  )),
  search_aliases = search_aliases || array['freefire europe', 'free fire europe', 'فري فاير اوروبا', 'فري فاير أوروبا']
where slug = 'freefire-eu';

update public.products set
  metadata = metadata || jsonb_build_object('region', jsonb_build_object(
    'label_en', 'Global (supplier excludes Vietnam, Thailand, Indonesia and the Middle East)',
    'label_ar', 'عالمية (يستثني المورّد فيتنام وتايلاند وإندونيسيا والشرق الأوسط)',
    'excluded', jsonb_build_array('VN', 'TH', 'ID', 'ME'),
    'note_en', 'Not available for Vietnam, Thailand and Indonesia users, not available for Middle East Users',
    'note_ar', 'غير متاحة لمستخدمي فيتنام وتايلاند وإندونيسيا، وغير متاحة لمستخدمي الشرق الأوسط.',
    'region_status', 'published',
    'source', 'provider_game_mappings.metadata.notes'
  )),
  search_aliases = search_aliases || array['freefire global', 'free fire global', 'فري فاير العالميه', 'فري فاير العالمية']
where slug = 'freefire-global';

-- 3. Arena Breakout: the supplier marks both packages as available everywhere,
--    so the honest distinction is the title, not a region. Recording that as an
--    explicit "no regional restriction" fact stops a later reader from guessing
--    one, and the aliases keep both titles findable.
update public.products set
  metadata = metadata || jsonb_build_object('region', jsonb_build_object(
    'label_en', 'No regional restriction stated by the supplier',
    'label_ar', 'لا يوجد قيد إقليمي معلن من المورّد',
    'excluded', jsonb_build_array(),
    'note_en', 'Available for all users',
    'note_ar', 'متاحة لجميع المستخدمين.',
    'region_status', 'published',
    'source', 'provider_game_mappings.metadata.notes'
  )),
  search_aliases = search_aliases || array['arena breakout global']
where slug = 'arena-breakout';

update public.products set
  metadata = metadata || jsonb_build_object('region', jsonb_build_object(
    'label_en', 'No regional restriction stated by the supplier',
    'label_ar', 'لا يوجد قيد إقليمي معلن من المورّد',
    'excluded', jsonb_build_array(),
    'note_en', 'Available for all users',
    'note_ar', 'متاحة لجميع المستخدمين.',
    'region_status', 'published',
    'source', 'provider_game_mappings.metadata.notes'
  )),
  search_aliases = search_aliases || array['arena breakout infinite', 'arena breakout انفينيت', 'ارينا بريك اوت انفينيت']
where slug = 'arena-breakout-infinite';

-- 4. Turkey-locked cards. The region is already in the title; these aliases are
--    what an Arabic shopper types when they mean the Turkish card specifically,
--    and the copy states plainly that the code is region-locked. `coalesce`
--    keeps any description an administrator already wrote.
update public.products set
  description_ar = coalesce(nullif(description_ar, ''), 'بطاقة PlayStation Network (PSN) بفئة بالليرة التركية. هذه البطاقة مقيّدة بمنطقة تركيا: لا تعمل إلا على حساب PSN مسجَّل في تركيا، ولا يمكن استخدامها على حساب منطقة أخرى. تأكد من منطقة حسابك قبل الشراء، فالبطاقات المقيّدة إقليميًا لا تُستبدل ولا تُسترجع بعد التسليم. يُسلَّم الكود رقميًا بعد الدفع ويظهر في صفحة الطلب.'),
  description_en = coalesce(nullif(description_en, ''), 'PlayStation Network (PSN) card denominated in Turkish lira. The card is region-locked to Turkey: it only works on a PSN account registered in Turkey and cannot be used on an account from another region. Check your account region before paying — region-locked codes are not exchanged or refunded once delivered. The code is delivered digitally after payment and appears on your order page.'),
  search_aliases = search_aliases || array['psn turkey card', 'playstation turkey', 'بطاقة بلايستيشن تركيا', 'بلايستيشن تركيا', 'psn تركيا']
where slug = 'psn-turkey';

update public.products set
  description_ar = coalesce(nullif(description_ar, ''), 'بطاقة هدية Xbox بفئة بالليرة التركية. هذه البطاقة مقيّدة بمنطقة تركيا: لا يمكن استبدالها إلا على حساب Microsoft/Xbox مسجَّل في تركيا، ولا تعمل على حساب منطقة أخرى. تأكد من منطقة حسابك قبل الشراء، فالبطاقات المقيّدة إقليميًا لا تُستبدل ولا تُسترجع بعد التسليم. يُسلَّم الكود رقميًا بعد الدفع ويظهر في صفحة الطلب.'),
  description_en = coalesce(nullif(description_en, ''), 'Xbox gift card denominated in Turkish lira. The card is region-locked to Turkey: it can only be redeemed on a Microsoft/Xbox account registered in Turkey and will not work on an account from another region. Check your account region before paying — region-locked codes are not exchanged or refunded once delivered. The code is delivered digitally after payment and appears on your order page.'),
  search_aliases = search_aliases || array['xbox turkey', 'xbox gift card turkey', 'بطاقة اكس بوكس تركيا', 'اكس بوكس تركيا']
where slug = 'xbox-gift-card-turkey';

update public.products set
  description_ar = coalesce(nullif(description_ar, ''), 'شحن Riot Cash بفئة بالليرة التركية لحسابات Valorant في تركيا. هذا المنتج مقيّد بمنطقة تركيا: لا يعمل إلا على حساب Riot مسجَّل في تركيا، ولا يمكن استخدامه على حساب منطقة أخرى. تأكد من منطقة حسابك قبل الشراء، فالرصيد المرسل إلى منطقة غير مطابقة لا يمكن نقله ولا استرجاعه. أدخل معرّف حساب Riot كما يظهر في اللعبة.'),
  description_en = coalesce(nullif(description_en, ''), 'Riot Cash top-up denominated in Turkish lira for Valorant accounts in Turkey. The product is region-locked to Turkey: it only works on a Riot account registered in Turkey and cannot be used on an account from another region. Check your account region before paying — credit sent to a mismatched region cannot be moved or refunded. Enter your Riot account ID exactly as it appears in the game.'),
  search_aliases = search_aliases || array['valorant turkey', 'riot cash turkey', 'فالورانت تركيا', 'ريوت كاش تركيا']
where slug = 'valorant-riot-cash-turkey';

-- 5. Every remaining active game/currency product gets an explicit
--    "region not recorded" marker, so the page says the region is unverified
--    instead of leaving the shopper to guess, and a later pass can query the
--    products that still need a real region. Non-regional products (software,
--    AI subscriptions, gift cards with no region split) are left alone: a region
--    field on those would be noise, not a fact.
update public.products set
  metadata = metadata || jsonb_build_object('region', jsonb_build_object(
    'region_status', 'not_recorded',
    'source', 'no provider region note recorded'
  ))
where is_active = true
  and product_kind in ('game', 'virtual_currency')
  and (metadata -> 'region') is null;

commit;

-- ---------------------------------------------------------------------------
-- END 20261010050000_region_variant_disambiguation.sql
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- BEGIN 20261010090000_customer_telegram_channel.sql
-- ---------------------------------------------------------------------------

-- Customer Telegram channel.
--
-- The owner's bot already had a queue (`telegram_alerts`) and a drain
-- (`deliverTelegramAlerts` in `storefront/workers/telegram-bot.ts`). What it
-- could not do was reach the registered customers: `broadcast-alert-panel.tsx`
-- only pushed a live toast to whoever was *currently* on the site. This
-- migration adds the durable, addressable side of the same channel:
--
--   * `telegram_broadcasts` — an owner-composed message, bilingual, aimed at a
--     named audience, with a delivery record attached to it.
--   * `telegram_broadcast_recipients` — that record, one row per resolved
--     customer, so "who got it" and "who failed" are a query and not a guess.
--   * `telegram_chat_links.delivery_status` — the link state. A customer who
--     blocked the bot or never linked is recorded as such instead of being
--     retried forever on every five-minute drain.
--   * `offer_alert_state` / `offer_alert_queue` — the honest restock and
--     price-drop detector. The detector compares today's price and
--     availability against what it last recorded and enqueues nothing when
--     nothing changed, so the store never invents a "price drop".
--
-- Owner alerts are untouched: they still render from `ownerAlertText` and
-- still go to the owner's chat when `user_id` is null. Customer sends are the
-- `user_id` branch, which already existed and now also carries this channel.
--
-- Two new conversation states, both older than this feature: `pending`',
-- `skipped'. `skipped` means "we deliberately did not send this" (no linked
-- chat, blocked, or the customer opted out) as opposed to `failed`, which is a
-- real delivery attempt that did not land.

-- ─── Link state ────────────────────────────────────────────────────────────

alter table public.telegram_chat_links
  add column if not exists delivery_status text not null default 'unknown';

alter table public.telegram_chat_links
  add column if not exists last_delivery_at timestamptz;

alter table public.telegram_chat_links
  add column if not exists last_delivery_error text;

alter table public.telegram_chat_links
  drop constraint if exists telegram_chat_links_delivery_status_check;

alter table public.telegram_chat_links
  add constraint telegram_chat_links_delivery_status_check
  check (delivery_status in ('unknown', 'ok', 'blocked'));

comment on column public.telegram_chat_links.delivery_status is
  'unknown until first send; blocked once Telegram reports the customer stopped the bot. Blocked chats are never retried.';

-- ─── Broadcasts ────────────────────────────────────────────────────────────

create table if not exists public.telegram_broadcasts (
  id uuid primary key default gen_random_uuid(),
  title_ar text not null,
  title_en text not null,
  body_ar text not null,
  body_en text not null,
  -- Where a customer tap leads. Optional: a broadcast can be pure copy.
  href text,
  audience text not null default 'all'
    check (audience in ('all', 'buyers', 'non_buyers')),
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'sending', 'sent', 'cancelled')),
  -- The Telegram-only coupon campaign, when one is attached.
  coupon_code text,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  queued_at timestamptz,
  finished_at timestamptz
);

create index if not exists telegram_broadcasts_created_idx
  on public.telegram_broadcasts (created_at desc);

drop trigger if exists telegram_broadcasts_set_updated_at on public.telegram_broadcasts;
create trigger telegram_broadcasts_set_updated_at
before update on public.telegram_broadcasts
for each row
execute function public.set_updated_at();

create table if not exists public.telegram_broadcast_recipients (
  id bigint generated always as identity primary key,
  broadcast_id uuid not null references public.telegram_broadcasts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  chat_id bigint,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  error text,
  attempts integer not null default 0 check (attempts >= 0),
  sent_at timestamptz,
  last_attempted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  -- One row per customer per broadcast: re-queueing is a no-op, never a
  -- second message to the same person.
  unique (broadcast_id, user_id)
);

create index if not exists telegram_broadcast_recipients_pending_idx
  on public.telegram_broadcast_recipients (broadcast_id, created_at)
  where status in ('pending', 'sending');

alter table public.telegram_broadcasts enable row level security;
alter table public.telegram_broadcast_recipients enable row level security;

-- The owner composes and reads them through the dashboard's service client;
-- no customer session has any business reading a marketing send list.
revoke all on public.telegram_broadcasts from anon, authenticated;
revoke all on public.telegram_broadcast_recipients from anon, authenticated;
grant select, insert, update, delete on public.telegram_broadcasts to service_role;
grant select, insert, update, delete on public.telegram_broadcast_recipients to service_role;

drop policy if exists telegram_broadcasts_admin_all on public.telegram_broadcasts;
create policy telegram_broadcasts_admin_all
on public.telegram_broadcasts
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists telegram_broadcast_recipients_admin_all on public.telegram_broadcast_recipients;
create policy telegram_broadcast_recipients_admin_all
on public.telegram_broadcast_recipients
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

grant select, insert, update, delete on public.telegram_broadcasts to authenticated;
grant select on public.telegram_broadcast_recipients to authenticated;
-- The queue learns which broadcast a customer alert belongs to, so the drain
-- can write the per-recipient record in the same pass that sends the message.
alter table public.telegram_alerts
  add column if not exists broadcast_id uuid references public.telegram_broadcasts (id) on delete set null;

/**
 * When a delivered order's items were written into `customer_offer_interests`.
 *
 * The stamp is on the order rather than derived from the interests table
 * because the answer the sweep needs is "which orders have I already read?",
 * and asking that of the interests would re-read every old order on every
 * cron tick.
 */
alter table public.orders
  add column if not exists interests_recorded_at timestamptz;

-- ─── Audience resolution ───────────────────────────────────────────────────

/**
 * Customers who bought something, at least once, for real.
 *
 * "Paid" rather than "completed": a refunded or failed order is not a
 * purchase, and `payment_status = 'refunded'` is how the store records money
 * going back. This is the buyers/non-buyers split the owner picks from.
 */
create or replace function public.customer_purchase_state()
returns table (user_id uuid, has_purchase boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    exists (
      select 1
      from public.orders o
      where o.user_id = p.id
        and o.payment_status = 'paid'
    )
  from public.profiles p
  where p.role = 'customer'
    and p.is_active = true;
$$;

revoke all on function public.customer_purchase_state() from public, anon, authenticated;
grant execute on function public.customer_purchase_state() to service_role;

/**
 * The audience, resolved as a set — never by walking customers one by one.
 */
create or replace function public.broadcast_recipients(p_audience text)
returns table (user_id uuid, chat_id bigint, language_code text, delivery_status text)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.user_id,
    l.chat_id,
    l.language_code,
    l.delivery_status
  from public.telegram_chat_links l
  join public.profiles p on p.id = l.user_id
  join public.customer_purchase_state() s on s.user_id = l.user_id
  where p.role = 'customer'
    and p.is_active = true
    and l.delivery_status <> 'blocked'
    and (
      p_audience = 'all'
      or (p_audience = 'buyers' and s.has_purchase)
      or (p_audience = 'non_buyers' and not s.has_purchase)
    );
$$;

revoke all on function public.broadcast_recipients(text) from public, anon, authenticated;
grant execute on function public.broadcast_recipients(text) to service_role;

/**
 * Snapshot the audience and queue the send.
 *
 * Snapshotted rather than re-resolved per batch: the delivery record has to
 * describe the people the owner aimed at, and a customer who links a chat
 * halfway through a send must not be pulled into it.
 */
create or replace function public.queue_telegram_broadcast(p_broadcast_id uuid)
returns table (queued integer, blocked integer, unlinked integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_broadcast public.telegram_broadcasts;
  v_queued integer := 0;
  v_blocked integer := 0;
  v_unlinked integer := 0;
begin
  select * into v_broadcast
  from public.telegram_broadcasts
  where id = p_broadcast_id
  for update;

  if v_broadcast.id is null then
    raise exception 'Broadcast not found' using errcode = 'P0001';
  end if;

  if v_broadcast.status not in ('draft', 'cancelled') then
    raise exception 'Broadcast already queued' using errcode = 'P0001';
  end if;

  insert into public.telegram_broadcast_recipients (broadcast_id, user_id, chat_id, status)
  select p_broadcast_id, r.user_id, r.chat_id, 'pending'
  from public.broadcast_recipients(v_broadcast.audience) r
  on conflict (broadcast_id, user_id) do nothing;

  select
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'skipped' and error = 'blocked'),
    count(*) filter (where status = 'skipped' and error = 'unlinked')
  into v_queued, v_blocked, v_unlinked
  from public.telegram_broadcast_recipients
  where broadcast_id = p_broadcast_id;

  update public.telegram_broadcasts
  set status = 'queued',
      queued_at = timezone('utc', now()),
      recipient_count = v_queued + v_blocked + v_unlinked,
      sent_count = 0,
      failed_count = 0,
      skipped_count = v_blocked + v_unlinked
  where id = p_broadcast_id;

  return query select v_queued, v_blocked, v_unlinked;
end;
$$;

revoke all on function public.queue_telegram_broadcast(uuid) from public, anon, authenticated;
grant execute on function public.queue_telegram_broadcast(uuid) to service_role;

-- ─── Who is watching what ──────────────────────────────────────────────────

-- A customer who bought an offer is interested in it by definition; a signed-in
-- customer can also ask to be told about one they have not bought. Both live
-- here, because "bought it before" and "asked to be told" are the same
-- audience for a restock or a price drop.
create table if not exists public.customer_offer_interests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  offer_id uuid not null references public.offers (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  source text not null default 'manual' check (source in ('purchase', 'manual')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, offer_id)
);

create index if not exists customer_offer_interests_user_idx
  on public.customer_offer_interests (user_id, created_at desc);
create index if not exists customer_offer_interests_offer_idx
  on public.customer_offer_interests (offer_id);

alter table public.customer_offer_interests enable row level security;

revoke all on public.customer_offer_interests from anon, authenticated;
grant select, insert, update, delete on public.customer_offer_interests to service_role;
grant select on public.customer_offer_interests to authenticated;

drop policy if exists customer_offer_interests_select_own on public.customer_offer_interests;
create policy customer_offer_interests_select_own
on public.customer_offer_interests
for select
to authenticated
using (user_id = auth.uid());

-- ─── Restock and price-drop detection ──────────────────────────────────────

create table if not exists public.offer_alert_state (
  offer_id uuid primary key references public.offers (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  last_price numeric(12, 2) not null,
  last_available boolean not null default false,
  -- Whether anyone is actually watching this offer. An offer nobody watches
  -- still gets its state tracked, but nothing is ever queued for it.
  interest_count integer not null default 0 check (interest_count >= 0),
  last_alerted_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.offer_alert_state is
  'What the store last told customers about an offer: its price and whether it was buyable. Alerts are only queued when one of the two actually changed.';

create index if not exists offer_alert_state_interest_idx
  on public.offer_alert_state (interest_count)
  where interest_count > 0;

create or replace function public.offer_alert_state_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.offer_alert_state (offer_id, product_id, last_price, last_available)
  values (new.id, new.product_id, new.price, new.is_active)
  on conflict (offer_id) do update
    set product_id = excluded.product_id,
        updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists offers_track_alert_state on public.offers;
create trigger offers_track_alert_state
after insert or update of price, is_active, product_id on public.offers
for each row
execute function public.offer_alert_state_touch();

-- Baseline every existing offer at migration time. Without this the first
-- detector run would read an empty state table and call every offer a change.
insert into public.offer_alert_state (offer_id, product_id, last_price, last_available)
select o.id, o.product_id, o.price, o.is_active
from public.offers o
on conflict (offer_id) do nothing;

create table if not exists public.offer_alert_queue (
  id bigint generated always as identity primary key,
  offer_id uuid not null references public.offers (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  -- `restock` = it is buyable now and was not; `price_drop` = the price fell.
  kind text not null check (kind in ('restock', 'price_drop')),
  old_price numeric(12, 2),
  new_price numeric(12, 2),
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped')),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz
);

create index if not exists offer_alert_queue_pending_idx
  on public.offer_alert_queue (created_at)
  where status = 'pending';

alter table public.offer_alert_state enable row level security;
alter table public.offer_alert_queue enable row level security;

revoke all on public.offer_alert_state, public.offer_alert_queue from anon, authenticated;
grant select, insert, update, delete on public.offer_alert_state, public.offer_alert_queue to service_role;

/**
 * Compare today's catalogue with what customers were last told, and queue the
 * differences.
 *
 * The guarantee this function exists to keep: **no alert without a change.**
 * A row with an unchanged price and unchanged availability is skipped, and an
 * offer nobody is watching is skipped before that. The baseline is written
 * after the comparison, so the next run compares against this one.
 */
create or replace function public.enqueue_offer_change_alerts(p_limit integer default 25)
returns table (queued integer, restocks integer, price_drops integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 25), 1);
  v_queued integer := 0;
  v_restocks integer := 0;
  v_drops integer := 0;
begin
  create temporary table _growth_offer_changes (
    offer_id uuid,
    product_id uuid,
    kind text,
    last_price numeric(12, 2),
    price numeric(12, 2)
  ) on commit drop;

  insert into _growth_offer_changes (offer_id, product_id, kind, last_price, price)
  select
    s.offer_id,
    s.product_id,
    case when o.is_active and not s.last_available then 'restock' else 'price_drop' end,
    s.last_price,
    o.price
  from public.offer_alert_state s
  join public.offers o on o.id = s.offer_id
  where s.interest_count > 0
    and (
      (o.is_active and not s.last_available)
      or o.price < s.last_price
    )
  order by s.offer_id
  limit v_limit;

  select
    count(*) filter (where kind = 'restock'),
    count(*) filter (where kind = 'price_drop')
  into v_restocks, v_drops
  from _growth_offer_changes;

  insert into public.offer_alert_queue (offer_id, product_id, kind, old_price, new_price)
  select c.offer_id, c.product_id, c.kind, c.last_price, c.price
  from _growth_offer_changes c;

  get diagnostics v_queued = row_count;

  update public.offer_alert_state s
  set last_price = o.price,
      last_available = o.is_active,
      updated_at = timezone('utc', now())
  from public.offers o
  where o.id = s.offer_id
    and (s.last_price <> o.price or s.last_available <> o.is_active);

  return query select v_queued, v_restocks, v_drops;
end;
$$;

revoke all on function public.enqueue_offer_change_alerts(integer) from public, anon, authenticated;
grant execute on function public.enqueue_offer_change_alerts(integer) to service_role;

/**
 * Record who is watching an offer, once per customer per offer.
 *
 * `interest_count` on the state row is the cheap gate the detector reads, so
 * the counter moves with the subscriptions rather than being recounted.
 */
create or replace function public.record_offer_interest(
  p_offer_id uuid,
  p_user_id uuid,
  p_source text default 'manual'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted boolean := false;
  v_offer public.offers;
begin
  if p_user_id is null then
    raise exception 'A customer is required' using errcode = 'P0001';
  end if;

  select * into v_offer from public.offers where id = p_offer_id;

  if v_offer.id is null then
    raise exception 'Offer unavailable' using errcode = 'P0001';
  end if;

  insert into public.customer_offer_interests (user_id, offer_id, product_id, source)
  values (p_user_id, p_offer_id, v_offer.product_id, coalesce(p_source, 'manual'))
  on conflict (user_id, offer_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted then
    -- A plain `on conflict do update` cannot reference the target table's own
    -- column safely here, so the row is matched first and only inserted when it
    -- is genuinely absent.
    update public.offer_alert_state
    set interest_count = interest_count + 1,
        updated_at = timezone('utc', now())
    where offer_id = p_offer_id;

    if not found then
      insert into public.offer_alert_state (offer_id, product_id, last_price, last_available, interest_count)
      values (p_offer_id, v_offer.product_id, v_offer.price, v_offer.is_active, 1)
      on conflict (offer_id) do update
        set interest_count = public.offer_alert_state.interest_count + 1,
            updated_at = timezone('utc', now());
    end if;
  end if;

  return v_inserted;
end;
$$;

revoke all on function public.record_offer_interest(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_offer_interest(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- END 20261010090000_customer_telegram_channel.sql
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- BEGIN 20261010100000_coupons.sql
-- ---------------------------------------------------------------------------

-- Coupons and discount codes.
--
-- A coupon is money, so every rule about it lives in the database and the
-- browser only ever sends a code. The client may preview a discount; the
-- discount that is charged is recomputed inside the order transaction, from
-- the live offer price, under a row lock on the coupon. A tampered client
-- value is not rejected — it is ignored, which is the same thing but cannot be
-- gamed by retrying.
--
-- The margin guard is the second rule, and it is not advisory. This store runs
-- at a 13% gross margin, so a coupon that would take an order below the
-- supplier's cost is refused outright rather than quietly shrunk: an owner who
-- typed 90% off meant something, and silently selling at a discount they did
-- not choose is worse than saying no. `admin_coupon_margin_limit` exposes the
-- ceiling so the dashboard can show the same number the database enforces.
--
-- `orders.discount` already existed and was always written as 0. It is now the
-- real discount, and it is what the invoice reads.

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  type text not null check (type in ('percent', 'fixed')),
  value numeric(12, 2) not null check (value > 0),
  min_subtotal numeric(12, 2) not null default 0 check (min_subtotal >= 0),
  max_discount numeric(12, 2) check (max_discount is null or max_discount > 0),
  currency text not null default 'USD' check (currency in ('USD', 'SYP', 'EUR')),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  per_customer_limit integer not null default 1 check (per_customer_limit > 0),
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean not null default true,
  -- Empty means "the whole catalogue". Category scope outranks product scope
  -- when both are set, so the narrower list wins and nothing is charged at a
  -- discount the owner did not mean.
  product_ids uuid[] not null default '{}'::uuid[],
  category_ids uuid[] not null default '{}'::uuid[],
  offer_ids uuid[] not null default '{}'::uuid[],
  admin_note text,
  times_used integer not null default 0 check (times_used >= 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint coupons_percent_value_check check (type <> 'percent' or value <= 100),
  constraint coupons_window_check check (valid_until is null or valid_from is null or valid_until > valid_from)
);

-- Case-insensitive uniqueness, enforced by the database rather than by a
-- service that lowercases on the way in: two owners editing at once can still
-- only create one `GH10`.
create unique index if not exists coupons_code_key
  on public.coupons (upper(code));

create index if not exists coupons_active_idx
  on public.coupons (is_active, valid_until);

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete restrict,
  code text not null,
  user_id uuid not null references public.profiles (id) on delete restrict,
  order_id uuid not null references public.orders (id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'USD',
  created_at timestamptz not null default timezone('utc', now()),
  -- One coupon per order, which is what makes "claim atomically" checkable:
  -- a duplicate insert is the race loser's error, not a second redemption.
  unique (coupon_id, order_id)
);

create index if not exists coupon_redemptions_user_idx
  on public.coupon_redemptions (user_id, created_at desc);
create index if not exists coupon_redemptions_coupon_idx
  on public.coupon_redemptions (coupon_id, created_at desc);

drop trigger if exists coupons_set_updated_at on public.coupons;
create trigger coupons_set_updated_at
before update on public.coupons
for each row
execute function public.set_updated_at();

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;

-- A customer may read an active coupon's code (it is public marketing copy and
-- the checkout form shows it back), never write one. Redemptions are the
-- store's record: no customer session writes or reads another's.
revoke all on public.coupons from anon;
revoke all on public.coupon_redemptions from anon, authenticated;

grant select on public.coupons to authenticated;
grant select, insert, update, delete on public.coupons to service_role;
grant select, insert on public.coupon_redemptions to service_role;

drop policy if exists coupons_select_active on public.coupons;
create policy coupons_select_active
on public.coupons
for select
to authenticated
using (
  is_active
  and (valid_from is null or valid_from <= timezone('utc', now()))
  and (valid_until is null or valid_until > timezone('utc', now()))
);

drop policy if exists coupons_admin_all on public.coupons;
create policy coupons_admin_all
on public.coupons
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists coupon_redemptions_admin_select on public.coupon_redemptions;
create policy coupon_redemptions_admin_select
on public.coupon_redemptions
for select
to authenticated
using (public.is_admin(auth.uid()));

grant select on public.coupon_redemptions to authenticated;

-- ─── The margin ceiling ────────────────────────────────────────────────────

/**
 * The most a coupon may ever take off one unit of this offer.
 *
 * The store buys the unit and sells the unit, so "below cost" is a per-unit
 * comparison and this is it: the discount can consume the markup and nothing
 * more. An unmapped offer has an unknown cost, and an unknown cost is not a
 * licence to discount — it returns 0, which refuses the coupon. The one
 * exception is an offer whose cost is genuinely recorded as zero (a stored or
 * manually delivered item already paid for), which can be discounted to zero.
 */
create or replace function public.coupon_margin_limit(p_offer_id uuid, p_quantity integer default 1)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_price numeric(12, 2);
  v_cost numeric(12, 4);
  v_has_cost boolean := false;
  v_free boolean := false;
begin
  select o.price, (o.delivery_kind = 'stored')
  into v_price, v_free
  from public.offers o
  where o.id = p_offer_id;

  if v_price is null then
    return 0;
  end if;

  if v_free then
    return v_price * greatest(coalesce(p_quantity, 1), 1);
  end if;

  select pm.supplier_cost_usd, true
  into v_cost, v_has_cost
  from public.provider_offer_mappings pm
  where pm.offer_id = p_offer_id
    and pm.supplier_cost_usd is not null
  order by pm.created_at, pm.id
  limit 1;

  if not coalesce(v_has_cost, false) then
    return 0;
  end if;

  return round(greatest(v_price - v_cost, 0) * greatest(coalesce(p_quantity, 1), 1), 2);
end;
$$;

revoke all on function public.coupon_margin_limit(uuid, integer) from public, anon;
grant execute on function public.coupon_margin_limit(uuid, integer) to authenticated, service_role;

-- ─── Validation, inside the transaction ────────────────────────────────────

/**
 * Resolve a code against this customer and this cart, and return the discount.
 *
 * Internal by construction — `authenticated` and `service_role` are revoked —
 * because it takes the customer id as an argument, and a caller who can pass
 * somebody else's id could spend their per-customer allowance. The order RPCs
 * below call it with `auth.uid()` or with a service-verified user id.
 *
 * `p_at` is the transaction clock, passed in rather than read, so the validity
 * window, the usage count and the redemption row all agree on one instant.
 */
create or replace function public.validate_coupon_for_order(
  p_code text,
  p_user_id uuid,
  p_offer_id uuid,
  p_quantity integer,
  p_subtotal numeric,
  p_at timestamptz
)
returns table (coupon_id uuid, code text, discount numeric)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_coupon public.coupons;
  v_uses integer := 0;
  v_discount numeric(12, 2) := 0;
  v_ceiling numeric(12, 2);
  v_scoped boolean := false;
  v_product uuid;
  v_category uuid;
begin
  if p_code is null or btrim(p_code) = '' then
    raise exception 'Coupon code required' using errcode = 'P0001';
  end if;

  -- The row lock is the whole concurrency story: two orders racing for the
  -- last redemption of a limited code queue here, and the second one sees the
  -- incremented `times_used` rather than the value it read a moment ago.
  select * into v_coupon
  from public.coupons
  where upper(code) = upper(btrim(p_code))
  for update;

  if v_coupon.id is null then
    raise exception 'Coupon not found' using errcode = 'P0001';
  end if;

  if not v_coupon.is_active then
    raise exception 'Coupon is not active' using errcode = 'P0001';
  end if;

  if v_coupon.valid_from is not null and p_at < v_coupon.valid_from then
    raise exception 'Coupon is not valid yet' using errcode = 'P0001';
  end if;

  if v_coupon.valid_until is not null and p_at >= v_coupon.valid_until then
    raise exception 'Coupon has expired' using errcode = 'P0001';
  end if;

  if v_coupon.usage_limit is not null and v_coupon.times_used >= v_coupon.usage_limit then
    raise exception 'Coupon usage limit reached' using errcode = 'P0001';
  end if;

  select count(*) into v_uses
  from public.coupon_redemptions r
  where r.coupon_id = v_coupon.id
    and r.user_id = p_user_id;

  if v_uses >= v_coupon.per_customer_limit then
    raise exception 'Coupon already used' using errcode = 'P0001';
  end if;

  if coalesce(p_subtotal, 0) < v_coupon.min_subtotal then
    raise exception 'Order subtotal is below the coupon minimum' using errcode = 'P0001';
  end if;

  -- Scope: category, then product, then the single offer.
  select p.category_id, o.product_id
  into v_category, v_product
  from public.offers o
  join public.products p on p.id = o.product_id
  where o.id = p_offer_id;

  if cardinality(v_coupon.category_ids) > 0 then
    v_scoped := true;

    if v_category is null or not (v_category = any (v_coupon.category_ids)) then
      raise exception 'Coupon does not apply to this product' using errcode = 'P0001';
    end if;
  end if;

  if cardinality(v_coupon.product_ids) > 0 then
    v_scoped := true;

    if v_product is null or not (v_product = any (v_coupon.product_ids)) then
      raise exception 'Coupon does not apply to this product' using errcode = 'P0001';
    end if;
  end if;

  if cardinality(v_coupon.offer_ids) > 0 then
    v_scoped := true;

    if not (p_offer_id = any (v_coupon.offer_ids)) then
      raise exception 'Coupon does not apply to this offer' using errcode = 'P0001';
    end if;
  end if;

  -- Unscoped coupons apply to the whole catalogue; a scoped one that survived
  -- the checks above is also applicable, so the flag is informational.
  perform v_scoped;

  v_discount := case
    when v_coupon.type = 'percent' then round(p_subtotal * v_coupon.value / 100, 2)
    else least(v_coupon.value, p_subtotal)
  end;

  if v_coupon.max_discount is not null then
    v_discount := least(v_discount, v_coupon.max_discount);
  end if;

  v_discount := greatest(least(v_discount, p_subtotal), 0);

  if v_discount <= 0 then
    raise exception 'Coupon gives no discount on this order' using errcode = 'P0001';
  end if;

  -- The guard, enforced here rather than in the form.
  v_ceiling := public.coupon_margin_limit(p_offer_id, p_quantity);

  if v_discount > v_ceiling then
    raise exception 'Coupon would sell below supplier cost' using errcode = 'P0001';
  end if;

  return query select v_coupon.id, v_coupon.code, v_discount;
end;
$$;

-- Revoked from every API role because it takes the customer id as an argument:
-- a caller who could pass somebody else's id could spend their allowance. The
-- order RPCs below call it inside their own transaction, and a service-role
-- test harness may call it directly with the service key.
revoke all on function public.validate_coupon_for_order(text, uuid, uuid, integer, numeric, timestamptz)
  from public, anon, authenticated;
grant execute on function public.validate_coupon_for_order(text, uuid, uuid, integer, numeric, timestamptz)
  to service_role;

/**
 * Record the redemption and move the counter, once, in the order transaction.
 */
create or replace function public.redeem_coupon(
  p_coupon_id uuid,
  p_code text,
  p_user_id uuid,
  p_order_id uuid,
  p_amount numeric,
  p_currency text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  insert into public.coupon_redemptions (coupon_id, code, user_id, order_id, amount, currency)
  values (p_coupon_id, p_code, p_user_id, p_order_id, p_amount, coalesce(p_currency, 'USD'))
  on conflict (coupon_id, order_id) do nothing;

  update public.coupons
  set times_used = times_used + 1
  where id = p_coupon_id;
end;
$$;

revoke all on function public.redeem_coupon(uuid, text, uuid, uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.redeem_coupon(uuid, text, uuid, uuid, numeric, text)
  to service_role;

-- ─── The order RPCs, with the coupon inside the transaction ────────────────
--
-- The previous five-argument signatures are dropped rather than kept beside
-- these: two candidates differing only in a defaulted argument would make
-- every existing five-argument call ambiguous.

drop function if exists public.place_wallet_order(uuid, integer, jsonb, uuid, text);
drop function if exists public.place_wallet_order_for_user(uuid, uuid, integer, jsonb, uuid, text);
drop function if exists public.place_gift_order(uuid, integer, jsonb, uuid, text);

create or replace function public.place_wallet_order(
  p_offer_id uuid,
  p_quantity integer,
  p_dynamic_fields jsonb,
  p_idempotency_key uuid,
  p_customer_note text default null,
  p_coupon_code text default null
)
returns table (
  order_id uuid,
  order_number text,
  total numeric,
  balance numeric,
  idempotent boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_active boolean;
  v_offer record;
  v_quantity integer := coalesce(p_quantity, 1);
  v_at timestamptz := timezone('utc', now());
  v_unit_price numeric(12, 2);
  v_subtotal numeric(12, 2);
  v_discount numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_coupon_id uuid;
  v_coupon_code text;
  v_wallet_id uuid;
  v_before numeric(12, 2);
  v_after numeric(12, 2);
  v_order_id uuid;
  v_order_number text;
  v_item_id uuid;
  v_transaction_id uuid;
  v_stored jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = 'P0001';
  end if;

  if v_quantity < 1 or v_quantity > 10 then
    raise exception 'Invalid quantity' using errcode = 'P0001';
  end if;

  select p.is_active into v_is_active
  from public.profiles p
  where p.id = v_user_id;

  if v_is_active is not true then
    raise exception 'Account suspended' using errcode = 'P0001';
  end if;

  -- Claim the key first. A duplicate submit loses the race here rather than
  -- after the money has moved.
  begin
    insert into public.idempotency_keys (key, user_id, operation, expires_at)
    values (p_idempotency_key, v_user_id, 'place_order', timezone('utc', now()) + interval '7 days');
  exception
    when unique_violation then
      select ik.response_body into v_stored
      from public.idempotency_keys ik
      where ik.key = p_idempotency_key
        and ik.user_id = v_user_id
        and ik.operation = 'place_order';

      if v_stored is null then
        raise exception 'Order already in progress' using errcode = 'P0001';
      end if;

      return query
      select (v_stored ->> 'order_id')::uuid,
             v_stored ->> 'order_number',
             (v_stored ->> 'total')::numeric,
             (v_stored ->> 'balance')::numeric,
             true;
      return;
  end;

  -- Live price and availability, joined to the product so a hidden product cannot be
  -- bought through a still-active offer.
  select o.id,
         o.product_id,
         o.name_ar,
         o.name_en,
         o.price,
         o.currency,
         o.offer_type
  into v_offer
  from public.offers o
  join public.products p on p.id = o.product_id
  where o.id = p_offer_id
    and o.is_active = true
    and p.is_active = true;

  if v_offer.id is null then
    raise exception 'Offer unavailable' using errcode = 'P0001';
  end if;

  v_unit_price := v_offer.price;
  v_subtotal := round(v_unit_price * v_quantity, 2);

  -- The discount is computed here, from the live price, whatever the browser
  -- claimed. Nothing about the coupon is taken from the request but the code.
  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    select c.coupon_id, c.code, c.discount
    into v_coupon_id, v_coupon_code, v_discount
    from public.validate_coupon_for_order(
      p_coupon_code,
      v_user_id,
      v_offer.id,
      v_quantity,
      v_subtotal,
      v_at
    ) c;
  end if;

  v_discount := coalesce(v_discount, 0);
  v_total := round(v_subtotal - v_discount, 2);

  select w.id, w.balance
  into v_wallet_id, v_before
  from public.wallets w
  where w.user_id = v_user_id
  for update;

  if v_wallet_id is null then
    raise exception 'Wallet not found' using errcode = 'P0001';
  end if;

  if v_before < v_total then
    raise exception 'Insufficient wallet balance' using errcode = 'P0001';
  end if;

  v_after := v_before - v_total;

  insert into public.orders (
    user_id, status, payment_status, payment_method, currency,
    subtotal, discount, total, customer_note,
    metadata
  )
  values (
    v_user_id, 'pending', 'pending', 'wallet', v_offer.currency,
    v_subtotal, v_discount, v_total, nullif(btrim(coalesce(p_customer_note, '')), ''),
    case when v_coupon_id is null then '{}'::jsonb
         else jsonb_build_object('coupon_code', v_coupon_code, 'coupon_discount', v_discount)
    end
  )
  returning id, orders.order_number into v_order_id, v_order_number;

  insert into public.order_items (
    order_id, offer_id, name_ar_snapshot, name_en_snapshot,
    unit_price, quantity, total_price, dynamic_fields, metadata
  )
  values (
    v_order_id,
    v_offer.id,
    v_offer.name_ar,
    v_offer.name_en,
    v_unit_price,
    v_quantity,
    v_subtotal,
    coalesce(p_dynamic_fields, '{}'::jsonb),
    jsonb_build_object('offer_type', v_offer.offer_type, 'product_id', v_offer.product_id)
  )
  returning id into v_item_id;

  -- After the order row exists, so the redemption can point at it.
  if v_coupon_id is not null then
    perform public.redeem_coupon(v_coupon_id, v_coupon_code, v_user_id, v_order_id, v_discount, v_offer.currency);
  end if;

  update public.wallets
  set balance = v_after,
      version = version + 1
  where id = v_wallet_id;

  insert into public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, idempotency_key, payment_method, description
  )
  values (
    v_wallet_id, v_user_id, 'purchase', -v_total, v_before, v_after,
    'order', v_order_id, p_idempotency_key, 'wallet',
    'Order ' || v_order_number
  )
  returning id into v_transaction_id;

  -- Paid and waiting for fulfilment, which runs with service authority.
  update public.orders
  set status = 'paid',
      payment_status = 'paid',
      wallet_transaction_id = v_transaction_id
  where id = v_order_id;

  update public.idempotency_keys
  set response_status = 200,
      response_body = jsonb_build_object(
        'order_id', v_order_id,
        'order_number', v_order_number,
        'total', v_total,
        'balance', v_after,
        'order_item_id', v_item_id
      )
  where key = p_idempotency_key;

  return query select v_order_id, v_order_number, v_total, v_after, false;
end;
$$;

revoke all on function public.place_wallet_order(uuid, integer, jsonb, uuid, text, text) from public, anon;
grant execute on function public.place_wallet_order(uuid, integer, jsonb, uuid, text, text) to authenticated;

create or replace function public.place_wallet_order_for_user(
  p_user_id uuid,
  p_offer_id uuid,
  p_quantity integer,
  p_dynamic_fields jsonb,
  p_idempotency_key uuid,
  p_customer_note text default null,
  p_coupon_code text default null
)
returns table (
  order_id uuid,
  order_number text,
  total numeric,
  balance numeric,
  idempotent boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := p_user_id;
  v_is_active boolean;
  v_offer record;
  v_quantity integer := coalesce(p_quantity, 1);
  v_at timestamptz := timezone('utc', now());
  v_unit_price numeric(12, 2);
  v_subtotal numeric(12, 2);
  v_discount numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_coupon_id uuid;
  v_coupon_code text;
  v_wallet_id uuid;
  v_before numeric(12, 2);
  v_after numeric(12, 2);
  v_order_id uuid;
  v_order_number text;
  v_item_id uuid;
  v_transaction_id uuid;
  v_stored jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = 'P0001';
  end if;

  if v_quantity < 1 or v_quantity > 10 then
    raise exception 'Invalid quantity' using errcode = 'P0001';
  end if;

  select p.is_active into v_is_active
  from public.profiles p
  where p.id = v_user_id;

  if v_is_active is not true then
    raise exception 'Account suspended' using errcode = 'P0001';
  end if;

  begin
    insert into public.idempotency_keys (key, user_id, operation, expires_at)
    values (p_idempotency_key, v_user_id, 'place_order', timezone('utc', now()) + interval '7 days');
  exception
    when unique_violation then
      select ik.response_body into v_stored
      from public.idempotency_keys ik
      where ik.key = p_idempotency_key
        and ik.user_id = v_user_id
        and ik.operation = 'place_order';

      if v_stored is null then
        raise exception 'Order already in progress' using errcode = 'P0001';
      end if;

      return query
      select (v_stored ->> 'order_id')::uuid,
             v_stored ->> 'order_number',
             (v_stored ->> 'total')::numeric,
             (v_stored ->> 'balance')::numeric,
             true;
      return;
  end;

  select o.id,
         o.product_id,
         o.name_ar,
         o.name_en,
         o.price,
         o.currency,
         o.offer_type
  into v_offer
  from public.offers o
  join public.products p on p.id = o.product_id
  where o.id = p_offer_id
    and o.is_active = true
    and p.is_active = true;

  if v_offer.id is null then
    raise exception 'Offer unavailable' using errcode = 'P0001';
  end if;

  v_unit_price := v_offer.price;
  v_subtotal := round(v_unit_price * v_quantity, 2);

  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    select c.coupon_id, c.code, c.discount
    into v_coupon_id, v_coupon_code, v_discount
    from public.validate_coupon_for_order(
      p_coupon_code,
      v_user_id,
      v_offer.id,
      v_quantity,
      v_subtotal,
      v_at
    ) c;
  end if;

  v_discount := coalesce(v_discount, 0);
  v_total := round(v_subtotal - v_discount, 2);

  select w.id, w.balance
  into v_wallet_id, v_before
  from public.wallets w
  where w.user_id = v_user_id
  for update;

  if v_wallet_id is null then
    raise exception 'Wallet not found' using errcode = 'P0001';
  end if;

  if v_before < v_total then
    raise exception 'Insufficient wallet balance' using errcode = 'P0001';
  end if;

  v_after := v_before - v_total;

  insert into public.orders (
    user_id, status, payment_status, payment_method, currency,
    subtotal, discount, total, customer_note, metadata
  )
  values (
    v_user_id, 'pending', 'pending', 'wallet', v_offer.currency,
    v_subtotal, v_discount, v_total, nullif(btrim(coalesce(p_customer_note, '')), ''),
    case when v_coupon_id is null then '{}'::jsonb
         else jsonb_build_object('coupon_code', v_coupon_code, 'coupon_discount', v_discount)
    end
  )
  returning id, orders.order_number into v_order_id, v_order_number;

  insert into public.order_items (
    order_id, offer_id, name_ar_snapshot, name_en_snapshot,
    unit_price, quantity, total_price, dynamic_fields, metadata
  )
  values (
    v_order_id,
    v_offer.id,
    v_offer.name_ar,
    v_offer.name_en,
    v_unit_price,
    v_quantity,
    v_subtotal,
    coalesce(p_dynamic_fields, '{}'::jsonb),
    jsonb_build_object('offer_type', v_offer.offer_type, 'product_id', v_offer.product_id)
  )
  returning id into v_item_id;

  if v_coupon_id is not null then
    perform public.redeem_coupon(v_coupon_id, v_coupon_code, v_user_id, v_order_id, v_discount, v_offer.currency);
  end if;

  update public.wallets
  set balance = v_after,
      version = version + 1
  where id = v_wallet_id;

  insert into public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, idempotency_key, payment_method, description
  )
  values (
    v_wallet_id, v_user_id, 'purchase', -v_total, v_before, v_after,
    'order', v_order_id, p_idempotency_key, 'wallet',
    'Order ' || v_order_number
  )
  returning id into v_transaction_id;

  update public.orders
  set status = 'paid',
      payment_status = 'paid',
      wallet_transaction_id = v_transaction_id
  where id = v_order_id;

  update public.idempotency_keys
  set response_status = 200,
      response_body = jsonb_build_object(
        'order_id', v_order_id,
        'order_number', v_order_number,
        'total', v_total,
        'balance', v_after,
        'order_item_id', v_item_id
      )
  where key = p_idempotency_key;

  return query select v_order_id, v_order_number, v_total, v_after, false;
end;
$$;

revoke all on function public.place_wallet_order_for_user(uuid, uuid, integer, jsonb, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.place_wallet_order_for_user(uuid, uuid, integer, jsonb, uuid, text, text)
  to service_role;

/**
 * Admin gift checkout. A gift is paid on arrival with no wallet involved, and
 * the margin guard still applies: a discounted gift order below cost is the
 * same loss as a discounted wallet order below cost.
 */
create or replace function public.place_gift_order(
  p_offer_id uuid,
  p_quantity integer,
  p_dynamic_fields jsonb,
  p_idempotency_key uuid,
  p_customer_note text default null,
  p_coupon_code text default null
)
returns table (
  order_id uuid,
  order_number text,
  total numeric,
  balance numeric,
  idempotent boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_offer record;
  v_quantity integer := coalesce(p_quantity, 1);
  v_at timestamptz := timezone('utc', now());
  v_unit_price numeric(12, 2);
  v_subtotal numeric(12, 2);
  v_discount numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_coupon_id uuid;
  v_coupon_code text;
  v_order_id uuid;
  v_order_number text;
  v_item_id uuid;
  v_stored jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if not public.is_admin(v_user_id) then
    raise exception 'Administrator required' using errcode = 'P0001';
  end if;

  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = 'P0001';
  end if;

  if v_quantity < 1 or v_quantity > 10 then
    raise exception 'Invalid quantity' using errcode = 'P0001';
  end if;

  begin
    insert into public.idempotency_keys (key, user_id, operation, expires_at)
    values (p_idempotency_key, v_user_id, 'place_gift_order', timezone('utc', now()) + interval '7 days');
  exception
    when unique_violation then
      select ik.response_body into v_stored
      from public.idempotency_keys ik
      where ik.key = p_idempotency_key
        and ik.user_id = v_user_id
        and ik.operation = 'place_gift_order';

      if v_stored is null then
        raise exception 'Order already in progress' using errcode = 'P0001';
      end if;

      return query
      select (v_stored ->> 'order_id')::uuid,
             v_stored ->> 'order_number',
             (v_stored ->> 'total')::numeric,
             (v_stored ->> 'balance')::numeric,
             true;
      return;
  end;

  select o.id,
         o.product_id,
         o.name_ar,
         o.name_en,
         o.price,
         o.currency,
         o.offer_type
  into v_offer
  from public.offers o
  join public.products p on p.id = o.product_id
  where o.id = p_offer_id
    and o.is_active = true
    and p.is_active = true;

  if v_offer.id is null then
    raise exception 'Offer unavailable' using errcode = 'P0001';
  end if;

  v_unit_price := v_offer.price;
  v_subtotal := round(v_unit_price * v_quantity, 2);

  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    select c.coupon_id, c.code, c.discount
    into v_coupon_id, v_coupon_code, v_discount
    from public.validate_coupon_for_order(
      p_coupon_code,
      v_user_id,
      v_offer.id,
      v_quantity,
      v_subtotal,
      v_at
    ) c;
  end if;

  v_discount := coalesce(v_discount, 0);
  v_total := round(v_subtotal - v_discount, 2);

  insert into public.orders (
    user_id, status, payment_status, payment_method, currency,
    subtotal, discount, total, customer_note, metadata
  )
  values (
    v_user_id, 'paid', 'paid', 'gift', v_offer.currency,
    v_subtotal, v_discount, v_total, nullif(btrim(coalesce(p_customer_note, '')), ''),
    case when v_coupon_id is null then '{}'::jsonb
         else jsonb_build_object('coupon_code', v_coupon_code, 'coupon_discount', v_discount)
    end
  )
  returning id, orders.order_number into v_order_id, v_order_number;

  insert into public.order_items (
    order_id, offer_id, name_ar_snapshot, name_en_snapshot,
    unit_price, quantity, total_price, dynamic_fields, metadata
  )
  values (
    v_order_id,
    v_offer.id,
    v_offer.name_ar,
    v_offer.name_en,
    v_unit_price,
    v_quantity,
    v_subtotal,
    coalesce(p_dynamic_fields, '{}'::jsonb),
    jsonb_build_object('offer_type', v_offer.offer_type, 'product_id', v_offer.product_id)
  )
  returning id into v_item_id;

  if v_coupon_id is not null then
    perform public.redeem_coupon(v_coupon_id, v_coupon_code, v_user_id, v_order_id, v_discount, v_offer.currency);
  end if;

  update public.idempotency_keys
  set response_status = 200,
      response_body = jsonb_build_object(
        'order_id', v_order_id,
        'order_number', v_order_number,
        'total', v_total,
        'balance', 0,
        'order_item_id', v_item_id
      )
  where key = p_idempotency_key;

  return query select v_order_id, v_order_number, v_total, 0::numeric, false;
end;
$$;

revoke all on function public.place_gift_order(uuid, integer, jsonb, uuid, text, text) from public, anon;
grant execute on function public.place_gift_order(uuid, integer, jsonb, uuid, text, text) to authenticated;

comment on function public.place_wallet_order(uuid, integer, jsonb, uuid, text, text) is
  'Customer wallet checkout. The coupon discount is recomputed from the live price under a row lock; a code that would sell below supplier cost is refused.';

-- ─── Ready-made campaigns ──────────────────────────────────────────────────
--
-- Two codes the owner can switch on today. Both are inactive on purpose: the
-- migration ships the campaign, the owner decides when to spend on it.
--
-- `TELEGRAM5` is the Telegram-only code (announced through a broadcast), a 5%
-- discount capped at $3.50 — at a $19 order that is ~$0.95, comfortably inside
-- the ~$2.50 gross profit the average order earns, and the margin guard
-- refuses it outright on any offer where 5% would cross the supplier cost.
--
-- `WELCOME2` is the first-purchase code, $1.00 fixed, which is a little under
-- half the average order's gross profit and the same size as the referral
-- reward, so one new customer can at most consume two dollars of margin.

insert into public.coupons (code, type, value, min_subtotal, max_discount, usage_limit, per_customer_limit, is_active, admin_note)
values
  ('TELEGRAM5', 'percent', 5, 0, 3.50, null, 1, false,
   'Telegram-only campaign: announce with a customer broadcast. 5% off, at most $3.50, once per customer.'),
  ('WELCOME2', 'fixed', 1.00, 5.00, null, null, 1, false,
   'First-purchase code: $1.00 off orders of $5 or more, once per customer.')
on conflict (upper(code)) do nothing;

comment on table public.coupons is
  'Discount codes. Validation, the per-customer limit, the usage claim and the supplier-cost margin guard all run inside the order transaction.';

-- ---------------------------------------------------------------------------
-- END 20261010100000_coupons.sql
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- BEGIN 20261010110000_referral_loop.sql
-- ---------------------------------------------------------------------------

-- Referral loop.
--
-- Every customer gets a shareable code. A new account that arrives through it
-- is a `signup`. When that account's first order is **paid and delivered**,
-- both sides are credited to their wallet. Nothing is credited on signup
-- alone: a referral that pays out before money arrives is a faucet, and this
-- store's gross profit is about $2.50 an order.
--
-- Three guards, all enforced in the database:
--   * one credit per referred customer — `referral_claims.referred_user_id` is
--     unique, so the second settlement of the same person cannot pay twice;
--   * no self-referral — checked when the claim is created and again when it is
--     credited, because a customer can edit their own profile;
--   * idempotent issuance — each side's credit is a wallet transaction with a
--     deterministic `idempotency_key` derived from the claim, so a retry after a
--     crash conflicts instead of paying twice.
--
-- The amounts are settings, not constants, so the owner can raise them once the
-- loop is proven rather than editing SQL.

create table if not exists public.referral_program_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  -- $1.00 each by default: two dollars of credit against ~$2.50 of gross
  -- profit on a $19 order is the whole budget, and it is only ever paid for a
  -- referral that produced a delivered sale.
  referrer_credit numeric(12, 2) not null default 1.00 check (referrer_credit >= 0),
  referred_credit numeric(12, 2) not null default 1.00 check (referred_credit >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.referral_program_settings (id) values (true)
on conflict (id) do nothing;

drop trigger if exists referral_program_settings_set_updated_at on public.referral_program_settings;
create trigger referral_program_settings_set_updated_at
before update on public.referral_program_settings
for each row
execute function public.set_updated_at();

/** One stable code per customer, minted on first ask. */
create table if not exists public.referral_codes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  code text not null,
  created_at timestamptz not null default timezone('utc', now())
);

-- Case-insensitive, so `gh4k2x` and `GH4K2X` are the same invitation.
create unique index if not exists referral_codes_code_key
  on public.referral_codes (upper(code));

/**
 * A signup that arrived through a code, awaiting its first delivered order.
 *
 * `signup_order_id` records which order first qualified, which is what the
 * support question "why did this person get $2?" is actually answered with.
 */
create table if not exists public.referral_claims (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  referrer_user_id uuid not null references public.profiles (id) on delete cascade,
  -- Unique: the store credits one referral per referred customer, ever.
  referred_user_id uuid not null unique references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'credited', 'rejected')),
  reason text,
  signup_order_id uuid references public.orders (id) on delete set null,
  credited_at timestamptz,
  referrer_amount numeric(12, 2),
  referred_amount numeric(12, 2),
  -- Stamped by `credit_referral_for_order` whenever it has looked at this
  -- claim, whatever the answer. It is what lets the sweep ask "which claims
  -- have not been settled yet?" without re-examining every old order.
  credit_checked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists referral_claims_referrer_idx
  on public.referral_claims (referrer_user_id, created_at desc);
create index if not exists referral_claims_pending_idx
  on public.referral_claims (created_at)
  where status = 'pending';

alter table public.referral_codes enable row level security;
alter table public.referral_claims enable row level security;
alter table public.referral_program_settings enable row level security;

revoke all on public.referral_codes, public.referral_claims from anon, authenticated;
grant select, insert, update, delete on public.referral_codes, public.referral_claims to service_role;
grant select on public.referral_codes to authenticated;

drop policy if exists referral_codes_select_own on public.referral_codes;
create policy referral_codes_select_own
on public.referral_codes
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists referral_codes_admin_all on public.referral_codes;
create policy referral_codes_admin_all
on public.referral_codes
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists referral_claims_admin_select on public.referral_claims;
create policy referral_claims_admin_select
on public.referral_claims
for select
to authenticated
using (public.is_admin(auth.uid()));

grant select on public.referral_claims to authenticated;

revoke all on public.referral_program_settings from anon;
grant select, update on public.referral_program_settings to authenticated;
grant select, update on public.referral_program_settings to service_role;

drop policy if exists referral_program_read on public.referral_program_settings;
create policy referral_program_read
on public.referral_program_settings
for select
to authenticated
using (true);

drop policy if exists referral_program_admin_update on public.referral_program_settings;
create policy referral_program_admin_update
on public.referral_program_settings
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- ─── Minting a code ────────────────────────────────────────────────────────

/**
 * One stable code per customer, minted on first ask.
 *
 * Uppercase alphanumerics from `md5`, six characters: short enough to type,
 * and derived from the customer's own id so the same customer always gets the
 * same code instead of a new one on every page load.
 */
create or replace function public.ensure_referral_code(p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code text;
  v_attempt integer := 0;
begin
  if p_user_id is null then
    raise exception 'A customer is required' using errcode = 'P0001';
  end if;

  select r.code into v_code
  from public.referral_codes r
  where r.user_id = p_user_id;

  if v_code is not null then
    return v_code;
  end if;

  loop
    v_attempt := v_attempt + 1;
    -- `md5` of the id plus the attempt: deterministic for the first try, and a
    -- different candidate rather than the same collision on retry.
    v_code := upper(substr(replace(md5(p_user_id::text || ':' || v_attempt::text), '-', ''), 1, 6));

    begin
      insert into public.referral_codes (user_id, code)
      values (p_user_id, v_code);

      return v_code;
    exception
      when unique_violation then
        -- Either this customer raced itself (a code now exists — return it) or
        -- the code belongs to someone else (try again).
        select r.code into v_code
        from public.referral_codes r
        where r.user_id = p_user_id;

        if v_code is not null then
          return v_code;
        end if;

        if v_attempt >= 8 then
          raise exception 'Could not mint a referral code' using errcode = 'P0001';
        end if;
    end;
  end loop;
end;
$$;

revoke all on function public.ensure_referral_code(uuid) from public, anon;
grant execute on function public.ensure_referral_code(uuid) to authenticated, service_role;

-- ─── Capturing a referral ──────────────────────────────────────────────────

/**
 * Attach a referral code to a newly created account.
 *
 * Called by the signup path with the service key, right after Supabase creates
 * the user. Every refusal is reported rather than raised: an unknown code or a
 * disabled program must not fail a signup that has already happened, and the
 * caller decides whether to tell the customer.
 */
create or replace function public.apply_referral_signup(
  p_referred_user_id uuid,
  p_code text
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_settings public.referral_program_settings;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_referrer uuid;
begin
  if p_referred_user_id is null or v_code = '' then
    return 'invalid';
  end if;

  select * into v_settings from public.referral_program_settings where id;

  if not coalesce(v_settings.enabled, false) then
    return 'disabled';
  end if;

  select r.user_id into v_referrer
  from public.referral_codes r
  where upper(r.code) = v_code;

  if v_referrer is null then
    return 'unknown_code';
  end if;

  if v_referrer = p_referred_user_id then
    return 'self_referral';
  end if;

  -- `on conflict do nothing` because a customer can only ever be referred once,
  -- and a second visit through somebody's link is not a second referral.
  insert into public.referral_claims (code, referrer_user_id, referred_user_id, status)
  values (v_code, v_referrer, p_referred_user_id, 'pending')
  on conflict (referred_user_id) do nothing;

  return 'recorded';
end;
$$;

revoke all on function public.apply_referral_signup(uuid, text) from public, anon, authenticated;
grant execute on function public.apply_referral_signup(uuid, text) to service_role;

-- ─── Crediting on the first delivered order ────────────────────────────────

/**
 * Credit both sides when the referred customer's first order is delivered.
 *
 * Restricted to the service role: this moves money, and the only thing allowed
 * to decide that a delivery happened is the fulfilment path.
 *
 * The claim row is locked first, so two settlements of the same order cannot
 * both pass the `status = 'pending'` check. The credit itself is a single
 * `wallet_transactions` row per side under a deterministic `idempotency_key`
 * derived from the claim, so a retry after a crash conflicts rather than
 * paying twice. The wallet balance only moves when that ledger row was really
 * written, so a transaction can never be missing from the balance it explains.
 */
create or replace function public.credit_referral_for_order(
  p_order_id uuid,
  p_paid_only boolean default true
)
returns table (
  claim_id uuid,
  referrer_credited numeric,
  referred_credited numeric,
  status text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_claim public.referral_claims;
  v_settings public.referral_program_settings;
  v_wallet record;
  v_before numeric(12, 2);
  v_after numeric(12, 2);
begin
  select * into v_order from public.orders where id = p_order_id;

  if v_order.id is null then
    return query select null::uuid, 0::numeric, 0::numeric, 'no_order'::text;
    return;
  end if;

  -- Only a real, delivered purchase pays. `p_paid_only` lets an operator ask
  -- the question without moving money; it does not let an unpaid order credit.
  if p_paid_only and (v_order.payment_status <> 'paid' or v_order.status <> 'completed') then
    return query select null::uuid, 0::numeric, 0::numeric, 'not_delivered'::text;
    return;
  end if;

  select * into v_claim
  from public.referral_claims
  where referred_user_id = v_order.user_id
  for update;

  if v_claim.id is null then
    return query select null::uuid, 0::numeric, 0::numeric, 'no_claim'::text;
    return;
  end if;

  -- A "no" is an answer, and recording it is what stops the sweep asking the
  -- same question about the same claim on every cron tick.
  update public.referral_claims
  set credit_checked_at = timezone('utc', now())
  where id = v_claim.id;

  if v_claim.status = 'credited' then
    return query select v_claim.id, 0::numeric, 0::numeric, 'already_credited'::text;
    return;
  end if;

  if v_claim.status = 'rejected' then
    return query select v_claim.id, 0::numeric, 0::numeric, 'rejected'::text;
    return;
  end if;

  -- Re-checked here, not only at signup: a customer can edit a profile.
  if v_claim.referrer_user_id = v_claim.referred_user_id then
    update public.referral_claims
    set status = 'rejected', reason = 'self_referral'
    where id = v_claim.id;

    return query select v_claim.id, 0::numeric, 0::numeric, 'rejected'::text;
    return;
  end if;

  select * into v_settings from public.referral_program_settings where id;

  if not coalesce(v_settings.enabled, false) then
    return query select v_claim.id, 0::numeric, 0::numeric, 'disabled'::text;
    return;
  end if;

  -- Referrer side.
  if v_settings.referrer_credit > 0 then
    select w.id, w.balance into v_wallet
    from public.wallets w
    where w.user_id = v_claim.referrer_user_id
    for update;

    if v_wallet.id is not null then
      v_before := v_wallet.balance;
      v_after := v_before + v_settings.referrer_credit;

      insert into public.wallet_transactions (
        wallet_id, user_id, type, amount, balance_before, balance_after,
        reference_type, reference_id, idempotency_key, description, metadata
      )
      values (
        v_wallet.id, v_claim.referrer_user_id, 'adjustment', v_settings.referrer_credit,
        v_before, v_after, 'referral_referrer', v_claim.id,
        md5('referral_referrer:' || v_claim.id::text)::uuid,
        'Referral credit for ' || v_claim.code,
        jsonb_build_object('referral_claim_id', v_claim.id, 'order_id', p_order_id, 'side', 'referrer')
      )
      on conflict (idempotency_key) do nothing;

      if found then
        update public.wallets
        set balance = v_after, version = version + 1
        where id = v_wallet.id;
      end if;
    end if;
  end if;

  -- Referred side.
  if v_settings.referred_credit > 0 then
    select w.id, w.balance into v_wallet
    from public.wallets w
    where w.user_id = v_claim.referred_user_id
    for update;

    if v_wallet.id is not null then
      v_before := v_wallet.balance;
      v_after := v_before + v_settings.referred_credit;

      insert into public.wallet_transactions (
        wallet_id, user_id, type, amount, balance_before, balance_after,
        reference_type, reference_id, idempotency_key, description, metadata
      )
      values (
        v_wallet.id, v_claim.referred_user_id, 'adjustment', v_settings.referred_credit,
        v_before, v_after, 'referral_referred', v_claim.id,
        md5('referral_referred:' || v_claim.id::text)::uuid,
        'Referral welcome credit',
        jsonb_build_object('referral_claim_id', v_claim.id, 'order_id', p_order_id, 'side', 'referred')
      )
      on conflict (idempotency_key) do nothing;

      if found then
        update public.wallets
        set balance = v_after, version = version + 1
        where id = v_wallet.id;
      end if;
    end if;
  end if;

  update public.referral_claims
  set status = 'credited',
      credited_at = timezone('utc', now()),
      signup_order_id = p_order_id,
      referrer_amount = greatest(v_settings.referrer_credit, 0),
      referred_amount = greatest(v_settings.referred_credit, 0),
      credit_checked_at = timezone('utc', now())
  where id = v_claim.id;

  return query select
    v_claim.id,
    greatest(v_settings.referrer_credit, 0),
    greatest(v_settings.referred_credit, 0),
    'credited'::text;
end;
$$;

revoke all on function public.credit_referral_for_order(uuid, boolean) from public, anon, authenticated;
grant execute on function public.credit_referral_for_order(uuid, boolean) to service_role;

/**
 * The owner's view of the loop, in one row.
 *
 * The point of showing this before spending more on the program: how many codes
 * were issued, how many signups arrived, how many became delivered orders, and
 * how much credit has actually left the wallet.
 */
create or replace function public.referral_program_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'enabled', coalesce(s.enabled, false),
    'referrer_credit', coalesce(s.referrer_credit, 0),
    'referred_credit', coalesce(s.referred_credit, 0),
    'codes_issued', (select count(*) from public.referral_codes),
    'signups', (select count(*) from public.referral_claims),
    'pending', (select count(*) from public.referral_claims where status = 'pending'),
    'credited', (select count(*) from public.referral_claims where status = 'credited'),
    'rejected', (select count(*) from public.referral_claims where status = 'rejected'),
    'credit_issued', coalesce((
      select sum(wt.amount)
      from public.wallet_transactions wt
      where wt.reference_type in ('referral_referrer', 'referral_referred')
    ), 0),
    'top_referrers', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select
          c.referrer_user_id,
          p.full_name,
          p.email,
          count(*)::integer as signups,
          count(*) filter (where c.status = 'credited')::integer as credited
        from public.referral_claims c
        left join public.profiles p on p.id = c.referrer_user_id
        group by c.referrer_user_id, p.full_name, p.email
        order by count(*) desc, c.referrer_user_id
        limit 10
      ) t
    ), '[]'::jsonb)
  )
  from public.referral_program_settings s
  where s.id;
$$;

revoke all on function public.referral_program_stats() from public, anon;
grant execute on function public.referral_program_stats() to authenticated, service_role;

comment on table public.referral_claims is
  'One row per referred customer. Unique on the referred user, so a referral can only ever be credited once.';

-- ---------------------------------------------------------------------------
-- END 20261010110000_referral_loop.sql
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- BEGIN 20261010120000_repeat_purchase_reminders.sql
-- ---------------------------------------------------------------------------

-- Repeat-purchase reminders.
--
-- Some products are recurring by nature: a subscription with a stated
-- duration, or a top-up a customer buys again every month. The structured
-- `offers.duration_value` / `duration_unit` columns already say which offers
-- those are, so nothing here guesses from a product name.
--
-- Two rules make this a reminder service rather than a spam service:
--
--   * **Opt-out is respected before anything is queued.** A customer with a
--     row in `repeat_reminder_optouts` is skipped by the app and by the
--     database, and the chat command `/stop` writes that row.
--   * **One reminder per customer per product per cycle.** The unique index on
--     `repeat_reminders` is the guarantee: a cron that runs twice, a worker
--     that retries, or a customer who buys again the same day cannot produce a
--     second message for the same cycle.
--
-- A customer who has bought the product since the cycle came due is not
-- reminded at all — that is the `not exists` clause in `due_repeat_reminders`.
-- Reminding somebody to re-buy something they bought yesterday is how a store
-- teaches customers to ignore it.

create table if not exists public.repeat_reminder_optouts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  reason text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.repeat_reminder_optouts enable row level security;

-- A customer may read and write their own opt-out; the bot writes it with the
-- service key.
revoke all on public.repeat_reminder_optouts from anon;
grant select, insert, update, delete on public.repeat_reminder_optouts to authenticated, service_role;

drop policy if exists repeat_reminder_optouts_own on public.repeat_reminder_optouts;
create policy repeat_reminder_optouts_own
on public.repeat_reminder_optouts
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists repeat_reminder_optouts_admin on public.repeat_reminder_optouts;
create policy repeat_reminder_optouts_admin
on public.repeat_reminder_optouts
for select
to authenticated
using (public.is_admin(auth.uid()));

create table if not exists public.repeat_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  offer_id uuid references public.offers (id) on delete set null,
  -- Which renewal this is: cycles since the customer's first purchase of the
  -- product, counted in the offer's own duration unit.
  cycle_index integer not null check (cycle_index >= 1),
  due_at timestamptz not null,
  title_ar text not null,
  title_en text not null,
  body_ar text not null,
  body_en text not null,
  -- The buy-again deep link: the same `/{locale}/checkout/{product}/{offer}`
  -- path the order page's "Buy again" link uses.
  href text not null,
  channel text not null default 'telegram'
    check (channel in ('telegram', 'in_app', 'both')),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'skipped', 'failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  -- The dedup guarantee, in the schema rather than in a scheduler's memory.
  unique (user_id, product_id, cycle_index)
);

create index if not exists repeat_reminders_pending_idx
  on public.repeat_reminders (created_at)
  where status = 'pending';
create index if not exists repeat_reminders_user_idx
  on public.repeat_reminders (user_id, created_at desc);

alter table public.repeat_reminders enable row level security;

revoke all on public.repeat_reminders from anon, authenticated;
grant select, insert, update, delete on public.repeat_reminders to service_role;

-- ─── Opting out ────────────────────────────────────────────────────────────

create or replace function public.set_repeat_reminder_optout(
  p_user_id uuid,
  p_opted_out boolean,
  p_reason text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'A customer is required' using errcode = 'P0001';
  end if;

  if p_opted_out then
    insert into public.repeat_reminder_optouts (user_id, reason)
    values (p_user_id, nullif(btrim(coalesce(p_reason, '')), ''))
    on conflict (user_id) do update set reason = excluded.reason;

    -- Anything already queued for this customer stops here rather than waiting
    -- for a drain that should never send it.
    update public.repeat_reminders
    set status = 'skipped', error = 'opted_out'
    where user_id = p_user_id
      and status = 'pending';

    return true;
  end if;

  delete from public.repeat_reminder_optouts where user_id = p_user_id;

  return false;
end;
$$;

revoke all on function public.set_repeat_reminder_optout(uuid, boolean, text) from public, anon;
grant execute on function public.set_repeat_reminder_optout(uuid, boolean, text)
  to authenticated, service_role;

-- ─── The due list ──────────────────────────────────────────────────────────

/**
 * Reminders that are genuinely due right now, and not already sent.
 *
 * The shape of "due": the customer's most recent **delivered and paid** order
 * of this offer is older than one duration (a one-month subscription comes due
 * a month later), the product is still buyable, they have not bought it since
 * that cycle came due, and they have not opted out.
 *
 * `p_overdue_days` bounds how stale a reminder may be: coming back after six
 * quiet months and firing every missed cycle at once is spam, so anything more
 * than three months overdue is dropped rather than queued.
 */
create or replace function public.due_repeat_reminders(
  p_limit integer default 25,
  p_overdue_days integer default 90
)
returns table (
  user_id uuid,
  product_id uuid,
  offer_id uuid,
  cycle_index integer,
  due_at timestamptz,
  purchased_at timestamptz,
  product_slug text,
  product_name_ar text,
  product_name_en text,
  offer_slug text,
  offer_name_ar text,
  offer_name_en text,
  duration_value integer,
  duration_unit text,
  language_code text
)
language sql
stable
security definer
set search_path = public
as $$
  with last_purchase as (
    select
      o.user_id,
      oi.offer_id,
      o2.product_id,
      max(coalesce(o.completed_at, o.created_at)) as purchased_at,
      count(*) as purchases
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.offers o2 on o2.id = oi.offer_id
    where o.payment_status = 'paid'
      and o.status = 'completed'
      and oi.offer_id is not null
    group by o.user_id, oi.offer_id, o2.product_id
  ),
  recurring as (
    select
      lp.user_id,
      lp.product_id,
      lp.offer_id,
      lp.purchased_at,
      lp.purchases,
      o.duration_value,
      o.duration_unit
    from last_purchase lp
    join public.offers o on o.id = lp.offer_id
    join public.products p on p.id = lp.product_id
    where o.is_active = true
      and p.is_active = true
      and o.duration_value is not null
      and o.duration_unit in ('hour', 'day', 'month', 'year')
      -- A duration is what makes a product recurring; without one it is a
      -- one-off and there is nothing to remind anybody about.
      and exists (
        select 1 from public.offers sibling
        where sibling.product_id = lp.product_id
          and sibling.is_active = true
      )
  ),
  cycles as (
    select
      r.user_id,
      r.product_id,
      r.offer_id,
      r.purchased_at,
      r.duration_value,
      r.duration_unit,
      case r.duration_unit
        when 'hour' then make_interval(hours => r.duration_value)
        when 'day' then make_interval(days => r.duration_value)
        when 'month' then make_interval(months => r.duration_value)
        else make_interval(years => r.duration_value)
      end as cycle_length
    from recurring r
  ),
  due as (
    select
      c.user_id,
      c.product_id,
      c.offer_id,
      c.purchased_at,
      c.cycle_length,
      -- The first cycle whose due date has passed. `greatest(..., 1)` keeps a
      -- same-day customer out of cycle zero.
      greatest(
        floor(
          extract(epoch from (timezone('utc', now()) - c.purchased_at))
          / nullif(extract(epoch from c.cycle_length), 0)
        )::integer,
        1
      ) as cycle_index
    from cycles c
  ),
  candidates as (
    select
      d.user_id,
      d.product_id,
      d.offer_id,
      d.cycle_index,
      d.purchased_at,
      d.purchased_at + (d.cycle_length * d.cycle_index) as due_at
    from due d
    where timezone('utc', now()) >= d.purchased_at + (d.cycle_length * d.cycle_index)
      and timezone('utc', now()) <= d.purchased_at + (d.cycle_length * d.cycle_index)
        + make_interval(days => (greatest(coalesce(p_overdue_days, 90), 1))::integer)
      and not exists (
        select 1 from public.repeat_reminder_optouts x where x.user_id = d.user_id
      )
      -- Bought it again since the cycle came due: nothing to remind about.
      and not exists (
        select 1
        from public.orders o
        join public.order_items oi on oi.order_id = o.id
        join public.offers o2 on o2.id = oi.offer_id
        where o.user_id = d.user_id
          and o2.product_id = d.product_id
          and o.payment_status = 'paid'
          and o.status = 'completed'
          and coalesce(o.completed_at, o.created_at) > d.purchased_at + (d.cycle_length * d.cycle_index)
      )
  )
  select
    c.user_id,
    c.product_id,
    c.offer_id,
    c.cycle_index,
    c.due_at,
    c.purchased_at,
    p.slug,
    p.name_ar,
    p.name_en,
    o.slug,
    o.name_ar,
    o.name_en,
    o.duration_value,
    o.duration_unit,
    l.language_code
  from candidates c
  join public.products p on p.id = c.product_id
  join public.offers o on o.id = c.offer_id
  left join public.telegram_chat_links l on l.user_id = c.user_id
  where not exists (
    select 1
    from public.repeat_reminders rr
    where rr.user_id = c.user_id
      and rr.product_id = c.product_id
      and rr.cycle_index = c.cycle_index
  )
  order by c.due_at asc
  limit greatest(coalesce(p_limit, 25), 1);
$$;

revoke all on function public.due_repeat_reminders(integer, integer) from public, anon, authenticated;
grant execute on function public.due_repeat_reminders(integer, integer) to service_role;

comment on function public.due_repeat_reminders(integer, integer) is
  'Recurring products whose next cycle is due, excluding opted-out customers, anyone who re-bought, and any cycle already reminded.';

-- ─── Reminder copy ─────────────────────────────────────────────────────────

/**
 * Write the queued reminder's bilingual copy, in the database, once.
 *
 * The Worker that delivers it has no i18n and no product joins, and a
 * scheduler that composes customer-facing sentences in SQL is one place to get
 * them wrong instead of two.
 */
create or replace function public.repeat_reminder_copy(
  p_product_name_ar text,
  p_product_name_en text,
  p_offer_name_ar text,
  p_offer_name_en text,
  p_href text
)
returns table (title_ar text, title_en text, body_ar text, body_en text)
language sql
immutable
as $$
  select
    'وقت التجديد — ' || coalesce(nullif(btrim(p_product_name_ar), ''), nullif(btrim(p_offer_name_ar), ''), 'منتج'),
    'Time to renew — ' || coalesce(nullif(btrim(p_product_name_en), ''), nullif(btrim(p_offer_name_en), ''), 'product'),
    'اشتراكك في ' || coalesce(nullif(btrim(p_offer_name_ar), ''), nullif(btrim(p_product_name_ar), ''), 'هذا العرض')
      || ' يقترب من موعده. أعد الشراء من هنا: ' || p_href,
    'Your ' || coalesce(nullif(btrim(p_offer_name_en), ''), nullif(btrim(p_product_name_en), ''), 'offer')
      || ' is due again. Buy it again here: ' || p_href;
$$;

revoke all on function public.repeat_reminder_copy(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.repeat_reminder_copy(text, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- END 20261010120000_repeat_purchase_reminders.sql
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- BEGIN 20261010140000_consolidate_categories.sql
-- ---------------------------------------------------------------------------

-- Consolidate duplicate categories:
-- 1. Games: deactivate redundant games-instant-recharge subcategory (0 products)
-- 2. Vouchers: unify gift-cards-codes and games-vouchers into a single top-level "Vouchers" / "قسائم" category

update public.categories
   set slug = 'vouchers',
       name_en = 'Vouchers',
       name_ar = 'قسائم',
       parent_id = null,
       sort_order = 20,
       is_active = true,
       updated_at = timezone('utc', now())
 where id = '803b38c8-f810-4648-bddb-6e4aad2cbbf1'
    or slug = 'gift-cards-codes';

update public.products
   set category_id = (select id from public.categories where slug = 'vouchers'),
       updated_at = timezone('utc', now())
 where category_id in (
   select id from public.categories where slug in ('games-vouchers', 'games-instant-recharge')
 );

delete from public.categories
 where slug in ('games-vouchers', 'games-instant-recharge');

update public.store_settings
   set home_layout = (
     select jsonb_agg(
       case
         when elem->>'id' = 'gift_cards' then
           elem || '{"title_en": "Vouchers", "title_ar": "قسائم"}'::jsonb
         else elem
       end
     )
     from jsonb_array_elements(home_layout) elem
   )
 where id = 'global'
   and jsonb_typeof(home_layout) = 'array';

-- ---------------------------------------------------------------------------
-- END 20261010140000_consolidate_categories.sql
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- BEGIN 20261010150000_split_services_category.sql
-- ---------------------------------------------------------------------------

-- Split legacy "services" into 4 distinct single-word categories:
-- 1. Streaming (بث)
-- 2. VPN (VPN)
-- 3. Recharge Balance (تعبئة رصيد)
-- 4. Developing (برمجة)

-- 1. Transform legacy 'services' into 'streaming'
update public.categories
   set slug = 'streaming',
       name_en = 'Streaming',
       name_ar = 'بث',
       sort_order = 60,
       is_active = true,
       updated_at = timezone('utc', now())
 where slug = 'services' or id = '6cb6c5cd-76fe-447b-b456-94b1a30ff151';

-- 2. Insert VPN category
insert into public.categories (id, slug, name_en, name_ar, sort_order, is_active)
values ('141c4428-80f9-429f-86b5-ef3b796d6214', 'vpn', 'VPN', 'VPN', 70, true)
on conflict (slug) do update
   set name_en = excluded.name_en,
       name_ar = excluded.name_ar,
       sort_order = excluded.sort_order,
       is_active = excluded.is_active;

-- 3. Insert Recharge Balance category
insert into public.categories (id, slug, name_en, name_ar, sort_order, is_active)
values ('afa7892c-2a90-4dbd-935c-aea422db5d5a', 'recharge-balance', 'Recharge Balance', 'تعبئة رصيد', 80, true)
on conflict (slug) do update
   set name_en = excluded.name_en,
       name_ar = excluded.name_ar,
       sort_order = excluded.sort_order,
       is_active = excluded.is_active;

-- 4. Insert Developing category
insert into public.categories (id, slug, name_en, name_ar, sort_order, is_active)
values ('7530a08a-fc56-49c7-83a0-f6c3206121cb', 'developing', 'Developing', 'برمجة', 90, true)
on conflict (slug) do update
   set name_en = excluded.name_en,
       name_ar = excluded.name_ar,
       sort_order = excluded.sort_order,
       is_active = excluded.is_active;

-- 5. Reassign VPN products
update public.products
   set category_id = (select id from public.categories where slug = 'vpn'),
       updated_at = timezone('utc', now())
 where slug in ('expressvpn-private-5-devices-30d-27', 'nord-vpn', 'proton-vpn-plus-1-month-10-devices-94', 'hma-key-hma-android-pc-20-30d-143');

-- 6. Reassign Recharge Balance products
update public.products
   set category_id = (select id from public.categories where slug = 'recharge-balance'),
       updated_at = timezone('utc', now())
 where slug in ('1-mtn-14');

-- 7. Reassign Developing products
update public.products
   set category_id = (select id from public.categories where slug = 'developing'),
       updated_at = timezone('utc', now())
 where slug in ('replit-core-12m-121', 'railway-hobby-12m-182', 'gmail-4-9-month-old-nw-60');

-- ---------------------------------------------------------------------------
-- END 20261010150000_split_services_category.sql
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- BEGIN 20261010160000_coupon_safety_and_permissions.sql
-- ---------------------------------------------------------------------------

-- 1. Ensure coupon discounts preserve at least a 2% safety margin of the product price
create or replace function public.coupon_margin_limit(
  p_offer_id uuid,
  p_quantity integer default 1
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_price numeric;
  v_cost numeric;
  v_free boolean := false;
  v_has_cost boolean := false;
  v_min_margin numeric;
begin
  select o.price, (o.delivery_kind = 'stored')
  into v_price, v_free
  from public.offers o
  where o.id = p_offer_id;

  if v_price is null then
    return 0;
  end if;

  if v_free then
    return v_price * greatest(coalesce(p_quantity, 1), 1);
  end if;

  select pm.supplier_cost_usd, true
  into v_cost, v_has_cost
  from public.provider_offer_mappings pm
  where pm.offer_id = p_offer_id
    and pm.supplier_cost_usd is not null
  order by pm.created_at, pm.id
  limit 1;

  if not coalesce(v_has_cost, false) then
    return 0;
  end if;

  -- Maintain at least a 2% margin on product price so store never sells at a loss
  v_min_margin := round(v_price * 0.02, 2);

  return round(greatest(v_price - v_cost - v_min_margin, 0) * greatest(coalesce(p_quantity, 1), 1), 2);
end;
$$;

revoke all on function public.coupon_margin_limit(uuid, integer) from public, anon;
grant execute on function public.coupon_margin_limit(uuid, integer) to authenticated, service_role;

-- 2. Lock down coupons table security: normal customers must NEVER read or list coupons
-- Drop open select policy for normal users if present
drop policy if exists coupons_select_active on public.coupons;

-- Ensure ONLY admins can read or write public.coupons
drop policy if exists coupons_admin_all on public.coupons;
create policy coupons_admin_all
on public.coupons
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- END 20261010160000_coupon_safety_and_permissions.sql
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- BEGIN 20261010170000_coupon_wallet_recharge.sql
-- ---------------------------------------------------------------------------

-- Coupon wallet recharge & balance redemption
--
-- Adds support for 'balance' coupon type, allowing admins to generate gift/recharge
-- coupons that authenticated customers can redeem directly into their wallet balance
-- at /redeem. Once redeemed (e.g. 1-time single use), it is immediately marked as used
-- and becomes unavailable.

-- 1. Support 'balance' type in coupons table
alter table public.coupons drop constraint if exists coupons_type_check;
alter table public.coupons add constraint coupons_type_check check (type in ('percent', 'fixed', 'balance'));

-- 2. Make order_id nullable in coupon_redemptions so wallet recharges (which have no order) can be recorded
alter table public.coupon_redemptions alter column order_id drop not null;

-- Partial unique index so a customer cannot redeem the same balance coupon multiple times
create unique index if not exists coupon_redemptions_wallet_key
  on public.coupon_redemptions (coupon_id, user_id)
  where order_id is null;

-- 3. Disallow balance coupons from being applied as order checkout discounts
create or replace function public.validate_coupon_for_order(
  p_code text,
  p_user_id uuid,
  p_offer_id uuid,
  p_subtotal numeric,
  p_quantity integer,
  p_at timestamptz default timezone('utc', now())
)
returns table (coupon_id uuid, code text, discount numeric)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_coupon public.coupons;
  v_uses integer := 0;
  v_discount numeric(12, 2) := 0;
  v_ceiling numeric(12, 2);
  v_scoped boolean := false;
  v_product uuid;
  v_category uuid;
begin
  if p_code is null or btrim(p_code) = '' then
    raise exception 'Coupon code required' using errcode = 'P0001';
  end if;

  select * into v_coupon
  from public.coupons
  where upper(code) = upper(btrim(p_code))
  for update;

  if v_coupon.id is null then
    raise exception 'Coupon not found' using errcode = 'P0001';
  end if;

  if not v_coupon.is_active then
    raise exception 'Coupon is not active' using errcode = 'P0001';
  end if;

  if v_coupon.type = 'balance' then
    raise exception 'Balance coupons cannot be used as checkout discounts' using errcode = 'P0001';
  end if;

  if v_coupon.valid_from is not null and p_at < v_coupon.valid_from then
    raise exception 'Coupon is not valid yet' using errcode = 'P0001';
  end if;

  if v_coupon.valid_until is not null and p_at >= v_coupon.valid_until then
    raise exception 'Coupon has expired' using errcode = 'P0001';
  end if;

  if v_coupon.usage_limit is not null and v_coupon.times_used >= v_coupon.usage_limit then
    raise exception 'Coupon usage limit reached' using errcode = 'P0001';
  end if;

  select count(*) into v_uses
  from public.coupon_redemptions r
  where r.coupon_id = v_coupon.id
    and r.user_id = p_user_id;

  if v_uses >= v_coupon.per_customer_limit then
    raise exception 'Coupon already used' using errcode = 'P0001';
  end if;

  if coalesce(p_subtotal, 0) < v_coupon.min_subtotal then
    raise exception 'Order subtotal is below the coupon minimum' using errcode = 'P0001';
  end if;

  select p.category_id, o.product_id
  into v_category, v_product
  from public.offers o
  join public.products p on p.id = o.product_id
  where o.id = p_offer_id;

  if cardinality(v_coupon.category_ids) > 0 then
    v_scoped := true;
    if v_category is null or not (v_category = any(v_coupon.category_ids)) then
      raise exception 'Coupon not valid for this category' using errcode = 'P0001';
    end if;
  end if;

  if cardinality(v_coupon.product_ids) > 0 then
    v_scoped := true;
    if v_product is null or not (v_product = any(v_coupon.product_ids)) then
      raise exception 'Coupon not valid for this product' using errcode = 'P0001';
    end if;
  end if;

  if cardinality(v_coupon.offer_ids) > 0 then
    v_scoped := true;
    if not (p_offer_id = any(v_coupon.offer_ids)) then
      raise exception 'Coupon not valid for this offer' using errcode = 'P0001';
    end if;
  end if;

  if v_coupon.type = 'percent' then
    v_discount := round((coalesce(p_subtotal, 0) * v_coupon.value) / 100.0, 2);
  else
    v_discount := least(v_coupon.value, coalesce(p_subtotal, 0));
  end if;

  if v_coupon.max_discount is not null then
    v_discount := least(v_discount, v_coupon.max_discount);
  end if;

  v_discount := round(greatest(least(v_discount, coalesce(p_subtotal, 0)), 0), 2);

  if v_discount <= 0 then
    raise exception 'Coupon yields no discount' using errcode = 'P0001';
  end if;

  v_ceiling := public.coupon_margin_limit(p_offer_id, p_quantity);

  if v_discount > v_ceiling then
    raise exception 'Coupon discount exceeds safety margin' using errcode = 'P0001';
  end if;

  return query select v_coupon.id, v_coupon.code, v_discount;
end;
$$;

-- 4. Atomic function to redeem a balance coupon into user's wallet
create or replace function public.redeem_coupon_to_wallet(
  p_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_coupon public.coupons;
  v_uses integer := 0;
  v_wallet record;
  v_before numeric(12, 2);
  v_after numeric(12, 2);
  v_credit numeric(12, 2);
  v_redemption_id uuid := gen_random_uuid();
  v_idempotency_key uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  -- Lock coupon row for update
  select * into v_coupon
  from public.coupons
  where upper(code) = upper(btrim(p_code))
  for update;

  if v_coupon.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not v_coupon.is_active then
    return jsonb_build_object('ok', false, 'error', 'inactive');
  end if;

  if v_coupon.type <> 'balance' then
    return jsonb_build_object('ok', false, 'error', 'discount_coupon_not_for_wallet');
  end if;

  if v_coupon.valid_from is not null and timezone('utc', now()) < v_coupon.valid_from then
    return jsonb_build_object('ok', false, 'error', 'not_started');
  end if;

  if v_coupon.valid_until is not null and timezone('utc', now()) >= v_coupon.valid_until then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  if v_coupon.usage_limit is not null and v_coupon.times_used >= v_coupon.usage_limit then
    return jsonb_build_object('ok', false, 'error', 'exhausted');
  end if;

  select count(*) into v_uses
  from public.coupon_redemptions r
  where r.coupon_id = v_coupon.id
    and r.user_id = v_user_id;

  if v_uses >= coalesce(v_coupon.per_customer_limit, 1) then
    return jsonb_build_object('ok', false, 'error', 'already_redeemed');
  end if;

  -- Lock or create wallet
  select w.id, w.balance into v_wallet
  from public.wallets w
  where w.user_id = v_user_id
  for update;

  if v_wallet.id is null then
    insert into public.wallets (user_id, balance, currency)
    values (v_user_id, 0.00, 'USD')
    returning id, balance into v_wallet;
  end if;

  v_credit := v_coupon.value;
  v_before := v_wallet.balance;
  v_after := round(v_before + v_credit, 2);
  v_idempotency_key := md5('coupon_wallet:' || v_coupon.id::text || ':' || v_user_id::text || ':' || coalesce(v_coupon.times_used, 0)::text)::uuid;

  -- Append to wallet ledger
  insert into public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, idempotency_key, description, metadata
  )
  values (
    v_wallet.id, v_user_id, 'deposit', v_credit,
    v_before, v_after, 'coupon_redeem', v_coupon.id,
    v_idempotency_key,
    'Redeemed coupon ' || v_coupon.code,
    jsonb_build_object('coupon_id', v_coupon.id, 'code', v_coupon.code, 'redemption_id', v_redemption_id)
  );

  -- Update wallet balance
  update public.wallets
  set balance = v_after, version = version + 1
  where id = v_wallet.id;

  -- Record redemption
  insert into public.coupon_redemptions (
    id, coupon_id, code, user_id, order_id, amount, currency
  )
  values (
    v_redemption_id, v_coupon.id, v_coupon.code, v_user_id, null, v_credit, v_coupon.currency
  );

  -- Update coupon usage count and auto-deactivate if exhausted (e.g. 1/1 use)
  update public.coupons
  set times_used = times_used + 1,
      is_active = case
        when usage_limit is not null and (times_used + 1) >= usage_limit then false
        else is_active
      end,
      updated_at = timezone('utc', now())
  where id = v_coupon.id;

  return jsonb_build_object(
    'ok', true,
    'amount', v_credit,
    'balance_after', v_after,
    'code', v_coupon.code
  );
end;
$$;

revoke all on function public.redeem_coupon_to_wallet(text) from public, anon;
grant execute on function public.redeem_coupon_to_wallet(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- END 20261010170000_coupon_wallet_recharge.sql
-- ---------------------------------------------------------------------------

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
