-- Report nothing credited when nothing was credited.
--
-- A settled invoice returns its existing status instead of raising, which is what
-- makes a replayed callback harmless. But the previous version returned the
-- invoice amount as `credited` in that reply, including for an invoice closed as
-- failed or expired — so a caller reading the number rather than the status would
-- conclude money had moved. Only a genuine credit now reports an amount.

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
  v_expected numeric(14, 2);
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

  if v_invoice.status in ('credited', 'failed', 'expired', 'cancelled') then
    return query
    select
      -- An amount only when this invoice actually credited.
      case when v_invoice.status = 'credited' then coalesce(v_invoice.amount, 0) else 0 end::numeric,
      coalesce((select w.balance from public.wallets w where w.user_id = v_invoice.user_id), 0)::numeric,
      true,
      v_invoice.status;
    return;
  end if;

  /*
   * `p_paid_amount` is what Sam reports as paid, in the billed currency, so it is
   * held against the billed figure. A null means the caller could not establish an
   * amount, which is not good enough to move money.
   */
  if p_paid_amount is null then
    raise exception 'Paid amount required';
  end if;

  v_expected := coalesce(v_invoice.charge_amount, v_invoice.amount);

  if p_paid_amount < v_expected then
    raise exception 'Paid amount % is short of the billed amount %', p_paid_amount, v_expected;
  end if;

  if p_charge_currency is not null
     and coalesce(v_invoice.charge_currency, v_invoice.currency) is not null
     and upper(trim(p_charge_currency)) <> upper(coalesce(v_invoice.charge_currency, v_invoice.currency))
  then
    raise exception 'Payment currency % does not match the invoice currency %',
      p_charge_currency, coalesce(v_invoice.charge_currency, v_invoice.currency);
  end if;

  update public.sam_invoices
  set
    status = 'credited',
    charge_amount = p_paid_amount,
    charge_currency = coalesce(charge_currency, p_charge_currency),
    transaction_ref = coalesce(p_transaction_ref, transaction_ref),
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
    'Paid through Sam API · ' || v_invoice.payment_method,
    null
  ) c;

  return query select v_result.credited, v_result.balance, false, 'credited'::text;
end;
$$;

revoke all on function public.credit_sam_invoice(text, numeric, text, text, jsonb) from public;
revoke all on function public.credit_sam_invoice(text, numeric, text, text, jsonb) from anon;
revoke all on function public.credit_sam_invoice(text, numeric, text, text, jsonb) from authenticated;
grant execute on function public.credit_sam_invoice(text, numeric, text, text, jsonb) to service_role;
