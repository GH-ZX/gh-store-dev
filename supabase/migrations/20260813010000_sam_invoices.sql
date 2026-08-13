-- Sam API wallet top-ups.
--
-- A customer asks to top up, we create an invoice with Sam API, and they send
-- money to the store's own ShamCash or Syriatel wallet through it. Sam is then
-- the authority on whether the money arrived: unlike a manual transfer, the
-- server can ask. That is what makes automatic crediting defensible here, and
-- everything below exists to make sure a payment credits once, for the right
-- amount, to the person who opened the invoice.
--
-- Deliberate differences from the older store this replaces:
--
--   * The crediting function is granted to `service_role` only, and `execute` is
--     revoked from `public`. In the old store an authenticated customer could
--     call the equivalent function directly and be credited without paying.
--   * The paid amount is compared against the invoice amount. The old webhook
--     compared only the invoice id, currency and method, so a cheaper payment —
--     or a payload naming someone else's invoice — was accepted in full.
--   * The credited account is the `user_id` recorded when the invoice was
--     created, never a value taken from the provider's payload.
--   * Crediting requires a status that has not settled yet, so a replayed
--     callback is a no-op rather than a second credit.

create table if not exists public.sam_invoices (
  id uuid primary key default gen_random_uuid(),

  -- Bound at creation. Crediting uses this, so a forged callback cannot
  -- redirect someone else's payment into the caller's wallet.
  user_id uuid not null references public.profiles (id) on delete restrict,

  /*
   * The customer-visible request this invoice settles. Required: every top-up
   * gets a request first, so the reference, the account history and the review
   * queue read the same for a Sam payment as for a manual one, and crediting has
   * exactly one route into the wallet.
   */
  recharge_request_id uuid not null references public.recharge_requests (id) on delete restrict,

  -- Sam's own identifier. Unique, so the same payment cannot be recorded twice.
  sam_invoice_id text not null unique,

  payment_method text not null check (payment_method in ('shamcash', 'syriatel')),

  -- What the wallet is credited on success, in store currency.
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'USD',

  -- What the customer actually pays through Sam, which may be another currency.
  charge_amount numeric(14, 2),
  charge_currency text,

  status text not null default 'pending' check (
    status in ('pending', 'paid', 'credited', 'awaiting_review', 'failed', 'expired', 'cancelled')
  ),

  payment_url text,
  transaction_ref text,

  -- Trimmed provider responses, kept for disputes.
  provider_payload jsonb not null default '{}'::jsonb,

  paid_at timestamptz,
  credited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sam_invoices_user_idx on public.sam_invoices (user_id, created_at desc);
create index if not exists sam_invoices_status_idx on public.sam_invoices (status, created_at desc);
create index if not exists sam_invoices_request_idx on public.sam_invoices (recharge_request_id);

alter table public.sam_invoices enable row level security;

-- A customer may watch their own invoice — the payment screen polls it — and
-- nothing more. Rows are written by the server with service authority, so there
-- is no insert or update policy for `authenticated` at all.
drop policy if exists sam_invoices_select_own on public.sam_invoices;
create policy sam_invoices_select_own on public.sam_invoices
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists sam_invoices_select_admin on public.sam_invoices;
create policy sam_invoices_select_admin on public.sam_invoices
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

grant select on public.sam_invoices to authenticated;

/*
 * Credit a paid invoice, exactly once.
 *
 * The caller must already have confirmed with Sam that the invoice is paid and
 * must pass the amount Sam reported. This function does not trust that amount
 * blindly — it refuses anything short of what the invoice asked for — and it
 * credits the account recorded on the invoice row.
 *
 * Returns `idempotent = true` when the invoice had already settled, so a
 * replayed callback reports success without moving money a second time.
 */
create or replace function public.credit_sam_invoice(
  p_sam_invoice_id text,
  p_paid_amount numeric default null,
  p_charge_currency text default null,
  p_transaction_ref text default null,
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
  if p_sam_invoice_id is null or length(trim(p_sam_invoice_id)) = 0 then
    raise exception 'Invoice reference required';
  end if;

  -- Lock first: two callbacks arriving together must not both pass the checks.
  select i.* into v_invoice
  from public.sam_invoices i
  where i.sam_invoice_id = trim(p_sam_invoice_id)
  for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found';
  end if;

  -- Already settled — report the existing outcome instead of crediting again.
  if v_invoice.status in ('credited', 'failed', 'expired', 'cancelled') then
    return query
    select
      coalesce(v_invoice.amount, 0)::numeric,
      coalesce((select w.balance from public.wallets w where w.user_id = v_invoice.user_id), 0)::numeric,
      true,
      v_invoice.status;
    return;
  end if;

  /*
   * The amount check the old store was missing. A payment for less than the
   * invoice must not credit the invoice's full value, and passing null means the
   * caller could not establish an amount — which is not good enough to credit.
   */
  if p_paid_amount is null then
    raise exception 'Paid amount required';
  end if;

  if p_paid_amount < v_invoice.amount then
    raise exception 'Paid amount % is short of the invoice amount %', p_paid_amount, v_invoice.amount;
  end if;

  update public.sam_invoices
  set
    status = 'credited',
    charge_amount = p_paid_amount,
    charge_currency = coalesce(p_charge_currency, charge_currency),
    transaction_ref = coalesce(p_transaction_ref, transaction_ref),
    provider_payload = coalesce(p_payload, provider_payload),
    paid_at = coalesce(paid_at, now()),
    credited_at = now(),
    updated_at = now()
  where id = v_invoice.id;

  /*
   * Money reaches the wallet only through the existing recharge crediting, so a
   * Sam payment produces the same reference, history row and wallet transaction
   * as any other top-up. Both functions are service-only, and
   * `credit_recharge_request` is itself idempotent.
   */
  select c.credited, c.balance, c.idempotent
  into v_result
  from public.credit_recharge_request(
    v_invoice.recharge_request_id,
    v_invoice.amount,
    'Paid through Sam API · ' || v_invoice.payment_method,
    null
  ) c;

  return query select v_result.credited, v_result.balance, false, 'credited'::text;
end;
$$;

/*
 * Record that Sam confirmed payment while leaving the money for the owner.
 *
 * Used when the owner has asked to review Sam top-ups themselves. The invoice is
 * marked paid and the linked request moves to `processing`, so it appears in the
 * review queue with the payment already evidenced.
 */
create or replace function public.mark_sam_invoice_paid(
  p_sam_invoice_id text,
  p_paid_amount numeric default null,
  p_charge_currency text default null,
  p_transaction_ref text default null,
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
  from public.sam_invoices i
  where i.sam_invoice_id = trim(coalesce(p_sam_invoice_id, ''))
  for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found';
  end if;

  if v_invoice.status in ('credited', 'failed', 'expired', 'cancelled') then
    return query select v_invoice.status;
    return;
  end if;

  update public.sam_invoices
  set
    status = 'awaiting_review',
    charge_amount = coalesce(p_paid_amount, charge_amount),
    charge_currency = coalesce(p_charge_currency, charge_currency),
    transaction_ref = coalesce(p_transaction_ref, transaction_ref),
    provider_payload = coalesce(p_payload, provider_payload),
    paid_at = coalesce(paid_at, now()),
    updated_at = now()
  where id = v_invoice.id;

  update public.recharge_requests
  set status = 'processing', updated_at = now()
  where id = v_invoice.recharge_request_id
    and status in ('pending', 'payment_sent');

  return query select 'awaiting_review'::text;
end;
$$;

/*
 * Close an invoice that will not be paid.
 *
 * Never touches one that already credited, so a late failure callback cannot
 * undo a good payment.
 */
create or replace function public.fail_sam_invoice(
  p_sam_invoice_id text,
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
  v_status text := coalesce(nullif(trim(p_status), ''), 'failed');
begin
  if v_status not in ('failed', 'expired', 'cancelled') then
    raise exception 'Unsupported invoice status %', v_status;
  end if;

  select i.* into v_invoice
  from public.sam_invoices i
  where i.sam_invoice_id = trim(coalesce(p_sam_invoice_id, ''))
  for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found';
  end if;

  if v_invoice.status in ('credited', 'awaiting_review') then
    return query select v_invoice.status;
    return;
  end if;

  update public.sam_invoices
  set
    status = v_status,
    provider_payload = coalesce(p_payload, provider_payload),
    updated_at = now()
  where id = v_invoice.id;

  return query select v_status;
end;
$$;

-- Money-moving functions are for the server alone. The old store left the
-- equivalents callable by any signed-in customer, which is a way to be credited
-- without paying; these revokes are the point of this block.
revoke all on function public.credit_sam_invoice(text, numeric, text, text, jsonb) from public;
revoke all on function public.credit_sam_invoice(text, numeric, text, text, jsonb) from anon;
revoke all on function public.credit_sam_invoice(text, numeric, text, text, jsonb) from authenticated;
grant execute on function public.credit_sam_invoice(text, numeric, text, text, jsonb) to service_role;

revoke all on function public.mark_sam_invoice_paid(text, numeric, text, text, jsonb) from public;
revoke all on function public.mark_sam_invoice_paid(text, numeric, text, text, jsonb) from anon;
revoke all on function public.mark_sam_invoice_paid(text, numeric, text, text, jsonb) from authenticated;
grant execute on function public.mark_sam_invoice_paid(text, numeric, text, text, jsonb) to service_role;

revoke all on function public.fail_sam_invoice(text, text, jsonb) from public;
revoke all on function public.fail_sam_invoice(text, text, jsonb) from anon;
revoke all on function public.fail_sam_invoice(text, text, jsonb) from authenticated;
grant execute on function public.fail_sam_invoice(text, text, jsonb) to service_role;

/*
 * Presentation-safe Sam configuration for the top-up screen.
 *
 * Returns only what a customer needs to be shown — whether the option exists and
 * which methods are on — and never the API key. `store_settings.providers` stays
 * unreadable by customers, exactly as with the supplier key.
 */
create or replace function public.get_sam_payment_options()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_build_object(
      'enabled', coalesce((s.providers -> 'sam' ->> 'enabled')::boolean, false)
        and coalesce(length(trim(s.providers -> 'sam' ->> 'api_key')) > 0, false),
      'methods', coalesce(s.providers -> 'sam' -> 'methods', '[]'::jsonb),
      'invoice_currency', coalesce(s.providers -> 'sam' ->> 'invoice_currency', 'USD'),
      'manual_review', coalesce((s.providers -> 'sam' ->> 'manual_review')::boolean, false)
    ),
    '{}'::jsonb
  )
  from public.store_settings s
  where s.id = 'global';
$$;

grant execute on function public.get_sam_payment_options() to anon, authenticated, service_role;

comment on table public.sam_invoices is
  'Sam API payment attempts. Crediting is service-only, amount-checked and bound to the user recorded at creation.';
