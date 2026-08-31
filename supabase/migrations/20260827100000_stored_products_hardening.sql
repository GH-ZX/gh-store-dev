-- Stored-product fulfillment hardening.
--
-- The original single-item claim RPC was a SECURITY DEFINER function without an
-- explicit execute grant, which made inventory readable and spendable through
-- the public API. Keep it only for compatibility, but restrict it and use the
-- atomic multi-item function below for fulfillment.

revoke all on function public.claim_stock_item(uuid, uuid) from public, anon, authenticated;

grant execute on function public.claim_stock_item(uuid, uuid) to service_role;

revoke all on function public.count_stock(uuid) from public, anon, authenticated;

grant execute on function public.count_stock(uuid) to service_role;

create or replace function public.claim_stock_items(
  p_offer_id uuid,
  p_order_id uuid,
  p_quantity integer
)
returns setof public.stock_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed integer := 0;
  item public.stock_items%rowtype;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'Invalid stock quantity' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'Order not found' using errcode = 'P0001';
  end if;

  -- The UPDATE and its row locks are one transaction. If fewer than the
  -- requested number are available, the exception rolls every claim back.
  for item in
    with candidates as (
      select s.id
      from public.stock_items s
      where s.offer_id = p_offer_id
        and s.status = 'available'
      order by s.created_at, s.id
      limit p_quantity
      for update skip locked
    )
    update public.stock_items s
    set status = 'sold',
        sold_to_order_id = p_order_id,
        updated_at = timezone('utc', now())
    from candidates
    where s.id = candidates.id
    returning s.*
  loop
    v_claimed := v_claimed + 1;
    return next item;
  end loop;

  if v_claimed <> p_quantity then
    raise exception 'Not enough stock available' using errcode = 'P0001';
  end if;

  return;
end;
$$;

revoke all on function public.claim_stock_items(uuid, uuid, integer)
  from public, anon, authenticated;

grant execute on function public.claim_stock_items(uuid, uuid, integer) to service_role;

-- A one-time, secret-gated owner bootstrap for the Telegram webhook. The
-- conditional row lock prevents two chats from claiming the owner at once.
create or replace function public.claim_telegram_owner(
  p_chat_id bigint,
  p_secret text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings jsonb;
  v_inner jsonb;
begin
  select telegram
  into v_settings
  from public.store_settings
  where id = 'global'
  for update;

  v_inner := case
    when jsonb_typeof(v_settings -> 'telegram') = 'object' then v_settings -> 'telegram'
    else coalesce(v_settings, '{}'::jsonb)
  end;

  if p_chat_id is null
     or p_secret is null
     or nullif(btrim(v_inner ->> 'webhook_secret'), '') is null
     or v_inner ->> 'webhook_secret' <> btrim(p_secret)
     or nullif(btrim(v_inner ->> 'chat_id'), '') is not null then
    return false;
  end if;

  update public.store_settings
  set telegram = jsonb_build_object(
    'telegram',
    v_inner || jsonb_build_object(
      'chat_id', p_chat_id::text,
      'updated_at', timezone('utc', now())::text
    )
  )
  where id = 'global';

  return true;
end;
$$;

revoke all on function public.claim_telegram_owner(bigint, text)
  from public, anon, authenticated;

grant execute on function public.claim_telegram_owner(bigint, text) to service_role;
