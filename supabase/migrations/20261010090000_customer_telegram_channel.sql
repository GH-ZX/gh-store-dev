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
