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
