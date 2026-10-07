-- 20261012120000_cashback.sql
-- Store loyalty / cashback system triggered on order delivery.

-- 1. Add cashback_percent column to store_settings
alter table public.store_settings
  add column if not exists cashback_percent numeric(5, 2) default 0
  check (cashback_percent >= 0 and cashback_percent <= 100);

comment on column public.store_settings.cashback_percent is
  'Cashback percentage credited to customer wallet when an order is delivered (0 = disabled).';

-- 2. Allow 'cashback' in wallet_transactions type check
alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_type_check;

alter table public.wallet_transactions
  add constraint wallet_transactions_type_check
  check (type in ('deposit', 'purchase', 'refund', 'adjustment', 'withdrawal', 'cashback'));

-- 3. Idempotent unique index for cashback transactions per order
create unique index if not exists idx_wallet_tx_order_cashback
  on public.wallet_transactions (reference_id)
  where type = 'cashback';

-- 4. Trigger function to award cashback upon order delivery
create or replace function public.handle_order_cashback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cashback_pct numeric(5, 2) := 0;
  v_cashback_amount numeric(12, 2);
  v_wallet_id uuid;
  v_before numeric(12, 2);
  v_after numeric(12, 2);
begin
  -- Only trigger when transitioning to delivered
  if new.status = 'delivered' and (old.status is distinct from 'delivered') then
    select coalesce(cashback_percent, 0)
    into v_cashback_pct
    from public.store_settings
    where id = 'global'
    limit 1;

    if v_cashback_pct > 0 and new.total > 0 and new.user_id is not null then
      v_cashback_amount := round(new.total * (v_cashback_pct / 100.0), 2);

      if v_cashback_amount > 0 then
        -- Verify no prior cashback transaction exists for this order
        if not exists (
          select 1 from public.wallet_transactions
          where reference_id = new.id and type = 'cashback'
        ) then
          select w.id, w.balance
          into v_wallet_id, v_before
          from public.wallets w
          where w.user_id = new.user_id
          for update;

          if v_wallet_id is not null then
            v_after := v_before + v_cashback_amount;

            update public.wallets
            set balance = v_after,
                updated_at = timezone('utc', now())
            where id = v_wallet_id;

            insert into public.wallet_transactions (
              wallet_id, user_id, type, amount,
              balance_before, balance_after,
              reference_type, reference_id,
              description, metadata
            )
            values (
              v_wallet_id, new.user_id, 'cashback', v_cashback_amount,
              v_before, v_after,
              'order', new.id,
              'Cashback for order #' || new.order_number,
              jsonb_build_object(
                'order_id', new.id,
                'order_number', new.order_number,
                'rate_percent', v_cashback_pct,
                'order_total', new.total
              )
            );
          end if;
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_order_cashback on public.orders;
create trigger trg_order_cashback
  after update of status on public.orders
  for each row
  execute function public.handle_order_cashback();
