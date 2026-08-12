create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  balance numeric(12, 2) not null default 0 check (balance >= 0),
  currency text not null default 'USD' check (currency in ('USD', 'SYP', 'EUR')),
  version bigint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  type text not null check (type in ('deposit', 'purchase', 'refund', 'adjustment', 'withdrawal')),
  amount numeric(12, 2) not null check (amount <> 0),
  balance_before numeric(12, 2) not null check (balance_before >= 0),
  balance_after numeric(12, 2) not null check (balance_after >= 0),
  reference_type text,
  reference_id uuid,
  idempotency_key uuid unique,
  payment_method text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.recharge_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reference text not null unique,
  requested_amount numeric(12, 2) not null check (requested_amount > 0),
  requested_currency text not null default 'USD'
    check (requested_currency in ('USD', 'SYP', 'EUR')),
  wallet_credit_amount numeric(12, 2) check (wallet_credit_amount is null or wallet_credit_amount > 0),
  exchange_rate numeric(12, 4) check (exchange_rate is null or exchange_rate > 0),
  payment_method text not null,
  status text not null default 'pending'
    check (status in ('pending', 'payment_sent', 'processing', 'approved', 'rejected', 'expired', 'cancelled')),
  admin_note text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  entity_type text not null check (entity_type in ('recharge', 'order')),
  entity_id uuid not null,
  provider text not null,
  external_payment_id text,
  payment_url text,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency in ('USD', 'SYP', 'EUR')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'paid', 'failed', 'expired', 'cancelled')),
  transaction_reference text,
  idempotency_key uuid unique,
  expires_at timestamptz,
  paid_at timestamptz,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (provider, external_payment_id)
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  payment_attempt_id uuid references public.payment_attempts (id) on delete set null,
  amount numeric(12, 2),
  currency text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  processing_error text,
  received_at timestamptz not null default timezone('utc', now()),
  unique (provider, external_event_id)
);

create index if not exists wallets_user_idx
  on public.wallets (user_id);
create index if not exists wallet_transactions_user_created_idx
  on public.wallet_transactions (user_id, created_at desc);
create index if not exists wallet_transactions_reference_idx
  on public.wallet_transactions (reference_type, reference_id);
create index if not exists recharge_requests_user_status_idx
  on public.recharge_requests (user_id, status, created_at desc);
create index if not exists recharge_requests_status_created_idx
  on public.recharge_requests (status, created_at desc);
create index if not exists payment_attempts_entity_idx
  on public.payment_attempts (entity_type, entity_id, created_at desc);
create index if not exists payment_attempts_user_status_idx
  on public.payment_attempts (user_id, status, created_at desc);
create index if not exists payment_events_entity_idx
  on public.payment_events (entity_type, entity_id, received_at desc);

drop trigger if exists wallets_set_updated_at on public.wallets;
create trigger wallets_set_updated_at
before update on public.wallets
for each row
execute function public.set_updated_at();

drop trigger if exists recharge_requests_set_updated_at on public.recharge_requests;
create trigger recharge_requests_set_updated_at
before update on public.recharge_requests
for each row
execute function public.set_updated_at();

drop trigger if exists payment_attempts_set_updated_at on public.payment_attempts;
create trigger payment_attempts_set_updated_at
before update on public.payment_attempts
for each row
execute function public.set_updated_at();

insert into public.wallets (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), '')
  )
  on conflict (id) do update
  set email = excluded.email;

  insert into public.wallets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.recharge_requests enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.payment_events enable row level security;

drop policy if exists wallets_select_own on public.wallets;
create policy wallets_select_own
on public.wallets
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists wallets_select_admin on public.wallets;
create policy wallets_select_admin
on public.wallets
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists wallet_transactions_select_own on public.wallet_transactions;
create policy wallet_transactions_select_own
on public.wallet_transactions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists wallet_transactions_select_admin on public.wallet_transactions;
create policy wallet_transactions_select_admin
on public.wallet_transactions
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists recharge_requests_select_own on public.recharge_requests;
create policy recharge_requests_select_own
on public.recharge_requests
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists recharge_requests_insert_own on public.recharge_requests;
create policy recharge_requests_insert_own
on public.recharge_requests
for insert
to authenticated
with check (user_id = auth.uid() and status = 'pending');

drop policy if exists recharge_requests_select_admin on public.recharge_requests;
create policy recharge_requests_select_admin
on public.recharge_requests
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists recharge_requests_admin_all on public.recharge_requests;
create policy recharge_requests_admin_all
on public.recharge_requests
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists payment_attempts_select_own on public.payment_attempts;
create policy payment_attempts_select_own
on public.payment_attempts
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists payment_attempts_select_admin on public.payment_attempts;
create policy payment_attempts_select_admin
on public.payment_attempts
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists payment_events_select_admin on public.payment_events;
create policy payment_events_select_admin
on public.payment_events
for select
to authenticated
using (public.is_admin(auth.uid()));

create or replace function public.credit_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_idempotency_key uuid default null,
  p_description text default null
)
returns table (
  wallet_id uuid,
  balance numeric,
  transaction_id uuid,
  idempotent boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_id uuid;
  v_before numeric(12, 2);
  v_after numeric(12, 2);
  v_transaction_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Wallet credit amount must be positive';
  end if;

  if p_idempotency_key is not null then
    select wt.wallet_id, wt.balance_after, wt.id, true
    into wallet_id, balance, transaction_id, idempotent
    from public.wallet_transactions wt
    where wt.idempotency_key = p_idempotency_key;

    if found then
      return next;
      return;
    end if;
  end if;

  select w.id, w.balance
  into v_wallet_id, v_before
  from public.wallets w
  where w.user_id = p_user_id
  for update;

  if v_wallet_id is null then
    raise exception 'Wallet not found';
  end if;

  v_after := v_before + p_amount;

  update public.wallets
  set balance = v_after,
      version = version + 1
  where id = v_wallet_id;

  insert into public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, idempotency_key, description
  )
  values (
    v_wallet_id, p_user_id, 'deposit', p_amount, v_before, v_after,
    p_reference_type, p_reference_id, p_idempotency_key, p_description
  )
  returning id into v_transaction_id;

  return query select v_wallet_id, v_after, v_transaction_id, false;
end;
$$;

create or replace function public.debit_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_idempotency_key uuid default null,
  p_description text default null
)
returns table (
  wallet_id uuid,
  balance numeric,
  transaction_id uuid,
  idempotent boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_id uuid;
  v_before numeric(12, 2);
  v_after numeric(12, 2);
  v_transaction_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Wallet debit amount must be positive';
  end if;

  if p_idempotency_key is not null then
    select wt.wallet_id, wt.balance_after, wt.id, true
    into wallet_id, balance, transaction_id, idempotent
    from public.wallet_transactions wt
    where wt.idempotency_key = p_idempotency_key;

    if found then
      return next;
      return;
    end if;
  end if;

  select w.id, w.balance
  into v_wallet_id, v_before
  from public.wallets w
  where w.user_id = p_user_id
  for update;

  if v_wallet_id is null then
    raise exception 'Wallet not found';
  end if;

  if v_before < p_amount then
    raise exception 'Insufficient wallet balance';
  end if;

  v_after := v_before - p_amount;

  update public.wallets
  set balance = v_after,
      version = version + 1
  where id = v_wallet_id;

  insert into public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, idempotency_key, description
  )
  values (
    v_wallet_id, p_user_id, 'purchase', -p_amount, v_before, v_after,
    p_reference_type, p_reference_id, p_idempotency_key, p_description
  )
  returning id into v_transaction_id;

  return query select v_wallet_id, v_after, v_transaction_id, false;
end;
$$;

revoke all on function public.credit_wallet(uuid, numeric, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.debit_wallet(uuid, numeric, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.credit_wallet(uuid, numeric, text, uuid, uuid, text) to service_role;
grant execute on function public.debit_wallet(uuid, numeric, text, uuid, uuid, text) to service_role;

grant select on public.wallets, public.wallet_transactions, public.recharge_requests,
  public.payment_attempts to authenticated;
grant insert on public.recharge_requests to authenticated;
grant select, insert, update, delete on public.recharge_requests to authenticated;
