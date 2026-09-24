create or replace function public.guard_bep20_verification_fields() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'approved' and new.payment_network = 'BEP20' then
    if new.payment_verification is null
      or new.payment_verification->>'tx_hash' is distinct from new.payment_tx_hash
      or new.payment_verification->>'network' is distinct from 'BEP20'
      or coalesce((new.payment_verification->>'chain_id')::integer, -1) <> 56
      or lower(coalesce(new.payment_verification->>'token', '')) <> '0x55d398326f99059ff775485246999027b3197955'
      or lower(coalesce(new.payment_verification->>'destination', '')) <> lower(coalesce(new.payment_destination, ''))
      or coalesce((new.payment_verification->>'confirmations')::integer, 0) < 20
      or coalesce((new.payment_verification->>'received_amount')::numeric, 0) < new.wallet_credit_amount then
      raise exception 'BEP20 verification fields are incomplete';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists recharge_require_verified_fields on public.recharge_requests;
create trigger recharge_require_verified_fields
before update on public.recharge_requests
for each row execute function public.guard_bep20_verification_fields();
