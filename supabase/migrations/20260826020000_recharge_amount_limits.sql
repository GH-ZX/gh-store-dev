-- Enforce the owner's recharge amount limits on every automated path.
--
-- The stored `min_amount`/`max_amount` were read by the recharge page and shown
-- to customers, but only the manual transfer path enforced them — Sam and
-- Binance validated little more than "positive", so a crafted request could open
-- a $0.01 invoice regardless of the configured minimum, or exceed the maximum up
-- to this function's own absolute ceiling.
--
-- Enforcement belongs here, in the one function every top-up path must pass
-- through, rather than in each caller: a rule enforced above the database is a
-- comment, not a rule. The page's displayed limits and the enforced ones can
-- never drift apart again.

create or replace function public.submit_recharge_request(
  p_amount numeric,
  p_method text,
  p_currency text default 'USD'
)
returns table (request_id uuid, reference text, status text)
language plpgsql
security definer
set search_path = public
as $$
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

  if p_amount is null or p_amount <= 0 or p_amount > 100000 then
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
$$;

revoke all on function public.submit_recharge_request(numeric, text, text) from public, anon;
grant execute on function public.submit_recharge_request(numeric, text, text) to authenticated;

comment on function public.submit_recharge_request(numeric, text, text) is
  'Creates a customer recharge request against the store''s configured min/max
   amounts (not just the absolute ceiling) and the five-open-requests quota.
   Every top-up path — manual, Sam, Binance — passes through here.';
