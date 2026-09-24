create or replace function public.snapshot_recharge_destination() returns trigger
language plpgsql security definer set search_path = '' as $$
declare method jsonb;
begin
  new.payment_network := null; new.payment_destination := null; new.payment_tx_hash := null; new.payment_verification := null;
  select m into method from public.store_settings s, jsonb_array_elements(coalesce(s.payments->'manual_methods','[]'::jsonb)) m where s.id = 'global' and lower(btrim(m->>'id')) = lower(btrim(new.payment_method)) and m->>'enabled' = 'true' limit 1;
  if upper(btrim(new.payment_method)) = 'BEP20' then
    if new.requested_currency is distinct from 'USD' then raise exception 'BEP20 recharge requires USD wallet currency'; end if;
    if method is null or coalesce(method->>'account','') !~ '^0x[0-9a-fA-F]{40}$' then raise exception 'Payment method unavailable'; end if;
    new.payment_network := 'BEP20'; new.payment_destination := method->>'account';
  elsif lower(btrim(new.payment_method)) in ('bybit', 'usdt', 'usdt-bep20', 'bep20-usdt')
    or (method is not null and coalesce(method->>'account','') ~ '^0x[0-9a-fA-F]{40}$') then
    raise exception 'On-chain recharge methods must use the BEP20 method id';
  end if;
  return new;
end $$;

update public.store_settings
set payments = jsonb_set(
  payments,
  '{manual_methods}',
  coalesce((
    select jsonb_agg(
      case
        when m->>'enabled' = 'true'
          and lower(btrim(m->>'id')) <> 'bep20'
          and (
            lower(btrim(m->>'id')) in ('bybit', 'usdt', 'usdt-bep20', 'bep20-usdt')
            or coalesce(m->>'account', '') ~ '^0x[0-9a-fA-F]{40}$'
          )
        then m || jsonb_build_object('enabled', false)
        else m
      end
      order by ordinal
    )
    from jsonb_array_elements(coalesce(payments->'manual_methods', '[]'::jsonb)) with ordinality as items(m, ordinal)
  ), '[]'::jsonb)
)
where id = 'global'
  and jsonb_typeof(payments->'manual_methods') = 'array';

update public.recharge_requests r
set payment_network = 'BEP20',
    payment_destination = case
      when coalesce(m->>'account', '') ~ '^0x[0-9a-fA-F]{40}$' then m->>'account'
      else r.payment_destination
    end
from public.store_settings s,
  jsonb_array_elements(coalesce(s.payments->'manual_methods', '[]'::jsonb)) m
where s.id = 'global'
  and lower(btrim(m->>'id')) in ('bybit', 'usdt', 'usdt-bep20', 'bep20-usdt')
  and lower(btrim(r.payment_method)) = lower(btrim(m->>'id'))
  and r.status in ('pending', 'payment_sent', 'processing');

create or replace function public.guard_recharge_onchain_method() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'approved' and new.payment_network is distinct from 'BEP20' and (
    lower(btrim(new.payment_method)) in ('bybit', 'usdt', 'usdt-bep20', 'bep20-usdt')
    or exists (
      select 1
      from public.store_settings s,
        jsonb_array_elements(coalesce(s.payments->'manual_methods', '[]'::jsonb)) m
      where s.id = 'global'
        and lower(btrim(m->>'id')) = lower(btrim(new.payment_method))
        and coalesce(m->>'account', '') ~ '^0x[0-9a-fA-F]{40}$'
    )
  ) then
    raise exception 'On-chain recharge requires BEP20 verification';
  end if;
  return new;
end $$;

drop trigger if exists recharge_require_explicit_network on public.recharge_requests;
create trigger recharge_require_explicit_network
before update on public.recharge_requests
for each row execute function public.guard_recharge_onchain_method();

create or replace function public.approve_verified_bep20_recharge_admin(
  p_request_id uuid,
  p_tx_hash text,
  p_credit_amount numeric,
  p_verification jsonb,
  p_note text,
  p_actor uuid
)
returns table(credited numeric, balance numeric, idempotent boolean)
language plpgsql security definer set search_path = '' as $$
declare r public.recharge_requests;
begin
  if not public.is_admin(p_actor) then raise exception 'Administrator access required'; end if;
  if p_verification is null then raise exception 'Missing transfer verification'; end if;
  select * into r from public.recharge_requests where id = p_request_id for update;
  if r.id is null or r.payment_network is distinct from 'BEP20' or r.payment_destination is null or r.payment_tx_hash is distinct from lower(p_tx_hash) then
    raise exception 'Transfer changed; reload and verify again';
  end if;
  if length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'Record how the payer ownership was verified'; end if;
  if lower(coalesce(p_verification->>'tx_hash', '')) <> lower(p_tx_hash) then raise exception 'Verification hash mismatch'; end if;
  if p_verification->>'network' <> 'BEP20' or (p_verification->>'chain_id')::integer <> 56 then raise exception 'Verification network mismatch'; end if;
  if lower(p_verification->>'token') <> '0x55d398326f99059ff775485246999027b3197955' then raise exception 'Verification token mismatch'; end if;
  if lower(coalesce(p_verification->>'destination', '')) <> lower(r.payment_destination) then raise exception 'Verification destination mismatch'; end if;
  if coalesce((p_verification->>'confirmations')::integer, 0) < 20 then raise exception 'Transfer is not sufficiently confirmed'; end if;
  if p_credit_amount is null or p_credit_amount <= 0 or p_credit_amount <> round(p_credit_amount, 2) or p_credit_amount > coalesce((p_verification->>'received_amount')::numeric, 0) then
    raise exception 'Credit exceeds verified received funds';
  end if;
  if r.status <> 'approved' then
    update public.recharge_requests
    set payment_verification = p_verification || jsonb_build_object('verified_by', p_actor, 'verified_at', now())
    where id = r.id;
  end if;
  return query select * from public.credit_recharge_request(r.id, p_credit_amount, p_note, p_actor);
end $$;

revoke all on function public.approve_verified_bep20_recharge(uuid, text, numeric, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.approve_verified_bep20_recharge_admin(uuid, text, numeric, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.approve_verified_bep20_recharge_admin(uuid, text, numeric, jsonb, text, uuid) to service_role;
