-- Binance Pay wallet top-ups.
--
-- Built on the same spine as `sam_invoices`, and deliberately so: a customer
-- asks to top up, an invoice is opened with the provider, and the provider is
-- then the authority on whether the money arrived. Every rule that made the Sam
-- path safe applies here for the same reasons, so they are repeated rather than
-- relaxed:
--
--   * Crediting is granted to `service_role` only and revoked from `public`, so
--     no customer session can call it and credit itself.
--   * The credited account is the `user_id` recorded when the invoice was
--     opened, never a value read out of a provider payload.
--   * Crediting requires a status that has not settled, so a replayed callback
--     is a no-op rather than a second credit.
--   * Money reaches the wallet only through `credit_recharge_request`, so a
--     crypto top-up produces the same reference, history row and wallet
--     transaction as a manual transfer.
--
-- One difference from Sam, and it is the reason the amount columns are split.
-- Sam bills in the store's own currency or a fixed-rate conversion of it;
-- Binance bills in crypto. So `amount` is what the wallet gets in USD and
-- `charge_amount`/`charge_currency` are what the customer actually pays — and
-- the short-payment check runs against the charge, because that is the figure
-- the customer was quoted and the only one Binance reports back.

create table if not exists public.binance_invoices (
  id uuid primary key default gen_random_uuid(),

  -- Bound at creation, so a forged callback cannot redirect someone else's
  -- payment into the caller's wallet.
  user_id uuid not null references public.profiles (id) on delete restrict,

  -- Every top-up gets a customer-visible request first, exactly as the manual
  -- and Sam paths do, so crediting has one route into the wallet.
  recharge_request_id uuid not null references public.recharge_requests (id) on delete restrict,

  /*
   * Our own trade number, derived from the request id with the dashes removed —
   * Binance permits only letters and digits. Unique, which is what makes a
   * repeated "pay" reach one invoice instead of opening a second.
   */
  merchant_trade_no text not null unique,

  -- Binance's identifier for the same order, known only after it is created.
  prepay_id text,

  -- What the wallet is credited on success, in store currency.
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'USD',

  -- What the customer is billed, in crypto.
  charge_amount numeric(20, 8) not null check (charge_amount > 0),
  charge_currency text not null,

  status text not null default 'pending' check (
    status in ('pending', 'paid', 'credited', 'failed', 'expired', 'cancelled')
  ),

  checkout_url text,
  transaction_id text,

  -- Trimmed provider responses, kept for disputes.
  provider_payload jsonb not null default '{}'::jsonb,

  paid_at timestamptz,
  credited_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists binance_invoices_user_idx
  on public.binance_invoices (user_id, created_at desc);
create index if not exists binance_invoices_status_idx
  on public.binance_invoices (status, created_at desc);
create index if not exists binance_invoices_request_idx
  on public.binance_invoices (recharge_request_id);

alter table public.binance_invoices enable row level security;

-- A customer may watch their own invoice — the payment screen polls it — and
-- nothing more. Rows are written with service authority, so there is no insert
-- or update policy for `authenticated` at all.
drop policy if exists binance_invoices_select_own on public.binance_invoices;
create policy binance_invoices_select_own on public.binance_invoices
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists binance_invoices_select_admin on public.binance_invoices;
create policy binance_invoices_select_admin on public.binance_invoices
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

grant select on public.binance_invoices to authenticated;

/*
 * Credit a paid invoice, exactly once.
 *
 * The caller must already have asked Binance whether the order is paid — the
 * callback's own claim is never enough, because its body shape is the one part
 * of that API this store could not verify from the published documentation.
 *
 * Returns `idempotent = true` when the invoice had already settled, so a
 * replayed notification reports success without moving money a second time.
 */
create or replace function public.credit_binance_invoice(
  p_merchant_trade_no text,
  p_paid_amount numeric default null,
  p_transaction_id text default null,
  p_payload jsonb default null
)
returns table (credited numeric, balance numeric, idempotent boolean, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice record;
  v_result record;
begin
  if p_merchant_trade_no is null or length(trim(p_merchant_trade_no)) = 0 then
    raise exception 'Invoice reference required';
  end if;

  -- Lock first: two callbacks arriving together must not both pass the checks.
  select i.* into v_invoice
  from public.binance_invoices i
  where i.merchant_trade_no = trim(p_merchant_trade_no)
  for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found';
  end if;

  if v_invoice.status in ('credited', 'failed', 'expired', 'cancelled') then
    return query
    select
      coalesce(v_invoice.amount, 0)::numeric,
      coalesce((select w.balance from public.wallets w where w.user_id = v_invoice.user_id), 0)::numeric,
      true,
      v_invoice.status;
    return;
  end if;

  if p_paid_amount is null then
    raise exception 'Paid amount required';
  end if;

  /*
   * Compared against the crypto figure the customer was quoted, not the wallet
   * credit. A tolerance of one satoshi-ish unit is allowed because crypto
   * amounts carry eight decimal places and a provider rounding at the last one
   * must not hold up a payment that plainly arrived.
   */
  if p_paid_amount < v_invoice.charge_amount - 0.00000001 then
    raise exception 'Paid amount % is short of the invoice amount %',
      p_paid_amount, v_invoice.charge_amount;
  end if;

  update public.binance_invoices
  set
    status = 'credited',
    transaction_id = coalesce(p_transaction_id, transaction_id),
    provider_payload = coalesce(p_payload, provider_payload),
    paid_at = coalesce(paid_at, now()),
    credited_at = now(),
    updated_at = now()
  where id = v_invoice.id;

  select c.credited, c.balance, c.idempotent
  into v_result
  from public.credit_recharge_request(
    v_invoice.recharge_request_id,
    v_invoice.amount,
    'Paid through Binance Pay · ' || v_invoice.charge_currency,
    null
  ) c;

  return query select v_result.credited, v_result.balance, false, 'credited'::text;
end;
$$;

revoke all on function public.credit_binance_invoice(text, numeric, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.credit_binance_invoice(text, numeric, text, jsonb) to service_role;

/*
 * Close an invoice that will never be paid.
 *
 * Separate from crediting and equally service-only. An expired or cancelled
 * order is not a failure worth alarming anybody about, but leaving it `pending`
 * for ever would keep it in every "waiting for payment" view the store has.
 */
create or replace function public.fail_binance_invoice(
  p_merchant_trade_no text,
  p_status text default 'failed',
  p_payload jsonb default null
)
returns table (status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice record;
begin
  select i.* into v_invoice
  from public.binance_invoices i
  where i.merchant_trade_no = trim(p_merchant_trade_no)
  for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found';
  end if;

  -- A settled invoice keeps its outcome; nothing here may undo a credit.
  if v_invoice.status in ('credited', 'failed', 'expired', 'cancelled') then
    return query select v_invoice.status;
    return;
  end if;

  update public.binance_invoices
  set status = case when p_status in ('failed', 'expired', 'cancelled') then p_status else 'failed' end,
      provider_payload = coalesce(p_payload, provider_payload),
      updated_at = now()
  where id = v_invoice.id;

  return query select (select i.status from public.binance_invoices i where i.id = v_invoice.id);
end;
$$;

revoke all on function public.fail_binance_invoice(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.fail_binance_invoice(text, text, jsonb) to service_role;
