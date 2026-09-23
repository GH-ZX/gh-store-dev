-- Customer creation must use the authenticated, rate-limited RPC.
drop policy if exists recharge_requests_insert_own on public.recharge_requests;
alter table public.recharge_requests
  add column payment_network text,
  add column payment_destination text,
  add column payment_tx_hash text,
  add column payment_verification jsonb;
-- A public hash is evidence, not proof of ownership. Only approved claims reserve it.
create unique index recharge_approved_transfer_once on public.recharge_requests(payment_network, lower(payment_tx_hash)) where status = 'approved' and payment_tx_hash is not null;
create or replace function public.snapshot_recharge_destination() returns trigger
language plpgsql security definer set search_path = '' as $$
declare method jsonb;
begin
  new.payment_network := null; new.payment_destination := null; new.payment_tx_hash := null; new.payment_verification := null;
  select m into method from public.store_settings s, jsonb_array_elements(coalesce(s.payments->'manual_methods','[]'::jsonb)) m where s.id = 'global' and m->>'id' = new.payment_method and m->>'enabled' = 'true' limit 1;
  if upper(new.payment_method) = 'BEP20' then
    if method is null or coalesce(method->>'account','') !~ '^0x[0-9a-fA-F]{40}$' then raise exception 'Payment method unavailable'; end if;
    new.payment_network := 'BEP20'; new.payment_destination := method->>'account';
  end if;
  return new;
end $$;
create trigger recharge_snapshot_destination before insert on public.recharge_requests for each row execute function public.snapshot_recharge_destination();
-- Existing unsettled BEP20 claims acquire the current address; settled history is untouched.
update public.recharge_requests r set payment_network = 'BEP20', payment_destination = m->>'account'
from public.store_settings s, jsonb_array_elements(coalesce(s.payments->'manual_methods','[]'::jsonb)) m
where s.id='global' and m->>'id'=r.payment_method and upper(r.payment_method)='BEP20' and r.status in ('pending','payment_sent','processing');

create or replace function public.submit_recharge_transfer(p_request_id uuid,p_tx_hash text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.recharge_requests;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_tx_hash is null or p_tx_hash !~ '^0x[0-9a-fA-F]{64}$' then raise exception 'Invalid transaction hash'; end if;
  select * into r from public.recharge_requests where id=p_request_id and user_id=auth.uid() for update;
  if r.id is null or r.payment_network is distinct from 'BEP20' or r.status not in ('pending','payment_sent') then raise exception 'Request not found'; end if;
  -- A correction is allowed before review. It never credits money.
  update public.recharge_requests set payment_tx_hash=lower(p_tx_hash),status='payment_sent',updated_at=now() where id=r.id;
end $$;
revoke all on function public.submit_recharge_transfer(uuid,text) from public,anon;
grant execute on function public.submit_recharge_transfer(uuid,text) to authenticated;

create or replace function public.guard_bep20_credit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status='approved' and old.status <> 'approved' and new.payment_network='BEP20' then
    if new.payment_tx_hash is null or new.payment_verification is null or coalesce((new.payment_verification->>'received_amount')::numeric,0) < new.wallet_credit_amount then
      raise exception 'Verify the BEP20 transfer before approval';
    end if;
  end if;
  return new;
end $$;
create trigger recharge_require_verified_transfer before update on public.recharge_requests for each row execute function public.guard_bep20_credit();

create or replace function public.approve_verified_bep20_recharge(p_request_id uuid,p_tx_hash text,p_credit_amount numeric,p_verification jsonb,p_note text)
returns table(credited numeric,balance numeric,idempotent boolean)
language plpgsql security definer set search_path = '' as $$
declare r public.recharge_requests;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  select * into r from public.recharge_requests where id=p_request_id for update;
  if r.id is null or r.payment_network is distinct from 'BEP20' or r.payment_tx_hash is distinct from lower(p_tx_hash) then raise exception 'Transfer changed; reload and verify again'; end if;
  if length(btrim(coalesce(p_note,''))) < 5 then raise exception 'Record how the payer ownership was verified'; end if;
  if p_credit_amount is null or p_credit_amount <= 0 or p_credit_amount <> round(p_credit_amount,2) or p_credit_amount > coalesce((p_verification->>'received_amount')::numeric,0) then raise exception 'Credit exceeds verified received funds'; end if;
  if r.status <> 'approved' then
    update public.recharge_requests set payment_verification = p_verification || jsonb_build_object('verified_by',auth.uid(),'verified_at',now()) where id=r.id;
  end if;
  return query select * from public.credit_recharge_request(r.id,p_credit_amount,p_note,auth.uid());
end $$;
revoke all on function public.approve_verified_bep20_recharge(uuid,text,numeric,jsonb,text) from public,anon;
grant execute on function public.approve_verified_bep20_recharge(uuid,text,numeric,jsonb,text) to authenticated;

CREATE OR REPLACE FUNCTION public.submit_recharge_request(p_amount numeric, p_method text, p_currency text DEFAULT 'USD'::text)
 RETURNS TABLE(request_id uuid, reference text, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_is_active boolean;
  v_reference text;
  v_id uuid;
  v_pending integer;
  v_min numeric(12, 2);
  v_max numeric(12, 2);
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  select p.is_active into v_is_active from public.profiles p where p.id = v_user_id;

  if v_is_active is not true then
    raise exception 'Account suspended' using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount <> round(p_amount,2) or p_amount <= 0 or p_amount > 100000 then
    raise exception 'Invalid amount' using errcode = 'P0001';
  end if;

  if coalesce(btrim(p_method), '') = '' then
    raise exception 'Payment method required' using errcode = 'P0001';
  end if;

  /*
   * The store's own limits, not the absolute ceiling. Defaults match what the
   * settings migration seeds, so an unconfigured store behaves as before; the
   * cast is guarded because these values are owner-entered JSON.
   */
  select
    coalesce(
      case
        when jsonb_typeof(settings.payments -> 'min_amount') = 'number'
          then (settings.payments ->> 'min_amount')::numeric
        else null
      end, 1),
    coalesce(
      case
        when jsonb_typeof(settings.payments -> 'max_amount') = 'number'
          then (settings.payments ->> 'max_amount')::numeric
        else null
      end, 1000)
  into v_min, v_max
  from public.store_settings as settings
  where settings.id = 'global';

  -- A missing settings row still enforces the defaults rather than nothing.
  v_min := coalesce(v_min, 1);
  v_max := least(coalesce(v_max, 1000), 100000);

  if p_amount < v_min or p_amount > v_max then
    raise exception 'Amount outside the store recharge limits' using errcode = 'P0001';
  end if;

  if p_currency is distinct from coalesce((select payments->>'currency' from public.store_settings where id='global'),'USD') then raise exception 'Invalid currency'; end if;
  if p_method not in ('binance','shamcash','syriatel') and not exists (
    select 1 from public.store_settings s,jsonb_array_elements(coalesce(s.payments->'manual_methods','[]'::jsonb)) m
    where s.id='global' and m->>'id'=p_method and m->>'enabled'='true'
  ) then raise exception 'Payment method unavailable'; end if;
  -- Serialize the open-request cap for concurrent requests by the same customer.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text,951));
  -- A queue of identical claims is noise for whoever reviews them, and a way to
  -- bury a real request. Five open at once is generous.
  select count(*) into v_pending
  from public.recharge_requests r
  where r.user_id = v_user_id
    and r.status in ('pending', 'payment_sent', 'processing');

  if v_pending >= 5 then
    raise exception 'Too many open recharge requests' using errcode = 'P0001';
  end if;

  v_reference := 'RC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.recharge_requests (
    user_id, reference, requested_amount, requested_currency, payment_method, status
  )
  values (v_user_id, v_reference, p_amount, coalesce(p_currency, 'USD'), btrim(p_method), 'pending')
  returning id into v_id;

  return query select v_id, v_reference, 'pending'::text;
end;
$function$;
