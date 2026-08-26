-- Manual recharge + stored products.
--
-- Two new delivery kinds extend the existing offer/order system:
--   'manual'  — admin recharges externally, marks done when complete
--   'stored'  — pre-stocked inventory (codes, accounts, URLs) delivered on purchase
--
-- A new `stock_items` table holds the actual content for stored products.

-- 1. Widen the delivery_kind check constraint
ALTER TABLE public.offers
  DROP CONSTRAINT IF EXISTS offers_delivery_kind_check;

ALTER TABLE public.offers
  ADD CONSTRAINT offers_delivery_kind_check
  CHECK (delivery_kind IN ('account', 'direct', 'manual', 'stored'));

-- 2. Stock items table
CREATE TABLE IF NOT EXISTS public.stock_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id   UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'available'
               CHECK (status IN ('available', 'sold')),
  sold_to_order_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS stock_items_offer_available
  ON public.stock_items (offer_id)
  WHERE status = 'available';

CREATE INDEX IF NOT EXISTS stock_items_order
  ON public.stock_items (sold_to_order_id)
  WHERE sold_to_order_id IS NOT NULL;

-- 3. RLS: only service role touches stock_items (admin UI uses service client)
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on stock_items"
  ON public.stock_items
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 4. Helper: atomically claim one available stock item for an order
CREATE OR REPLACE FUNCTION public.claim_stock_item(
  p_offer_id UUID,
  p_order_id UUID
)
RETURNS public.stock_items
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item public.stock_items%ROWTYPE;
BEGIN
  -- Lock one available row and mark it sold
  SELECT * INTO item
  FROM public.stock_items
  WHERE offer_id = p_offer_id
    AND status = 'available'
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No stock available for offer %', p_offer_id;
  END IF;

  UPDATE public.stock_items
  SET status = 'sold',
      sold_to_order_id = p_order_id,
      updated_at = now()
  WHERE id = item.id;

  item.status := 'sold';
  item.sold_to_order_id := p_order_id;
  RETURN item;
END;
$$;

-- 5. Helper: count available stock for an offer
CREATE OR REPLACE FUNCTION public.count_stock(p_offer_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)
  FROM public.stock_items
  WHERE offer_id = p_offer_id
    AND status = 'available'
$$;
