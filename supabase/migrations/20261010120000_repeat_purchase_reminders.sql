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
