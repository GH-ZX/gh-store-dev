-- Close stock_items to anon and authenticated.
--
-- 20260827000000 created the table's only policy with the comment "only service
-- role touches stock_items" and then wrote:
--
--   create policy "Service role full access on stock_items"
--     on public.stock_items for all using (true) with check (true);
--
-- A `create policy` with no `to` clause defaults to PUBLIC, so what shipped was
-- not "service role full access" but "everyone full access": anon and
-- authenticated got select, insert, update and delete on every row. That table's
-- `content` column holds the delivered goods themselves — the codes, keys and
-- account credentials handed to buyers — and the publishable key that reaches
-- the `anon` role is in the browser bundle by design. Verified against the live
-- database with that key: the request returned 200, not 401. The table happened
-- to be empty, so nothing leaked, but every code loaded into it from now on
-- would have been readable and deletable by anyone.
--
-- The intent in that comment is the right one and nothing depends on the
-- accidental grant. Every reader and writer goes through the service-role client
-- (`stock.service.ts`, reached from the dashboard catalog page and its actions),
-- and `service_role` bypasses RLS outright rather than matching a policy; the
-- checkout path claims inventory through `claim_stock_item`, which is SECURITY
-- DEFINER and likewise never consults this policy. So restricting the policy to
-- `service_role` removes the grant without removing any working code path — it
-- only makes the deny explicit for the roles that should never have had it.
--
-- The name is also normalised to this schema's snake_case convention while we
-- are replacing it.
--
-- An audit of every other policy granting to public/anon found no second
-- instance: the remaining eight are all `for select` on genuinely public
-- storefront data (games, offers, products, categories, game_regions,
-- game_input_fields, approved reviews, and the public product-images bucket).
-- Every table in `public` has row level security enabled; the four with no
-- policies at all — idempotency_keys, telegram_alerts, telegram_chat_prefs,
-- telegram_link_attempts — fail closed, since RLS with no permissive policy
-- denies every non-superuser role regardless of table grants.

drop policy if exists "Service role full access on stock_items" on public.stock_items;
drop policy if exists stock_items_service_role_all on public.stock_items;

create policy stock_items_service_role_all
on public.stock_items
for all
to service_role
using (true)
with check (true);
