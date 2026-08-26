-- Hoist auth out of the per-row loop, and give the search boxes an index.
--
-- Two unrelated-looking problems with the same root cause: the database was
-- written as if every predicate were free.
--
-- 1. RLS. Every policy in this schema called `auth.uid()` — and through it
--    `public.is_admin(auth.uid())` — bare, directly in `using` / `with check`.
--    Both functions are STABLE, so a bare call is legal, but the planner
--    attaches the expression to the scan and evaluates it once per candidate
--    row. `auth.uid()` parses a JWT claim out of `current_setting` and
--    `public.is_admin` is a SECURITY DEFINER function that selects from
--    `profiles`, so an admin listing 592 offers paid for 592 profile lookups
--    to answer a question whose answer cannot change mid-statement.
--
--    Wrapping the call in a scalar subquery — `(select auth.uid())` — makes it
--    an uncorrelated SubLink, which the planner turns into an InitPlan: one
--    evaluation before the scan starts, the result reused as a constant. This
--    is the documented Supabase RLS pattern and it is a pure planner hint: the
--    boolean the policy computes is bit-for-bit what it computed before.
--
--    That matters here because the policies are a security boundary. Every
--    statement below was generated from the deployed `pg_policies` rows rather
--    than from the migration history, so replaced and dropped policies (notably
--    `profiles_update_admin`, retired by 20260821020000) cannot creep back in,
--    and `using` is never confused with `with check`. 60 of the 69 live policies
--    mention `auth.uid()`; the other 9 are untouched below.
--
-- 2. Search. `catalog.service.ts` and the admin services search with
--    `column ilike '%token%'`, OR-ed across several columns of one table. A
--    leading-wildcard LIKE cannot use a btree index at all, and no GIN index
--    or `pg_trgm` existed anywhere, so every search was a sequential scan with
--    a per-row pattern match. Worse, a bitmap OR needs an index usable for
--    *every* branch: indexing `name_ar` alone would still have left the whole
--    `or(...)` on a seq scan. So each index below covers exactly the column set
--    the corresponding `or(...)` clause OR-s together — five columns for games
--    (name_ar, name_en, slug, description_ar, description_en), four for offers
--    (name_ar, name_en, slug, region_code) — as one multicolumn GIN. A
--    multicolumn GIN stores (column number, trigram) pairs, so a single index
--    scan answers the whole disjunction.
--
-- At today's row counts (offers 592, games 37, profiles 21, orders single
-- digits) none of this is measurable; a seq scan of 592 rows beats any index.
-- This is future-proofing and correctness of shape, not a fix for the current
-- page latency, which is round-trip count and cache misses, not the database.

-- ---- Part A: RLS policies, auth hoisted to an InitPlan ----------------------

-- audit_logs

drop policy if exists audit_logs_admin_select on public.audit_logs;
create policy audit_logs_admin_select
on public.audit_logs
for select
to authenticated
using ((select public.is_admin((select auth.uid()))));

-- binance_invoices

drop policy if exists binance_invoices_select_admin on public.binance_invoices;
create policy binance_invoices_select_admin
on public.binance_invoices
for select
to authenticated
using ((select public.is_admin((select auth.uid()))));

drop policy if exists binance_invoices_select_own on public.binance_invoices;
create policy binance_invoices_select_own
on public.binance_invoices
for select
to authenticated
using (user_id = (select auth.uid()));

-- categories

drop policy if exists categories_admin_all on public.categories;
create policy categories_admin_all
on public.categories
for all
to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));

-- fulfillment_attempts

drop policy if exists fulfillment_attempts_select_admin on public.fulfillment_attempts;
create policy fulfillment_attempts_select_admin
on public.fulfillment_attempts
for select
to authenticated
using ((select public.is_admin((select auth.uid()))));

drop policy if exists fulfillment_attempts_select_own on public.fulfillment_attempts;
create policy fulfillment_attempts_select_own
on public.fulfillment_attempts
for select
to authenticated
using (
  exists (
    select 1
    from public.order_items oi
      join public.orders o on o.id = oi.order_id
    where oi.id = fulfillment_attempts.order_item_id
      and o.user_id = (select auth.uid())
  )
);

-- fulfillment_events

drop policy if exists fulfillment_events_select_admin on public.fulfillment_events;
create policy fulfillment_events_select_admin
on public.fulfillment_events
for select
to authenticated
using ((select public.is_admin((select auth.uid()))));

drop policy if exists fulfillment_events_select_own on public.fulfillment_events;
create policy fulfillment_events_select_own
on public.fulfillment_events
for select
to authenticated
using (
  exists (
    select 1
    from public.fulfillment_attempts fa
      join public.order_items oi on oi.id = fa.order_item_id
      join public.orders o on o.id = oi.order_id
    where fa.id = fulfillment_events.fulfillment_attempt_id
      and o.user_id = (select auth.uid())
  )
);

-- game_input_fields

drop policy if exists game_input_fields_admin_all on public.game_input_fields;
create policy game_input_fields_admin_all
on public.game_input_fields
for all
to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));

-- game_regions

drop policy if exists game_regions_admin_all on public.game_regions;
create policy game_regions_admin_all
on public.game_regions
for all
to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));

-- games

drop policy if exists games_admin_all on public.games;
create policy games_admin_all
on public.games
for all
to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));

-- invoices

drop policy if exists invoices_select_admin on public.invoices;
create policy invoices_select_admin
on public.invoices
for select
to authenticated
using ((select public.is_admin((select auth.uid()))));

drop policy if exists invoices_select_own on public.invoices;
create policy invoices_select_own
on public.invoices
for select
to authenticated
using (user_id = (select auth.uid()));

-- notifications

drop policy if exists notifications_admin_all on public.notifications;
create policy notifications_admin_all
on public.notifications
for all
to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
on public.notifications
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
on public.notifications
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- offers

drop policy if exists offers_admin_all on public.offers;
create policy offers_admin_all
on public.offers
for all
to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));

-- order_items

drop policy if exists order_items_select_admin on public.order_items;
create policy order_items_select_admin
on public.order_items
for select
to authenticated
using ((select public.is_admin((select auth.uid()))));

drop policy if exists order_items_select_own on public.order_items;
create policy order_items_select_own
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and orders.user_id = (select auth.uid())
  )
);

-- orders

drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all
on public.orders
for all
to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));

drop policy if exists orders_select_own on public.orders;
create policy orders_select_own
on public.orders
for select
to authenticated
using (user_id = (select auth.uid()));

-- payment_attempts

drop policy if exists payment_attempts_select_admin on public.payment_attempts;
create policy payment_attempts_select_admin
on public.payment_attempts
for select
to authenticated
using ((select public.is_admin((select auth.uid()))));

drop policy if exists payment_attempts_select_own on public.payment_attempts;
create policy payment_attempts_select_own
on public.payment_attempts
for select
to authenticated
using (user_id = (select auth.uid()));

-- payment_events

drop policy if exists payment_events_select_admin on public.payment_events;
create policy payment_events_select_admin
on public.payment_events
for select
to authenticated
using ((select public.is_admin((select auth.uid()))));

-- products

drop policy if exists products_admin_all on public.products;
create policy products_admin_all
on public.products
for all
to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));

-- profiles
--
-- 20260821020000 deliberately retired profiles_update_admin so that no
-- authenticated session, admin or not, can rewrite another user's row; role
-- changes go through the service client. It is not recreated here.

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin
on public.profiles
for select
to authenticated
using ((select public.is_admin((select auth.uid()))));

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- provider_game_mappings

drop policy if exists provider_game_mappings_admin_all on public.provider_game_mappings;
create policy provider_game_mappings_admin_all
on public.provider_game_mappings
for all
to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));

-- provider_offer_mappings

drop policy if exists provider_offer_mappings_admin_all on public.provider_offer_mappings;
create policy provider_offer_mappings_admin_all
on public.provider_offer_mappings
for all
to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));

-- provider_product_mappings

drop policy if exists provider_product_mappings_admin_all on public.provider_product_mappings;
create policy provider_product_mappings_admin_all
on public.provider_product_mappings
for all
to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));

-- provider_sync_logs

drop policy if exists provider_sync_logs_admin_all on public.provider_sync_logs;
create policy provider_sync_logs_admin_all
on public.provider_sync_logs
for all
to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));

-- provider_wallet_balances

drop policy if exists provider_wallets_admin_all on public.provider_wallet_balances;
create policy provider_wallets_admin_all
on public.provider_wallet_balances
for all
to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));

-- recharge_requests

drop policy if exists recharge_requests_admin_all on public.recharge_requests;
create policy recharge_requests_admin_all
on public.recharge_requests
for all
to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));

drop policy if exists recharge_requests_insert_own on public.recharge_requests;
create policy recharge_requests_insert_own
on public.recharge_requests
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
);

drop policy if exists recharge_requests_select_admin on public.recharge_requests;
create policy recharge_requests_select_admin
on public.recharge_requests
for select
to authenticated
using ((select public.is_admin((select auth.uid()))));

drop policy if exists recharge_requests_select_own on public.recharge_requests;
create policy recharge_requests_select_own
on public.recharge_requests
for select
to authenticated
using (user_id = (select auth.uid()));

-- reviews

drop policy if exists reviews_admin_all on public.reviews;
create policy reviews_admin_all
on public.reviews
for all
to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));

drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own
on public.reviews
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and is_featured = false
);

drop policy if exists reviews_select_own on public.reviews;
create policy reviews_select_own
on public.reviews
for select
to authenticated
using (user_id = (select auth.uid()));

-- sam_invoices

drop policy if exists sam_invoices_select_admin on public.sam_invoices;
create policy sam_invoices_select_admin
on public.sam_invoices
for select
to authenticated
using ((select public.is_admin((select auth.uid()))));

drop policy if exists sam_invoices_select_own on public.sam_invoices;
create policy sam_invoices_select_own
on public.sam_invoices
for select
to authenticated
using (user_id = (select auth.uid()));

-- store_settings

drop policy if exists store_settings_admin_all on public.store_settings;
create policy store_settings_admin_all
on public.store_settings
for all
to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));

-- support_messages

drop policy if exists support_messages_admin_all on public.support_messages;
create policy support_messages_admin_all
on public.support_messages
for all
to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));

drop policy if exists support_messages_insert_own on public.support_messages;
create policy support_messages_insert_own
on public.support_messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and sender_role = 'customer'
  and exists (
    select 1
    from public.support_threads
    where support_threads.id = support_messages.thread_id
      and support_threads.user_id = (select auth.uid())
  )
);

drop policy if exists support_messages_select_own on public.support_messages;
create policy support_messages_select_own
on public.support_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.support_threads
    where support_threads.id = support_messages.thread_id
      and support_threads.user_id = (select auth.uid())
  )
);

-- support_threads

drop policy if exists support_threads_admin_all on public.support_threads;
create policy support_threads_admin_all
on public.support_threads
for all
to authenticated
using ((select public.is_admin((select auth.uid()))))
with check ((select public.is_admin((select auth.uid()))));

drop policy if exists support_threads_insert_own on public.support_threads;
create policy support_threads_insert_own
on public.support_threads
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'open'
);

drop policy if exists support_threads_select_own on public.support_threads;
create policy support_threads_select_own
on public.support_threads
for select
to authenticated
using (user_id = (select auth.uid()));

-- telegram_chat_links

drop policy if exists telegram_chat_links_delete_own on public.telegram_chat_links;
create policy telegram_chat_links_delete_own
on public.telegram_chat_links
for delete
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists telegram_chat_links_select_own on public.telegram_chat_links;
create policy telegram_chat_links_select_own
on public.telegram_chat_links
for select
to authenticated
using (user_id = (select auth.uid()));

-- telegram_link_codes

drop policy if exists telegram_link_codes_insert_own on public.telegram_link_codes;
create policy telegram_link_codes_insert_own
on public.telegram_link_codes
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists telegram_link_codes_select_own on public.telegram_link_codes;
create policy telegram_link_codes_select_own
on public.telegram_link_codes
for select
to authenticated
using (user_id = (select auth.uid()));

-- wallet_transactions

drop policy if exists wallet_transactions_select_admin on public.wallet_transactions;
create policy wallet_transactions_select_admin
on public.wallet_transactions
for select
to authenticated
using ((select public.is_admin((select auth.uid()))));

drop policy if exists wallet_transactions_select_own on public.wallet_transactions;
create policy wallet_transactions_select_own
on public.wallet_transactions
for select
to authenticated
using (user_id = (select auth.uid()));

-- wallets

drop policy if exists wallets_select_admin on public.wallets;
create policy wallets_select_admin
on public.wallets
for select
to authenticated
using ((select public.is_admin((select auth.uid()))));

drop policy if exists wallets_select_own on public.wallets;
create policy wallets_select_own
on public.wallets
for select
to authenticated
using (user_id = (select auth.uid()));

-- storage.objects
--
-- These three are this project's own, created by 20260812004000 for the
-- public `product-images` bucket; the admin write paths call `is_admin` per
-- object, which is the worst case of the pattern above when the media library
-- lists a page of uploads. `product_images_public_read` is left alone: it has
-- no auth call to hoist. Nothing Supabase-managed is touched.

drop policy if exists product_images_admin_insert on storage.objects;
create policy product_images_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (select public.is_admin((select auth.uid())))
);

drop policy if exists product_images_admin_update on storage.objects;
create policy product_images_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-images'
  and (select public.is_admin((select auth.uid())))
)
with check (
  bucket_id = 'product-images'
  and (select public.is_admin((select auth.uid())))
);

drop policy if exists product_images_admin_delete on storage.objects;
create policy product_images_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and (select public.is_admin((select auth.uid())))
);

-- ---- Part B: trigram search indexes ----------------------------------------
--
-- Extensions live in the `extensions` schema on this project (pg_stat_statements,
-- uuid-ossp, pgcrypto all sit there), so pg_trgm joins them rather than
-- polluting `public`. The operator class is spelled out schema-qualified below
-- because `extensions` is only on the search_path by role convention, and an
-- index definition that depends on the caller's search_path is a trap.

create extension if not exists pg_trgm with schema extensions;

-- One multicolumn GIN per `or(...)` clause. The column list must be a superset
-- of the OR-ed columns or the planner falls back to a sequential scan for the
-- whole disjunction: an index on name_ar alone cannot help
-- `name_ar ilike ? or description_en ilike ?`.

create index if not exists games_search_trgm_idx
  on public.games
  using gin (
    name_ar extensions.gin_trgm_ops,
    name_en extensions.gin_trgm_ops,
    slug extensions.gin_trgm_ops,
    description_ar extensions.gin_trgm_ops,
    description_en extensions.gin_trgm_ops
  );

create index if not exists offers_search_trgm_idx
  on public.offers
  using gin (
    name_ar extensions.gin_trgm_ops,
    name_en extensions.gin_trgm_ops,
    slug extensions.gin_trgm_ops,
    region_code extensions.gin_trgm_ops
  );

create index if not exists profiles_search_trgm_idx
  on public.profiles
  using gin (
    email extensions.gin_trgm_ops,
    full_name extensions.gin_trgm_ops,
    username extensions.gin_trgm_ops
  );

-- Order lookup searches order_number on its own, so a single-column GIN. The
-- existing orders_order_number_key btree serves exact lookups and is kept; it
-- cannot answer a leading wildcard.

create index if not exists orders_order_number_trgm_idx
  on public.orders
  using gin (order_number extensions.gin_trgm_ops);

-- ---- Part B: hot-path btree indexes ----------------------------------------

-- The admin order list filters on payment_status and sorts newest-first.
-- orders_status_created_idx covers the fulfilment `status` column, not this one.
create index if not exists orders_payment_status_created_idx
  on public.orders (payment_status, created_at desc);

-- order_items had only order_id; the operations feed reads recent line items
-- across all orders.
create index if not exists order_items_created_idx
  on public.order_items (created_at desc);

-- profiles carried nothing but its primary key. The customer list filters by
-- role and sorts newest-first; the composite serves a bare `role =` filter too,
-- since role leads it.
create index if not exists profiles_role_created_idx
  on public.profiles (role, created_at desc);

create index if not exists profiles_created_idx
  on public.profiles (created_at desc);

-- The storefront reads active rows in sort order. The existing composites lead
-- with category_id / game_id / product_id, so an unscoped active listing had no
-- usable index. Shaped like categories_active_sort_idx, which already does this.
create index if not exists games_active_sort_idx
  on public.games (is_active, sort_order, name_en);

create index if not exists offers_active_sort_idx
  on public.offers (is_active, sort_order, name_en);

create index if not exists offers_offer_type_idx
  on public.offers (offer_type);

-- Deliberately not created: provider_offer_mappings (provider_name) and
-- provider_game_mappings (provider_name). Both tables already carry a unique
-- index whose leading column is provider_name — (provider_name,
-- external_product_id, external_catalogue_name) and (provider_name,
-- external_game_code) — which a `provider_name =` filter uses directly. A
-- second index would only add write cost.
