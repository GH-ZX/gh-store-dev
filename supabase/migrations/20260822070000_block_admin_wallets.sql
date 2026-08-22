-- Block wallet creation for admin users.
-- The admin has no customer wallet — their purchases are gift orders.
-- This trigger prevents the handle_new_user() trigger and any other path
-- from creating a wallet for an admin account.
create or replace function public.prevent_admin_wallet_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin(new.user_id) then
    raise exception 'Admin users do not have wallets. Use gift orders instead.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists block_admin_wallets on public.wallets;
create trigger block_admin_wallets
before insert on public.wallets
for each row
execute function public.prevent_admin_wallet_insert();

-- Delete any existing wallets for admin users (cleanup).
-- Also clean up their wallet transactions first.
delete from public.wallet_transactions
where user_id in (select id from public.profiles where role = 'admin');

delete from public.wallets
where user_id in (select id from public.profiles where role = 'admin');

-- Revoke direct wallet inserts from authenticated users (service-role bypasses triggers via SECURITY DEFINER).
-- The wallets table already has RLS, but this adds a belt-and-suspenders guard.
revoke insert on public.wallets from authenticated;
-- Keep service-role access for admin_adjust_wallet and credit_recharge_request.
grant insert on public.wallets to service_role;

-- Also clean up wallets when a customer is promoted to admin.
create or replace function public.cleanup_wallet_on_admin_promote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'admin' and (old.role is null or old.role != 'admin') then
    delete from public.wallet_transactions where user_id = new.id;
    delete from public.wallets where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists cleanup_wallet_on_role_change on public.profiles;
create trigger cleanup_wallet_on_role_change
after update on public.profiles
for each row
execute function public.cleanup_wallet_on_admin_promote();

comment on function public.prevent_admin_wallet_insert() is
  'Blocks wallet creation for admin users. Admins use gift orders, not wallets.';

comment on function public.cleanup_wallet_on_admin_promote() is
  'Deletes wallet when a customer is promoted to admin.';
