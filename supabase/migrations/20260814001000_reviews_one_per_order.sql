-- One review per order.
--
-- The reviews table has carried an `order_id` since it was created, and nothing
-- stopped the same order being reviewed twice. That mattered less while nothing
-- could write a review at all; now that the order page can, a customer who
-- submits twice would stack two testimonials against one purchase.
--
-- Partial, because `order_id` is nullable and always has been: a review left
-- without an order attached is not a duplicate of every other one.
create unique index if not exists reviews_one_per_order_idx
  on public.reviews (order_id)
  where order_id is not null;
