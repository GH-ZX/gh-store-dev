-- Let a customer see the fulfilment of their own order.
--
-- `fulfillment_attempts` had SELECT granted to `authenticated` but only an admin
-- policy, so a customer's read matched zero rows — which meant a delivered
-- redeem code could never be shown to the person who bought it. The delivered
-- payload is the only copy they get, so this is the difference between a working
-- gift-card lane and a silent loss.
--
-- Scoped by ownership through the order, and read-only: a customer can watch
-- their fulfilment but never write to it. Advancing a fulfilment stays the
-- worker's job under service authority.
drop policy if exists fulfillment_attempts_select_own on public.fulfillment_attempts;
create policy fulfillment_attempts_select_own
on public.fulfillment_attempts
for select
to authenticated
using (
  exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.id = fulfillment_attempts.order_item_id
      and o.user_id = auth.uid()
  )
);

-- The same reasoning for order items: a customer already reads their orders, and
-- an item row is part of the order they placed.
drop policy if exists fulfillment_events_select_own on public.fulfillment_events;
create policy fulfillment_events_select_own
on public.fulfillment_events
for select
to authenticated
using (
  exists (
    select 1
    from public.fulfillment_attempts fa
    join public.order_items oi on oi.id = fa.order_item_id
    join public.orders o on o.id = oi.order_id
    where fa.id = fulfillment_events.fulfillment_attempt_id
      and o.user_id = auth.uid()
  )
);

comment on policy fulfillment_attempts_select_own on public.fulfillment_attempts is
  'A customer may read the fulfilment of their own order, including the delivered codes.';
