-- Fix an ambiguous column reference that broke the owner's review path.
--
-- `mark_sam_invoice_paid` declares an output column named `status`, and its
-- filter on `recharge_requests.status` was unqualified — so Postgres could not
-- tell the output parameter from the table column and raised 42702. The effect
-- was that with "review every payment myself" turned on, a payment Sam had
-- confirmed neither credited nor queued: the invoice stayed pending, and the
-- callback got a 500 that would make Sam retry for ever.
--
-- Every column reference is now qualified through an alias. The output parameter
-- keeps its name so callers are unaffected.

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

  -- Already settled: report what it is rather than reopening it.
  if v_invoice.status in ('credited', 'failed', 'expired', 'cancelled') then
    return query select v_invoice.status;
    return;
  end if;

  update public.sam_invoices i
  set
    status = 'awaiting_review',
    charge_amount = coalesce(p_paid_amount, i.charge_amount),
    charge_currency = coalesce(i.charge_currency, p_charge_currency),
    transaction_ref = coalesce(p_transaction_ref, i.transaction_ref),
    provider_payload = coalesce(p_payload, i.provider_payload),
    paid_at = coalesce(i.paid_at, now()),
    updated_at = now()
  where i.id = v_invoice.id;

  /*
   * Move the request into the review queue with the payment already evidenced.
   * `r.status` must be qualified: an unqualified `status` here is what collided
   * with this function's own output column.
   */
  update public.recharge_requests r
  set status = 'processing', updated_at = now()
  where r.id = v_invoice.recharge_request_id
    and r.status in ('pending', 'payment_sent');

  return query select 'awaiting_review'::text;
end;
$$;

revoke all on function public.mark_sam_invoice_paid(text, numeric, text, text, jsonb) from public;
revoke all on function public.mark_sam_invoice_paid(text, numeric, text, text, jsonb) from anon;
revoke all on function public.mark_sam_invoice_paid(text, numeric, text, text, jsonb) from authenticated;
grant execute on function public.mark_sam_invoice_paid(text, numeric, text, text, jsonb) to service_role;

-- Same latent hazard: `fail_sam_invoice` also returns a column called `status`.
-- It happened to work, having no filter on the column, but qualifying it removes
-- the trap for anyone editing it later.
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

  -- A paid invoice is never closed by a late failure.
  if v_invoice.status in ('credited', 'awaiting_review') then
    return query select v_invoice.status;
    return;
  end if;

  update public.sam_invoices i
  set
    status = v_status,
    provider_payload = coalesce(p_payload, i.provider_payload),
    updated_at = now()
  where i.id = v_invoice.id;

  return query select v_status;
end;
$$;

revoke all on function public.fail_sam_invoice(text, text, jsonb) from public;
revoke all on function public.fail_sam_invoice(text, text, jsonb) from anon;
revoke all on function public.fail_sam_invoice(text, text, jsonb) from authenticated;
grant execute on function public.fail_sam_invoice(text, text, jsonb) to service_role;
