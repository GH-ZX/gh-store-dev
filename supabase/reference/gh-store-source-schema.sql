-- =============================================================================
-- GH-Store â€” COMPLETE SUPABASE SETUP (single file)
-- =============================================================================
-- Version: 0.7.1 — single file, functions deduped (last overload wins), dollar-quotes fixed
--
-- Run this ENTIRE file once in Supabase SQL Editor (new or existing project).
-- Idempotent: IF NOT EXISTS, DROP POLICY IF EXISTS, CREATE OR REPLACE.
--
-- NEW project     â†’ run all sections below, then Auth URLs + first admin.
-- EXISTING project â†’ safe to re-run; functions are deduplicated to final versions.
-- MOVE to new Supabase â†’ new project + this file + update GitHub secrets + Edge secrets.
--
-- Auth (production):
--   Site URL: https://www.echocore412.com
--   Redirects: https://www.echocore412.com/login  https://www.echocore412.com/**
--              http://localhost:5173/login
--
-- After SQL: UPDATE public.profiles SET role = 'admin' WHERE email = 'you@example.com';
-- Guide: SUPABASE_SETUP.md
--
-- TABLE OF CONTENTS
--   Â§01  Core schema, RLS, RPCs, storage & seed data
--   Â§02  Manual ShamCash recharge
--   Â§03  Manual ShamCash checkout orders
--   Â§04  In-app notifications
--   Â§05  Notifications v2 + dev mock fulfillment
--   Â§06  Dev test wallet (notifications v3)
--   Â§07  G2Bulk fulfillment
--   Â§08  G2Bulk catalog sync columns
--   Â§09  G2Bulk auto-sync (pg_cron)
--   Â§10  G2Bulk catalog health check
--   Â§11  G2Bulk live catalog mode
--   Â§12  G2Bulk pull selection
--   Â§13  G2Bulk hybrid catalog mode
--   Â§14  Game regions (parent/child variants)
--   Â§16  Sam API wallet (manual + API dual mode)
--   §17–§27  Moderation, usernames, gifts, Syriatel, Sam invoices wallet (manual + API dual mode)
--   Â§15  Catalog segments
--   Â§A/B Optional maintenance (commented, dev/staging only)
-- =============================================================================

-- =============================================================================
-- Â§01  Core schema, RLS, RPCs, storage & seed data
-- =============================================================================
-- Baseline tables, policies, checkout RPCs, product-images bucket, starter seed.

-- =====================================================
-- 1. DATABASE TABLES CREATION
-- =====================================================

-- PROFILES (Stores user roles, details, and balance)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  name text,
  avatar_url text,
  bio text,
  phone text,
  country text,
  favorite_game text,
  discord_username text,
  default_player_uid text,
  balance numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sam_shamcash_wallet_id text,
  ADD COLUMN IF NOT EXISTS sam_syriatel_recipient text;

COMMENT ON COLUMN public.profiles.sam_shamcash_wallet_id IS 'Optional admin/customer Sam ShamCash recipient wallet id';
COMMENT ON COLUMN public.profiles.sam_syriatel_recipient IS 'Optional admin/customer Sam Syriatel phone or cash code';

-- GAMES (Represents game categories / top-up systems)
CREATE TABLE IF NOT EXISTS public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en text NOT NULL,
  name_ar text,
  slug text NOT NULL,
  points_name text DEFAULT 'Points',
  image_url text,      -- Full cover / hero image for pages
  logo_url text,       -- Small thumbnail logo for bottom carousel strips
  description_en text,  -- Short description shown on carousel slides (EN)
  description_ar text,  -- Short description shown on carousel slides (AR)
  active boolean DEFAULT true,
  carousel_focus_x numeric(5,2) DEFAULT 50, -- Horizontal focal point (0 = left, 100 = right)
  carousel_focus_y numeric(5,2) DEFAULT 50, -- Vertical focal point (0 = top, 100 = bottom)
  carousel_order integer,                   -- Sort order in home carousel
  show_in_carousel boolean DEFAULT true,    -- Toggle carousel visibility
  carousel_badge_en text,                   -- Per-slide carousel badge (EN)
  carousel_badge_ar text,                   -- Per-slide carousel badge (AR)
  servers jsonb DEFAULT '[]'::jsonb,        -- Selectable servers/regions (e.g. ["Global", "Europe"])
  topup_fields jsonb DEFAULT '[]'::jsonb,   -- G2Bulk /games/fields tokens (e.g. ["userid","serverid"])
  topup_notes text,                         -- G2Bulk /games/fields notes for checkout hints
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS games_slug_key ON public.games (slug);

-- OFFERS (Represents price tiers and product packages for a specific game)
CREATE TABLE IF NOT EXISTS public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES public.games(id) ON DELETE CASCADE,
  name_en text NOT NULL,
  name_ar text,
  price numeric(10,2) NOT NULL,
  region text,
  description_en text,
  description_ar text,
  active boolean DEFAULT true,
  sale_image_url text,          -- Specific cover photo for promotional sales
  is_sale boolean DEFAULT false, -- True if offer is featured as discount / sale
  original_price numeric(10,2),  -- Crossed-out price shown during sales
  created_at timestamptz DEFAULT now()
);

-- ORDERS (Stores transaction metadata)
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  total numeric(10,2) NOT NULL,
  payment_method text,
  status text DEFAULT 'completed',
  created_at timestamptz DEFAULT now()
);

-- ORDER ITEMS (Stores snapshot of purchased offers with player target info)
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  offer_id uuid REFERENCES public.offers(id) ON DELETE SET NULL,
  name_snapshot text NOT NULL,
  price numeric(10,2) NOT NULL,
  quantity integer DEFAULT 1,
  player_uid text,              -- Target In-game UID provided by the buyer
  player_server text,           -- Target In-game Server/Zone selected by the buyer
  player_charname text,         -- Character name / extra id for G2Bulk top-up games
  redemption_info jsonb         -- Flexible metadata for custom top-up details
);

-- TRANSACTIONS (Recharge, purchase, and refund logs)
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('recharge', 'purchase', 'refund', 'adjustment')),
  amount numeric(10,2) NOT NULL,          -- Positive for recharges, negative for purchases
  balance_after numeric(10,2),           -- User balance snapshot after operation
  payment_method text,
  reference text,                        -- External payment/invoice reference ID
  status text DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  metadata jsonb,                        -- Extra custom metadata
  created_at timestamptz DEFAULT now()
);

-- STORE SETTINGS (Global settings, themes, payment methods, and page configurations)
CREATE TABLE IF NOT EXISTS public.store_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shamcash_enabled boolean NOT NULL DEFAULT false,
  shamcash_api_base_url text NOT NULL DEFAULT 'https://api.shamcash-api.com/v1',
  shamcash_api_token text,
  shamcash_account_id text,
  shamcash_merchant_name text DEFAULT 'GH-Store',
  binance_enabled boolean NOT NULL DEFAULT false,
  mastercard_enabled boolean NOT NULL DEFAULT false,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  home_layout jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- CUSTOMER REVIEWS (Stores customer testimonials displayed on the storefront)
CREATE TABLE IF NOT EXISTS public.customer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  content text NOT NULL,
  rating smallint NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  is_seed boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_reviews_status_idx ON public.customer_reviews (status);
CREATE INDEX IF NOT EXISTS customer_reviews_sort_idx ON public.customer_reviews (sort_order, created_at DESC);

-- CONTACT MESSAGES (Storefront contact form submissions)
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text,
  email text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_messages_status_idx ON public.contact_messages (status, created_at DESC);

-- =====================================================
-- 2. ROW LEVEL SECURITY (RLS) & POLICIES
-- =====================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Helper: admin check without RLS recursion inside policies

-- (deduped: earlier is_admin)
-- Profiles Policies
DROP POLICY IF EXISTS "Profiles readable" ON public.profiles;
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins read all profiles" ON public.profiles;
CREATE POLICY "Admins read all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (
    auth.uid() = id
    AND role = 'user'
    AND balance = 0
  );

DROP POLICY IF EXISTS "Users update own" ON public.profiles;
DROP POLICY IF EXISTS "Users update own name" ON public.profiles;
CREATE POLICY "Users update own name" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Games Policies
DROP POLICY IF EXISTS "Games public read" ON public.games;
CREATE POLICY "Games public read" ON public.games
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage games" ON public.games;
CREATE POLICY "Admins manage games" ON public.games
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Offers Policies
DROP POLICY IF EXISTS "Offers public read" ON public.offers;
CREATE POLICY "Offers public read" ON public.offers
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage offers" ON public.offers;
CREATE POLICY "Admins manage offers" ON public.offers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Orders Policies
DROP POLICY IF EXISTS "Users own orders" ON public.orders;
CREATE POLICY "Users own orders" ON public.orders
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

-- Orders are created only via create_order_atomic RPC (SECURITY DEFINER)

DROP POLICY IF EXISTS "Admins view all orders" ON public.orders;
CREATE POLICY "Admins view all orders" ON public.orders
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Order Items Policies
DROP POLICY IF EXISTS "Users view own order items" ON public.order_items;
CREATE POLICY "Users view own order items" ON public.order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id AND orders.user_id = (SELECT auth.uid())
    )
  );

-- Order items are created only via create_order_atomic RPC (SECURITY DEFINER)

DROP POLICY IF EXISTS "Admins view all order items" ON public.order_items;
CREATE POLICY "Admins view all order items" ON public.order_items
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Transactions Policies
DROP POLICY IF EXISTS "Users view own transactions" ON public.transactions;
CREATE POLICY "Users view own transactions" ON public.transactions
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

-- Transactions are created only via secure RPCs (SECURITY DEFINER)

DROP POLICY IF EXISTS "Admins view all transactions" ON public.transactions;
CREATE POLICY "Admins view all transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Store Settings Policies
DROP POLICY IF EXISTS "Admins manage store settings" ON public.store_settings;
CREATE POLICY "Admins manage store settings" ON public.store_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Customer Reviews Policies
DROP POLICY IF EXISTS "Public read approved reviews" ON public.customer_reviews;
CREATE POLICY "Public read approved reviews" ON public.customer_reviews
  FOR SELECT USING (status = 'approved');

DROP POLICY IF EXISTS "Users submit pending reviews" ON public.customer_reviews;
CREATE POLICY "Users submit pending reviews" ON public.customer_reviews
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'pending' AND is_seed = false);

DROP POLICY IF EXISTS "Admins manage reviews" ON public.customer_reviews;
CREATE POLICY "Admins manage reviews" ON public.customer_reviews
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Anyone can submit contact messages" ON public.contact_messages;
CREATE POLICY "Anyone can submit contact messages" ON public.contact_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    char_length(email) BETWEEN 4 AND 255
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND char_length(message) BETWEEN 10 AND 5000
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins read contact messages" ON public.contact_messages;
CREATE POLICY "Admins read contact messages" ON public.contact_messages
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins update contact messages" ON public.contact_messages;
CREATE POLICY "Admins update contact messages" ON public.contact_messages
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- =====================================================
-- 3. FUNCTIONS & TRIGGERS
-- =====================================================

-- Auto-create profile row on auth user signup

-- (deduped: earlier handle_new_user)


DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public;


-- Prevent non-admins from changing role or balance on their own profile

-- (deduped: earlier protect_profile_sensitive_fields)


DROP TRIGGER IF EXISTS protect_profile_sensitive_fields ON public.profiles;
CREATE TRIGGER protect_profile_sensitive_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_fields();


-- Secure credit balance function (intended for Webhooks/Server Edge Functions)

REVOKE EXECUTE ON FUNCTION public.credit_user_balance(uuid, numeric, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.credit_user_balance(uuid, numeric, text, text) TO authenticated;


-- Secure deduct balance function
CREATE OR REPLACE FUNCTION public.deduct_user_balance(
  p_user_id uuid,
  p_amount numeric,
  p_payment_method text DEFAULT 'balance',
  p_reference text DEFAULT null
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  current_bal numeric;
  new_balance numeric;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Deduct amount must be positive';
  END IF;

  SELECT balance INTO current_bal FROM public.profiles WHERE id = p_user_id;
  IF current_bal IS NULL OR current_bal < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  PERFORM set_config('echocore.allow_balance_change', '1', true);

  UPDATE public.profiles
    SET balance = balance - p_amount
    WHERE id = p_user_id
    RETURNING balance INTO new_balance;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (p_user_id, 'purchase', -p_amount, new_balance, p_payment_method, p_reference, 'completed');

  RETURN new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deduct_user_balance(uuid, numeric, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.deduct_user_balance(uuid, numeric, text, text) TO authenticated;


-- RPC to fetch enabled payment flags safely without exposing tokens


-- RPC to fetch public theme variables
CREATE OR REPLACE FUNCTION public.get_site_theme()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT COALESCE(
    (SELECT theme FROM public.store_settings WHERE id = 1),
    '{}'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_site_theme() TO anon, authenticated;


-- RPC to fetch home layout settings
CREATE OR REPLACE FUNCTION public.get_home_layout()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT COALESCE(
    (SELECT home_layout FROM public.store_settings WHERE id = 1),
    '[]'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_home_layout() TO anon, authenticated;


-- RPC to fetch approved reviews ordered appropriately
CREATE OR REPLACE FUNCTION public.get_approved_customer_reviews()
RETURNS json
LANGUAGE sql
SECURITY INVOKER
STABLE AS $$
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'id', id,
        'author_name', author_name,
        'content', content,
        'rating', rating,
        'created_at', created_at
      ) ORDER BY sort_order ASC, created_at DESC
    ),
    '[]'::json
  )
  FROM public.customer_reviews
  WHERE status = 'approved';
$$;

GRANT EXECUTE ON FUNCTION public.get_approved_customer_reviews() TO anon, authenticated;


-- Atomic checkout RPC (Crucial: prevents race conditions and client-side price modification)

REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) TO authenticated;


-- Confirm external payment after gateway verification (or simulated checkout in dev)

REVOKE EXECUTE ON FUNCTION public.confirm_order_payment(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.confirm_order_payment(uuid, text) TO authenticated;


-- =====================================================
-- 4. STORAGE AUTO-CREATION & POLICIES (product-images bucket)
-- =====================================================

-- Create bucket if it does not exist (requires storage extensions enabled in Supabase)
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- 1. Public read for all images (so product urls work for everyone, including anonymous visitors)
DROP POLICY IF EXISTS "Public read product-images" ON storage.objects;
CREATE POLICY "Public read product-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- 2. Admin-only upload (INSERT)
DROP POLICY IF EXISTS "Admins can upload to product-images" ON storage.objects;
CREATE POLICY "Admins can upload to product-images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 3. Admin-only update (UPDATE)
DROP POLICY IF EXISTS "Admins can update product-images" ON storage.objects;
CREATE POLICY "Admins can update product-images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 4. Admin-only delete (DELETE)
DROP POLICY IF EXISTS "Admins can delete from product-images" ON storage.objects;
CREATE POLICY "Admins can delete from product-images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 5. Users manage own avatar files in avatars/ folder
DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = 'avatars'
    AND name LIKE ('avatars/' || auth.uid()::text || '-%')
  );

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = 'avatars'
    AND name LIKE ('avatars/' || auth.uid()::text || '-%')
  );

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = 'avatars'
    AND name LIKE ('avatars/' || auth.uid()::text || '-%')
  );


-- =====================================================
-- 5. SEED DATA SETUP
-- =====================================================

-- Seed initial store_settings
INSERT INTO public.store_settings (id, shamcash_enabled, binance_enabled, mastercard_enabled, theme, home_layout)
VALUES (1, false, false, false, '{}'::jsonb, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Seed customer reviews
INSERT INTO public.customer_reviews (author_name, content, rating, status, is_seed, sort_order)
VALUES
  ('Khaled M.', 'ØªÙˆØµÙŠÙ„ Ø³Ø±ÙŠØ¹ ÙˆØ£Ø³Ø¹Ø§Ø± Ù…Ù…ØªØ§Ø²Ø©. Ø´Ø­Ù†Øª VP Ù„ÙØ§Ù„ÙˆØ±Ø§Ù†Øª Ø®Ù„Ø§Ù„ Ø£Ù‚Ù„ Ù…Ù† Ø¯Ù‚ÙŠÙ‚Ø©.', 5, 'approved', true, 1),
  ('Sara A.', 'ÙˆØ§Ø¬Ù‡Ø© Ø§Ù„Ù…ØªØ¬Ø± Ø¬Ù…ÙŠÙ„Ø© ÙˆØ§Ù„Ø¯ÙØ¹ Ø³Ù„Ø³. ShamCash Ø§Ø´ØªØºÙ„ Ø¨Ø¯ÙˆÙ† Ø£ÙŠ Ù…Ø´ÙƒÙ„Ø©.', 5, 'approved', true, 2),
  ('Omar H.', 'Ø£ÙØ¶Ù„ Ø£Ø³Ø¹Ø§Ø± Ù„Ù‚ÙŠØªÙ‡Ø§ Ù„Ø´Ø­Ù† Ø§Ù„Ø£Ù„Ø¹Ø§Ø¨. Ø§Ù„Ø¯Ø¹Ù… Ø±Ø¯ Ø¨Ø³Ø±Ø¹Ø© Ø¹Ù„Ù‰ Ø§Ù„Ø¯ÙŠØ³ÙƒÙˆØ±Ø¯.', 5, 'approved', true, 3),
  ('Layla R.', 'Ù…ÙˆØ«ÙˆÙ‚ ÙƒÙ„ Ù…Ø±Ø©. Ø£Ø³ØªØ®Ø¯Ù… Ø§Ù„Ù…ØªØ¬Ø± Ù„Ø´Ø±Ø§Ø¡ RP ÙÙŠ Ù„ÙˆÙ„ Ø£Ø³Ø¨ÙˆØ¹ÙŠØ§Ù‹.', 5, 'approved', true, 4),
  ('Youssef K.', 'Fast delivery and fair prices. PUBG UC arrived in under a minute.', 5, 'approved', true, 5),
  ('Nour T.', 'Clean checkout, clear prices, and instant top-ups. Highly recommend.', 5, 'approved', true, 6),
  ('Rami S.', 'Ø§Ø´ØªØ±ÙŠØª Ø¨Ø·Ø§Ù‚Ø© Xbox ÙˆÙˆØµÙ„ Ø§Ù„ÙƒÙˆØ¯ ÙÙˆØ±Ø§Ù‹. ØªØ¬Ø±Ø¨Ø© Ù…Ù…ØªØ§Ø²Ø© Ù…Ù† Ø§Ù„Ø¨Ø¯Ø§ÙŠØ© Ù„Ù„Ù†Ù‡Ø§ÙŠØ©.', 5, 'approved', true, 7),
  ('Maya L.', 'Great support when I had a question about my order. Will buy again.', 5, 'approved', true, 8)
ON CONFLICT DO NOTHING;

-- Seed Sample Game (Mobile Legends) and its Offers
DO $$
DECLARE
  ml_game_id uuid;
BEGIN
  -- Insert Mobile Legends Game
  INSERT INTO public.games (name_en, name_ar, slug, points_name, image_url, logo_url, active)
  VALUES (
    'Mobile Legends',
    'Ù…ÙˆØ¨Ø§ÙŠÙ„ Ù„ÙŠØ¬ÙŠÙ†Ø¯Ø²',
    'mobile-legends',
    'Diamonds',
    'https://uaiirtgzqtnrvcrlxstg.supabase.co/storage/v1/object/public/product-images/mobile-legends.png',
    'https://uaiirtgzqtnrvcrlxstg.supabase.co/storage/v1/object/public/product-images/mobile-legends-logo.png',
    true
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO ml_game_id;

  -- Get existing game id if it already existed (avoid duplicate run issues)
  IF ml_game_id IS NULL THEN
    SELECT id INTO ml_game_id
    FROM public.games
    WHERE slug = 'mobile-legends'
    LIMIT 1;
  END IF;

  -- Insert offers for Mobile Legends (Using simple checks to avoid duplicate seeding)
  IF NOT EXISTS (SELECT 1 FROM public.offers WHERE game_id = ml_game_id LIMIT 1) THEN
    INSERT INTO public.offers (game_id, name_en, name_ar, price, region, description_en, description_ar, active)
    VALUES
      (ml_game_id, '86 Diamonds', '86 Ø£Ù„Ù…Ø§Ø³', 1.99, 'Global',
       'Quick top-up to boost your hero progress.', 'Ø´Ø­Ù† Ø³Ø±ÙŠØ¹ Ù„ØªØ·ÙˆÙŠØ± Ø£Ø¨Ø·Ø§Ù„Ùƒ.',
       true),
      (ml_game_id, '172 Diamonds', '172 Ø£Ù„Ù…Ø§Ø³', 3.99, 'Global',
       'Great value for new skins and emotes.', 'Ù‚ÙŠÙ…Ø© Ù…Ù…ØªØ§Ø²Ø© Ù„Ù„Ø¬Ù„ÙˆØ¯ ÙˆØ§Ù„Ø¥ÙŠÙ…ÙˆØ¬ÙŠ Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø©.',
       true),
      (ml_game_id, '257 Diamonds', '257 Ø£Ù„Ù…Ø§Ø³', 5.99, 'Global',
       'Mid-tier diamond pack for serious players.', 'Ø­Ø²Ù…Ø© Ø£Ù„Ù…Ø§Ø³ Ù…ØªÙˆØ³Ø·Ø© Ù„Ù„Ø§Ø¹Ø¨ÙŠÙ† Ø§Ù„Ø¬Ø§Ø¯ÙŠÙ†.',
       true),
      (ml_game_id, '344 Diamonds', '344 Ø£Ù„Ù…Ø§Ø³', 7.99, 'Global',
       'Popular choice for battle passes.', 'Ø§Ù„Ø®ÙŠØ§Ø± Ø§Ù„Ø´Ø§Ø¦Ø¹ Ù„Ø¨Ø·Ø§Ù‚Ø§Øª Ø§Ù„Ù…Ø¹Ø§Ø±Ùƒ.',
       true),
      (ml_game_id, 'Weekly Diamond Pass', 'Ø¨Ø·Ø§Ù‚Ø© Ø§Ù„Ø£Ù„Ù…Ø§Ø³ Ø§Ù„Ø£Ø³Ø¨ÙˆØ¹ÙŠØ©', 4.99, 'Global',
       'Get daily diamonds and exclusive rewards for a week.', 'Ø§Ø­ØµÙ„ Ø¹Ù„Ù‰ Ø£Ù„Ù…Ø§Ø³ ÙŠÙˆÙ…ÙŠ ÙˆÙ…ÙƒØ§ÙØ¢Øª Ø­ØµØ±ÙŠØ© Ù„Ù…Ø¯Ø© Ø£Ø³Ø¨ÙˆØ¹.',
       true),
      (ml_game_id, 'Starlight Member', 'Ø¹Ø¶ÙˆÙŠØ© Ø³ØªØ§Ø±Ù„Ø§ÙŠØª', 9.99, 'Global',
       'Monthly pass with tons of diamonds, skins, and bonuses.', 'Ø¨Ø·Ø§Ù‚Ø© Ø´Ù‡Ø±ÙŠØ© Ù…Ù„ÙŠØ¦Ø© Ø¨Ø§Ù„Ø£Ù„Ù…Ø§Ø³ ÙˆØ§Ù„Ø¬Ù„ÙˆØ¯ ÙˆØ§Ù„Ù…ÙƒØ§ÙØ¢Øª.',
       true);
  END IF;

END $$;


-- =============================================================================
-- Â§02  Manual ShamCash recharge
-- =============================================================================
-- QR + pay code, recharge_requests, admin-only balance credit.

-- =============================================================================
-- GH-Store â€” MANUAL SHAMCASH RECHARGE MIGRATION
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. STORE SETTINGS â€” QR + manual pay code (public via get_payment_methods)
-- ---------------------------------------------------------------------------

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS shamcash_qr_image_url text,
  ADD COLUMN IF NOT EXISTS shamcash_pay_code text;

-- ---------------------------------------------------------------------------
-- 2. RECHARGE REQUESTS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.recharge_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL CHECK (amount >= 1 AND amount <= 500),
  reference text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'payment_sent', 'approved', 'rejected', 'cancelled')),
  payment_method text NOT NULL DEFAULT 'ShamCash',
  pay_currency text NOT NULL DEFAULT 'USD' CHECK (pay_currency IN ('USD', 'SYP')),
  syp_per_usd_snapshot numeric(12,2),
  credited_amount numeric(10,2),
  admin_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recharge_requests_user_status_idx
  ON public.recharge_requests (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS recharge_requests_status_created_idx
  ON public.recharge_requests (status, created_at DESC);

ALTER TABLE public.recharge_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own recharge requests" ON public.recharge_requests;
CREATE POLICY "Users read own recharge requests" ON public.recharge_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage recharge requests" ON public.recharge_requests;
CREATE POLICY "Admins manage recharge requests" ON public.recharge_requests
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. LOCK DOWN DIRECT BALANCE CREDIT â€” admin approval only
-- ---------------------------------------------------------------------------


-- (deduped: earlier credit_user_balance)
-- ---------------------------------------------------------------------------
-- 4. PUBLIC PAYMENT CONFIG (includes manual ShamCash QR fields)
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 5. USER RECHARGE RPCs
-- ---------------------------------------------------------------------------

-- (superseded create_recharge_request — see §26 append + scripts/fix-recharge-constraints.sql)


REVOKE EXECUTE ON FUNCTION public.mark_recharge_payment_sent(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_recharge_payment_sent(uuid) TO authenticated;



-- (deduped: earlier get_my_active_recharge_request)
-- ---------------------------------------------------------------------------
-- 6. ADMIN RECHARGE RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_recharge_requests(p_status text DEFAULT 'payment_sent')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(q) ORDER BY q.created_at DESC)
    FROM (
      SELECT
        r.id,
        r.user_id,
        r.amount,
        r.reference,
        r.status,
        r.payment_method,
        r.admin_note,
        r.created_at,
        r.updated_at,
        p.name AS user_name,
        inv.sam_invoice_id,
        inv.sam_invoice_status,
        inv.sam_invoice_expires_at
      FROM recharge_requests r
      LEFT JOIN profiles p ON p.id = r.user_id
      LEFT JOIN LATERAL (
        SELECT
          si.sam_invoice_id,
          si.status AS sam_invoice_status,
          si.expires_at AS sam_invoice_expires_at
        FROM public.sam_invoices si
        WHERE si.entity_type = 'recharge'
          AND si.entity_id = r.id
        ORDER BY si.created_at DESC
        LIMIT 1
      ) inv ON true
      WHERE (p_status IS NULL OR p_status = 'all' OR r.status = p_status)
      ORDER BY r.created_at DESC
      LIMIT 100
    ) q
  ), '[]'::json);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_recharge_requests(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_admin_recharge_requests(text) TO authenticated;


REVOKE EXECUTE ON FUNCTION public.approve_recharge_request(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_recharge_request(uuid) TO authenticated;


REVOKE EXECUTE ON FUNCTION public.reject_recharge_request(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reject_recharge_request(uuid, text) TO authenticated;

-- =============================================================================
-- Â§03  Manual ShamCash checkout orders
-- =============================================================================
-- payment_reference, pending_payment flow, admin confirm/reject.

-- =============================================================================
-- GH-Store â€” MANUAL SHAMCASH ORDER PAYMENT MIGRATION
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ORDERS â€” payment reference for ShamCash manual flow
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_reference text;

CREATE INDEX IF NOT EXISTS orders_status_payment_method_idx
  ON public.orders (status, payment_method, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. CREATE ORDER â€” server-generated reference for ShamCash
-- ---------------------------------------------------------------------------


REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. USER â€” mark ShamCash payment as sent (no auto-complete)
-- ---------------------------------------------------------------------------


REVOKE EXECUTE ON FUNCTION public.mark_order_payment_sent(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_order_payment_sent(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. ADMIN â€” confirm or reject external order payments
-- ---------------------------------------------------------------------------


REVOKE EXECUTE ON FUNCTION public.confirm_order_payment(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.confirm_order_payment(uuid, text) TO authenticated;


REVOKE EXECUTE ON FUNCTION public.reject_order_payment(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reject_order_payment(uuid, text) TO authenticated;

-- =============================================================================
-- Â§04  In-app notifications
-- =============================================================================
-- notifications table, user inbox, admin alerts.

-- =============================================================================
-- GH-Store â€” IN-APP NOTIFICATIONS
-- Then enable Realtime for `notifications` in Dashboard â†’ Database â†’ Replication.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. NOTIFICATIONS TABLE
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  link text,
  read_at timestamptz,
  bell_hidden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, read_at)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_user_bell_visible_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE bell_hidden_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Inserts/updates only via SECURITY DEFINER helpers below

ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- 2. INTERNAL HELPERS
-- ---------------------------------------------------------------------------


REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, text, jsonb, text) FROM public;


CREATE OR REPLACE FUNCTION public.notify_all_admins(
  p_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_link text DEFAULT null
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin record;
  v_count int := 0;
BEGIN
  FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin'
  LOOP
    PERFORM public.notify_user(v_admin.id, p_type, p_metadata, p_link);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_all_admins(text, jsonb, text) FROM public;

-- ---------------------------------------------------------------------------
-- 3. CLIENT RPCs
-- ---------------------------------------------------------------------------


-- (deduped: earlier get_my_notifications)
CREATE OR REPLACE FUNCTION public.get_unread_notification_count()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count int;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.notifications
  WHERE user_id = v_user_id AND read_at IS NULL;

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_unread_notification_count() FROM public;
GRANT EXECUTE ON FUNCTION public.get_unread_notification_count() TO authenticated;


CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.notifications%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.notifications
    SET read_at = now()
    WHERE id = p_notification_id AND user_id = v_user_id AND read_at IS NULL
    RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row
    FROM public.notifications
    WHERE id = p_notification_id AND user_id = v_user_id;
  END IF;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Notification not found';
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'readAt', v_row.read_at);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_notification_read(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.notifications
    SET read_at = now()
    WHERE user_id = v_user_id AND read_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_all_notifications_read() FROM public;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. HOOK EXISTING FLOWS â€” emit notifications
-- ---------------------------------------------------------------------------



-- (deduped: earlier approve_recharge_request)


-- (deduped: earlier reject_recharge_request)


-- (deduped: earlier confirm_order_payment)


-- (deduped: earlier reject_order_payment)



-- ---------------------------------------------------------------------------
-- 5. CONTACT FORM â€” notify admins on new message
-- ---------------------------------------------------------------------------


-- (deduped: earlier on_contact_message_insert)


DROP TRIGGER IF EXISTS contact_message_notify_admins ON public.contact_messages;
CREATE TRIGGER contact_message_notify_admins
  AFTER INSERT ON public.contact_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.on_contact_message_insert();

-- =============================================================================
-- Â§05  Notifications v2 + dev mock fulfillment
-- =============================================================================
-- clear_all_notifications, fulfillment toasts, admin_credit_test_balance.

-- =============================================================================
-- GH-Store â€” NOTIFICATIONS V2
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. CLEAR NOTIFICATIONS
-- ---------------------------------------------------------------------------


-- (deduped: earlier clear_all_notifications)
-- ---------------------------------------------------------------------------
-- 2. USER NOTIFICATION WHEN RECHARGE SENT TO ADMIN QUEUE
-- ---------------------------------------------------------------------------


-- (deduped: earlier mark_recharge_payment_sent)



-- ---------------------------------------------------------------------------
-- 3. USER NOTIFICATION WHEN ORDER PAYMENT SENT TO ADMIN QUEUE
-- ---------------------------------------------------------------------------


-- (deduped: earlier mark_order_payment_sent)



-- ---------------------------------------------------------------------------
-- 4. NOTIFY USER WHEN G2BULK FULFILLMENT COMPLETES
-- ---------------------------------------------------------------------------


REVOKE EXECUTE ON FUNCTION public.apply_g2bulk_fulfillment(uuid, text, text, jsonb, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_g2bulk_fulfillment(uuid, text, text, jsonb, jsonb, text) TO service_role;


-- ---------------------------------------------------------------------------
-- 5. ADMIN DEV TOOLS (testing without real G2Bulk / payments)
-- ---------------------------------------------------------------------------


REVOKE EXECUTE ON FUNCTION public.admin_credit_test_balance(numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_credit_test_balance(numeric) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_mock_fulfill_order(p_order_id uuid, p_mock_code text DEFAULT null)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_has_uid boolean := false;
  v_codes jsonb;
  v_code text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Order must be completed before mock fulfillment';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id = p_order_id AND player_uid IS NOT NULL AND length(trim(player_uid)) > 0
  ) INTO v_has_uid;

  IF v_has_uid THEN
    v_codes := NULL;
  ELSE
    v_code := COALESCE(
      nullif(trim(p_mock_code), ''),
      'TEST-' || upper(substr(replace(p_order_id::text, '-', ''), 1, 12))
    );
    v_codes := jsonb_build_array(v_code);
  END IF;

  RETURN public.apply_g2bulk_fulfillment(
    p_order_id,
    'fulfilled',
    'MOCK-DEV',
    v_codes,
    jsonb_build_object('mock', true, 'mocked_at', now()),
    NULL
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_mock_fulfill_order(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_mock_fulfill_order(uuid, text) TO authenticated;

-- =============================================================================
-- Â§06  Dev test wallet (notifications v3)
-- =============================================================================
-- profiles.dev_test_balance, admin dev-wallet RPCs.

-- =============================================================================
-- GH-Store â€” NOTIFICATIONS V3 (retention, in-site inbox, dev wallet)

-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. DEV TEST BALANCE TRACKING (clear mock money reliably)
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dev_test_balance numeric NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 2. NOTIFY USER â€” retention (in-site inbox only, no external email)
-- ---------------------------------------------------------------------------


-- (deduped: earlier notify_user)
-- ---------------------------------------------------------------------------
-- 4. BALANCE PURCHASES — see §27 canonical create_order_atomic
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 5. DEV WALLET RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_dev_wallet()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_row public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = v_admin_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN jsonb_build_object(
    'userId', v_admin_id,
    'balance', v_row.balance,
    'devTestBalance', v_row.dev_test_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_dev_wallet() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_dev_wallet() TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_credit_test_balance(p_amount numeric DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_new_balance numeric;
  v_dev_test_balance numeric;
  v_amount numeric := COALESCE(p_amount, 100);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_amount <= 0 OR v_amount > 1000 THEN
    RAISE EXCEPTION 'Test amount must be between 0.01 and 1000';
  END IF;

  v_new_balance := public.credit_user_balance(
    v_admin_id,
    v_amount,
    'test',
    'DEV-TEST-' || to_char(now(), 'YYMMDDHH24MISS')
  );

  UPDATE public.profiles
  SET dev_test_balance = dev_test_balance + v_amount
  WHERE id = v_admin_id
  RETURNING dev_test_balance INTO v_dev_test_balance;

  RETURN jsonb_build_object(
    'userId', v_admin_id,
    'amount', v_amount,
    'newBalance', v_new_balance,
    'devTestBalance', v_dev_test_balance
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_clear_test_balance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_row public.profiles%ROWTYPE;
  v_removed numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = v_admin_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF COALESCE(v_row.dev_test_balance, 0) <= 0 THEN
    RETURN jsonb_build_object(
      'userId', v_admin_id,
      'removed', 0,
      'newBalance', v_row.balance,
      'devTestBalance', 0
    );
  END IF;

  v_removed := LEAST(v_row.balance, v_row.dev_test_balance);

  UPDATE public.profiles
  SET
    balance = GREATEST(0, balance - v_removed),
    dev_test_balance = 0
  WHERE id = v_admin_id
  RETURNING balance, dev_test_balance INTO v_row.balance, v_row.dev_test_balance;

  IF v_removed > 0 THEN
    INSERT INTO transactions (user_id, type, amount, balance_after, payment_method, reference, status)
    VALUES (
      v_admin_id,
      'adjustment',
      -v_removed,
      v_row.balance,
      'test',
      'DEV-CLEAR-' || to_char(now(), 'YYMMDDHH24MISS'),
      'completed'
    );
  END IF;

  RETURN jsonb_build_object(
    'userId', v_admin_id,
    'removed', v_removed,
    'newBalance', v_row.balance,
    'devTestBalance', v_row.dev_test_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_clear_test_balance() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_clear_test_balance() TO authenticated;



-- (deduped: earlier admin_run_mock_purchase)
-- =============================================================================
-- Â§07  G2Bulk fulfillment
-- =============================================================================
-- API key storage, offer/game links, apply_g2bulk_fulfillment.

-- =============================================================================
-- GH-Store â€” G2BULK FULFILLMENT MIGRATION
-- API key: save via Admin â†’ G2Bulk (never commit the key to git)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. STORE SETTINGS â€” G2Bulk config (admin-only via RLS)
-- ---------------------------------------------------------------------------

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS g2bulk_api_key text,
  ADD COLUMN IF NOT EXISTS g2bulk_markup_percent numeric(5,2) NOT NULL DEFAULT 15;

-- ---------------------------------------------------------------------------
-- 2. GAMES â€” link to G2Bulk game code for direct top-ups
-- ---------------------------------------------------------------------------

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS g2bulk_game_code text;

-- ---------------------------------------------------------------------------
-- 3. OFFERS â€” link to G2Bulk catalogue or voucher product
-- ---------------------------------------------------------------------------

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS g2bulk_type text CHECK (g2bulk_type IS NULL OR g2bulk_type IN ('topup', 'voucher')),
  ADD COLUMN IF NOT EXISTS g2bulk_catalogue_name text,
  ADD COLUMN IF NOT EXISTS g2bulk_product_id integer,
  ADD COLUMN IF NOT EXISTS g2bulk_cost_usd numeric(10,4);

-- Per-offer pricing policy (sync respects fixed / custom margin)
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'auto';
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS pricing_margin_percent numeric(8,2);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'offers_pricing_mode_check'
  ) THEN
    ALTER TABLE public.offers
      ADD CONSTRAINT offers_pricing_mode_check
      CHECK (pricing_mode IN ('auto', 'margin', 'fixed'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. ORDERS â€” fulfillment tracking
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'pending'
    CHECK (fulfillment_status IN ('pending', 'skipped', 'fulfilling', 'fulfilled', 'failed')),
  ADD COLUMN IF NOT EXISTS g2bulk_order_id text,
  ADD COLUMN IF NOT EXISTS g2bulk_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS orders_fulfillment_status_idx
  ON public.orders (fulfillment_status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. ORDER ITEMS â€” delivered codes / payload
-- ---------------------------------------------------------------------------

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS delivery_items jsonb,
  ADD COLUMN IF NOT EXISTS fulfillment_status text
    CHECK (fulfillment_status IS NULL OR fulfillment_status IN ('pending', 'fulfilling', 'fulfilled', 'failed'));

-- ---------------------------------------------------------------------------
-- 6. ADMIN â€” read G2Bulk settings (includes api key for admin UI only)
-- ---------------------------------------------------------------------------


REVOKE EXECUTE ON FUNCTION public.get_g2bulk_settings() FROM public;
GRANT EXECUTE ON FUNCTION public.get_g2bulk_settings() TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. ADMIN â€” save G2Bulk settings (omit api key field to keep existing)
-- ---------------------------------------------------------------------------


REVOKE EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text) FROM public;
GRANT EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Persist fulfillment result (edge function uses service role)
-- ---------------------------------------------------------------------------


-- (deduped: earlier apply_g2bulk_fulfillment)
-- =============================================================================
-- Â§08  G2Bulk catalog sync columns
-- =============================================================================
-- catalog_source, g2bulk sync metadata on games/offers.

-- =============================================================================
-- GH-Store â€” G2BULK CATALOG SYNC MIGRATION

-- =============================================================================

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_catalog_only boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS g2bulk_last_sync_at timestamptz;

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS redemption_method text DEFAULT 'uid'
    CHECK (redemption_method IS NULL OR redemption_method IN ('uid', 'redeem_code', 'both')),
  ADD COLUMN IF NOT EXISTS catalog_source text NOT NULL DEFAULT 'manual'
    CHECK (catalog_source IN ('manual', 'g2bulk')),
  ADD COLUMN IF NOT EXISTS g2bulk_source_id integer,
  ADD COLUMN IF NOT EXISTS g2bulk_synced_at timestamptz;

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS catalog_source text NOT NULL DEFAULT 'manual'
    CHECK (catalog_source IN ('manual', 'g2bulk')),
  ADD COLUMN IF NOT EXISTS g2bulk_catalogue_id integer,
  ADD COLUMN IF NOT EXISTS g2bulk_synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS games_g2bulk_game_code_uidx
  ON public.games (g2bulk_game_code)
  WHERE g2bulk_game_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS offers_g2bulk_product_uidx
  ON public.offers (g2bulk_product_id)
  WHERE g2bulk_product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS offers_game_catalogue_uidx
  ON public.offers (game_id, g2bulk_catalogue_name)
  WHERE g2bulk_catalogue_name IS NOT NULL;

-- Storefront flag (public)



-- Admin G2Bulk settings (extended)


REVOKE EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text, boolean) TO authenticated;

-- =============================================================================
-- Â§09  G2Bulk auto-sync (pg_cron)
-- =============================================================================
-- Optional cron; requires pg_cron + Edge Function secrets.

-- =============================================================================
-- GH-Store â€” G2BULK DAILY AUTO-SYNC (5:00 AM)

-- =============================================================================

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_auto_sync_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS g2bulk_auto_sync_hour smallint NOT NULL DEFAULT 5
    CHECK (g2bulk_auto_sync_hour >= 0 AND g2bulk_auto_sync_hour <= 23),
  ADD COLUMN IF NOT EXISTS g2bulk_auto_sync_timezone text NOT NULL DEFAULT 'Asia/Damascus',
  ADD COLUMN IF NOT EXISTS g2bulk_sync_state jsonb;

-- Admin settings (extended)

DROP FUNCTION IF EXISTS public.save_g2bulk_settings(boolean, numeric, text, boolean);
DROP FUNCTION IF EXISTS public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean);


REVOKE EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text) FROM public;
GRANT EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- pg_cron: invoke g2bulk-sync-cron every 2 minutes
-- Requires: pg_cron + pg_net extensions (enabled on Supabase hosted)
-- Before running: store the same secret in Vault AND Edge Function secrets:
--   select vault.create_secret('YOUR_RANDOM_CRON_SECRET', 'g2bulk_cron_secret');
--   supabase secrets set G2BULK_CRON_SECRET=YOUR_RANDOM_CRON_SECRET
-- -----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'g2bulk-auto-sync-tick') THEN
    PERFORM cron.unschedule('g2bulk-auto-sync-tick');
  END IF;

  PERFORM cron.schedule(
    'g2bulk-auto-sync-tick',
    '*/2 * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://uaiirtgzqtnrvcrlxstg.supabase.co/functions/v1/g2bulk-sync-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-g2bulk-cron-secret', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'g2bulk_cron_secret'
          LIMIT 1
        )
      ),
      body := '{}'::jsonb
    ) AS request_id;
    $job$
  );
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'vault.decrypted_secrets not found â€” create g2bulk_cron_secret in Vault, then re-run the cron.schedule block.';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule g2bulk auto-sync cron: %', SQLERRM;
END;
$cron$$;

-- =============================================================================
-- Â§10  G2Bulk catalog health check
-- =============================================================================
-- Last check timestamp and summary JSON.

-- G2Bulk catalog health check â€” last check time + summary for admin UI

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_last_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS g2bulk_check_summary jsonb;


-- =============================================================================
-- Â§11  G2Bulk live catalog mode
-- =============================================================================
-- sync vs live catalog_mode on store_settings.

-- G2Bulk catalog mode: sync (database) vs live (API browse)
-- Run in Supabase SQL Editor.

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_catalog_mode text NOT NULL DEFAULT 'sync'
    CHECK (g2bulk_catalog_mode IN ('sync', 'live'));


DROP FUNCTION IF EXISTS public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text);

DROP FUNCTION IF EXISTS public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text);
DROP FUNCTION IF EXISTS public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text, text);

CREATE OR REPLACE FUNCTION public.save_g2bulk_settings(
  p_enabled boolean,
  p_markup_percent numeric DEFAULT 15,
  p_api_key text DEFAULT null,
  p_catalog_only boolean DEFAULT null,
  p_auto_sync_enabled boolean DEFAULT null,
  p_auto_sync_hour smallint DEFAULT null,
  p_auto_sync_timezone text DEFAULT null,
  p_catalog_mode text DEFAULT null,
  p_charm_pricing_enabled boolean DEFAULT null,
  p_auto_approve boolean DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_trim_key text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_trim_key := nullif(trim(p_api_key), '');

  UPDATE public.store_settings
  SET
    g2bulk_enabled = COALESCE(p_enabled, false),
    g2bulk_markup_percent = COALESCE(p_markup_percent, 15),
    g2bulk_charm_pricing_enabled = COALESCE(p_charm_pricing_enabled, g2bulk_charm_pricing_enabled, false),
    g2bulk_catalog_only = COALESCE(p_catalog_only, g2bulk_catalog_only, true),
    g2bulk_catalog_mode = COALESCE(nullif(trim(p_catalog_mode), ''), g2bulk_catalog_mode, 'sync'),
    g2bulk_auto_sync_enabled = COALESCE(p_auto_sync_enabled, g2bulk_auto_sync_enabled, true),
    g2bulk_auto_sync_hour = COALESCE(p_auto_sync_hour, g2bulk_auto_sync_hour, 5),
    g2bulk_auto_sync_timezone = COALESCE(nullif(trim(p_auto_sync_timezone), ''), g2bulk_auto_sync_timezone, 'Asia/Damascus'),
    g2bulk_auto_approve = COALESCE(p_auto_approve, g2bulk_auto_approve, true),
    g2bulk_api_key = CASE
      WHEN p_api_key IS NOT NULL THEN v_trim_key
      ELSE g2bulk_api_key
    END,
    updated_at = now()
  WHERE id = 1;

  RETURN public.get_g2bulk_settings();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text, text, boolean, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text, text, boolean, boolean) TO authenticated;

-- =============================================================================
-- Â§12  G2Bulk pull selection
-- =============================================================================
-- Admin-selected subset of pulled catalog.

-- G2Bulk selective pull: store which games/accounts to sync + carousel picks
-- Run in Supabase SQL Editor.

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_charm_pricing_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_pull_selection jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_auto_approve boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.get_g2bulk_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row public.store_settings%ROWTYPE;
  v_key text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.store_settings WHERE id = 1;
  v_key := nullif(trim(v_row.g2bulk_api_key), '');

  RETURN jsonb_build_object(
    'g2bulk_enabled', COALESCE(v_row.g2bulk_enabled, false),
    'g2bulk_markup_percent', COALESCE(v_row.g2bulk_markup_percent, 15),
    'g2bulk_charm_pricing_enabled', COALESCE(v_row.g2bulk_charm_pricing_enabled, false),
    'g2bulk_catalog_only', COALESCE(v_row.g2bulk_catalog_only, true),
    'g2bulk_catalog_mode', COALESCE(v_row.g2bulk_catalog_mode, 'sync'),
    'g2bulk_last_sync_at', v_row.g2bulk_last_sync_at,
    'g2bulk_last_check_at', v_row.g2bulk_last_check_at,
    'g2bulk_check_summary', COALESCE(v_row.g2bulk_check_summary, '{}'::jsonb),
    'g2bulk_auto_sync_enabled', COALESCE(v_row.g2bulk_auto_sync_enabled, true),
    'g2bulk_auto_sync_hour', COALESCE(v_row.g2bulk_auto_sync_hour, 5),
    'g2bulk_auto_sync_timezone', COALESCE(v_row.g2bulk_auto_sync_timezone, 'Asia/Damascus'),
    'g2bulk_auto_approve', COALESCE(v_row.g2bulk_auto_approve, true),
    'g2bulk_pull_selection', COALESCE(v_row.g2bulk_pull_selection, '{}'::jsonb),
    'g2bulk_api_key_set', v_key IS NOT NULL,
    'g2bulk_api_key_masked', CASE
      WHEN v_key IS NULL THEN null
      WHEN length(v_key) <= 8 THEN '********'
      ELSE substr(v_key, 1, 4) || 'â€¦' || substr(v_key, length(v_key) - 3, 4)
    END
  );
END;
$$;

-- =============================================================================
-- Â§13  G2Bulk hybrid catalog mode
-- =============================================================================
-- Adds hybrid to catalog_mode check + RPC exposure.

-- Hybrid catalog mode + expose pull selection to storefront
-- Run in Supabase SQL Editor.

ALTER TABLE public.store_settings
  DROP CONSTRAINT IF EXISTS store_settings_g2bulk_catalog_mode_check;

ALTER TABLE public.store_settings
  ADD CONSTRAINT store_settings_g2bulk_catalog_mode_check
  CHECK (g2bulk_catalog_mode IN ('sync', 'live', 'hybrid'));


-- (deduped: earlier get_payment_methods)


-- =============================================================================
-- Â§14  Game regions (parent/child variants)
-- =============================================================================
-- parent_game_id, region_label for multi-region storefront.

-- Game region grouping: one storefront game, many G2Bulk regional variants

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS group_base_key text,
  ADD COLUMN IF NOT EXISTS parent_game_id uuid REFERENCES public.games(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS region_label text;

CREATE INDEX IF NOT EXISTS games_parent_game_id_idx
  ON public.games (parent_game_id)
  WHERE parent_game_id IS NOT NULL;

COMMENT ON COLUMN public.games.group_base_key IS 'Shared base key for G2Bulk game variants (e.g. mlbb, mlbb_global, mlbb_ru).';

CREATE INDEX IF NOT EXISTS games_storefront_idx
  ON public.games (active, catalog_source)
  WHERE parent_game_id IS NULL;

COMMENT ON COLUMN public.games.parent_game_id IS 'Storefront parent; NULL = visible game card. Children hold g2bulk_game_code.';
COMMENT ON COLUMN public.games.region_label IS 'G2Bulk catalog region for child variants (e.g. SEA, Global, Turkey).';

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS topup_fields jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS topup_notes text;

COMMENT ON COLUMN public.games.topup_fields IS
  'G2Bulk required input fields from POST /games/fields (e.g. ["userid"] or ["userid","serverid"]).';

COMMENT ON COLUMN public.games.topup_notes IS
  'G2Bulk notes from POST /games/fields (shown as checkout hints when relevant).';

-- =============================================================================
-- Â§15  Catalog segments
-- =============================================================================
-- topup / gift_card / gaming_account classification.

-- Catalog segments: topup | gift_card | gaming_account
-- Platforms: Xbox, PS, iTunes, Razer Gold, Steam, Netflix, etc.

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS catalog_segment text
    CHECK (catalog_segment IS NULL OR catalog_segment IN ('topup', 'gift_card', 'gaming_account'));

CREATE INDEX IF NOT EXISTS games_catalog_segment_idx
  ON public.games (catalog_segment)
  WHERE catalog_segment IS NOT NULL;

COMMENT ON COLUMN public.games.catalog_segment IS 'Storefront category: topup, gift_card (in-game codes), gaming_account (platform/subscription codes).';

-- Re-classify all G2Bulk voucher games from title.
UPDATE public.games
SET catalog_segment = CASE
  WHEN redemption_method <> 'redeem_code' THEN 'topup'
  WHEN lower(coalesce(name_en, name_ar, slug, '')) ~* (
    'xbox|playstation|psn|ps4|ps5|nintendo|game[[:space:]]?pass|gamepass|live[[:space:]]?gold|'
    || 'steam[[:space:]]?(wallet|card|gift|account)?|netflix|spotify|disney|hulu|prime[[:space:]]?video|'
    || 'amazon[[:space:]]?(gift|card)?|apple|itunes|app[[:space:]]?store|google[[:space:]]?play|'
    || 'razer|zgold|z[[:space:]]?gold|gold[[:space:]]?pin|paysafe|paysafecard|'
    || 'blizzard|battle\.?net|battlenet|epic[[:space:]]?games|origin|ea[[:space:]]?play|'
    || 'office|windows|chatgpt|discord[[:space:]]?nitro|vpn|subscription|membership|wallet[[:space:]]?code|store[[:space:]]?credit|account'
  ) THEN 'gaming_account'
  ELSE 'gift_card'
END
WHERE catalog_source = 'g2bulk'
  AND redemption_method = 'redeem_code';

UPDATE public.games
SET catalog_segment = 'topup'
WHERE catalog_source = 'g2bulk'
  AND redemption_method = 'uid'
  AND catalog_segment IS DISTINCT FROM 'topup';

-- =============================================================================
-- OPTIONAL MAINTENANCE SCRIPTS (commented out â€” uncomment only in dev/staging)
-- =============================================================================


-- =============================================================================
-- Â§A  OPTIONAL â€” Wipe commerce data (fresh catalog start)
-- =============================================================================
-- âš ï¸  DESTRUCTIVE. Clears orders, games, offers, user activity. Do NOT run on production with live customers.
-- >>> UNCOMMENT THE BLOCK BELOW ONLY IF YOU INTEND TO RUN IT <<<

--
-- -- =============================================================================
-- -- GH-Store â€” Fresh start (wipe storefront data, reset settings, keep schema + API key)

-- -- Then deploy g2bulk and run full catalog sync from admin (or scripts/run-full-g2bulk-sync.ps1)
-- -- =============================================================================
--
-- BEGIN;
--
-- -- Commerce & catalog (order matters for FKs)
-- DELETE FROM public.order_items;
-- DELETE FROM public.orders;
-- DELETE FROM public.offers;
-- DELETE FROM public.games;
--
-- -- User activity
-- DELETE FROM public.transactions;
--
-- DO $$
-- BEGIN
--   IF EXISTS (
--     SELECT 1 FROM information_schema.tables
--     WHERE table_schema = 'public' AND table_name = 'recharge_requests'
--   ) THEN
--     EXECUTE 'DELETE FROM public.recharge_requests';
--   END IF;
--
--   IF EXISTS (
--     SELECT 1 FROM information_schema.tables
--     WHERE table_schema = 'public' AND table_name = 'notifications'
--   ) THEN
--     EXECUTE 'DELETE FROM public.notifications';
--   END IF;
-- END $$;
--
-- DELETE FROM public.customer_reviews;
--
-- DO $$
-- BEGIN
--   IF EXISTS (
--     SELECT 1 FROM information_schema.tables
--     WHERE table_schema = 'public' AND table_name = 'contact_messages'
--   ) THEN
--     EXECUTE 'DELETE FROM public.contact_messages';
--   END IF;
-- END $$;
--
-- -- Reset all wallet balances
-- UPDATE public.profiles SET balance = 0;
--
-- -- Reset store settings (keep g2bulk_api_key)
-- UPDATE public.store_settings
-- SET
--   theme = '{}'::jsonb,
--   home_layout = '[
--     {"id":"carousel","type":"carousel","enabled":true},
--     {"id":"games","type":"games","enabled":true,"title_en":"Choose a Game","title_ar":"Ø§Ø®ØªØ± Ù„Ø¹Ø¨ØªÙƒ"},
--     {"id":"sale_offers","type":"sale_offers","enabled":true,"title_en":"Sale Offers","title_ar":"Ø®ØµÙˆÙ…Ø§Øª","limit":8},
--     {"id":"suggested_offers","type":"suggested_offers","enabled":true,"title_en":"Suggested Offers","title_ar":"Ø¹Ø±ÙˆØ¶ Ù…Ù‚ØªØ±Ø­Ø©","limit":8},
--     {"id":"gift_cards","type":"gift_cards","enabled":true,"title_en":"Gift Cards & Vouchers","title_ar":"Ø¨Ø·Ø§Ù‚Ø§Øª Ø§Ù„Ù‡Ø¯Ø§ÙŠØ§","limit":6},
--     {"id":"gaming_accounts","type":"gaming_accounts","enabled":true,"title_en":"Gaming Accounts","title_ar":"Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ø£Ù„Ø¹Ø§Ø¨","limit":6},
--     {"id":"customer_reviews","type":"customer_reviews","enabled":true,"title_en":"Customer Reviews","title_ar":"Ø¢Ø±Ø§Ø¡ Ø§Ù„Ø²Ø¨Ø§Ø¦Ù†","limit":8,"interval_seconds":6,"show_submit_form":true,"review_ids":[]}
--   ]'::jsonb,
--   shamcash_enabled = false,
--   shamcash_api_token = null,
--   shamcash_account_id = null,
--   shamcash_qr_image_url = null,
--   binance_enabled = false,
--   mastercard_enabled = false,
--   g2bulk_enabled = true,
--   g2bulk_catalog_only = true,
--   g2bulk_catalog_mode = 'sync',
--   g2bulk_markup_percent = COALESCE(g2bulk_markup_percent, 15),
--   g2bulk_auto_sync_enabled = COALESCE(g2bulk_auto_sync_enabled, true),
--   g2bulk_auto_sync_hour = COALESCE(g2bulk_auto_sync_hour, 5),
--   g2bulk_auto_sync_timezone = COALESCE(g2bulk_auto_sync_timezone, 'Asia/Damascus'),
--   g2bulk_last_sync_at = null,
--   g2bulk_last_check_at = null,
--   g2bulk_check_summary = '{}'::jsonb,
--   g2bulk_sync_state = null,
--   updated_at = now()
-- WHERE id = 1;
--
-- COMMIT;
--
-- DO $$
-- BEGIN
--   RAISE NOTICE 'Fresh start complete. Games/offers/orders cleared. Run G2Bulk full sync next.';
-- END $$;


-- =============================================================================
-- Â§B  OPTIONAL â€” Reset one admin test wallet
-- =============================================================================
-- âš ï¸  Clears test orders/recharges for one admin email. Dev/staging only.
-- >>> UNCOMMENT THE BLOCK BELOW ONLY IF YOU INTEND TO RUN IT <<<

--
-- -- =============================================================================
-- -- GH-Store â€” Reset admin test wallet & commerce data (fresh start)
-- -- Run in Supabase SQL Editor when you want to clear test purchases/recharges.
-- -- Default target: admin.echocore3333@gmail.com (change v_email below if needed)
-- -- =============================================================================
--
-- DO $$
-- DECLARE
--   v_email text := 'admin.echocore3333@gmail.com';
--   v_user_id uuid;
-- BEGIN
--   SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email);
--
--   IF v_user_id IS NULL THEN
--     RAISE EXCEPTION 'No auth user found for email: %', v_email;
--   END IF;
--
--   DELETE FROM public.order_items
--   WHERE order_id IN (SELECT id FROM public.orders WHERE user_id = v_user_id);
--
--   DELETE FROM public.orders WHERE user_id = v_user_id;
--   DELETE FROM public.transactions WHERE user_id = v_user_id;
--
--   IF EXISTS (
--     SELECT 1 FROM information_schema.tables
--     WHERE table_schema = 'public' AND table_name = 'recharge_requests'
--   ) THEN
--     EXECUTE 'DELETE FROM public.recharge_requests WHERE user_id = $1' USING v_user_id;
--   END IF;
--
--   IF EXISTS (
--     SELECT 1 FROM information_schema.tables
--     WHERE table_schema = 'public' AND table_name = 'notifications'
--   ) THEN
--     EXECUTE 'DELETE FROM public.notifications WHERE user_id = $1' USING v_user_id;
--   END IF;
--
--   UPDATE public.profiles
--   SET balance = 0
--   WHERE id = v_user_id;
--
--   RAISE NOTICE 'Reset complete for % (user_id=%). Store wallet set to $0.00', v_email, v_user_id;
-- END;
-- $$;

-- =============================================================================
-- §16  Sam API wallet (manual + API dual mode)
-- =============================================================================
-- Sam API (sam-api.pro): ShamCash / Syriatel invoices. Keys admin-only.
-- Deploy Edge Function: supabase/functions/sam-api
-- Edge secrets (optional): SAM_API_KEY, SAM_WEBHOOK_SECRET

CREATE OR REPLACE FUNCTION public.new_sam_webhook_secret()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS sam_api_key text,
  ADD COLUMN IF NOT EXISTS sam_api_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sam_wallet_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS sam_invoice_method text NOT NULL DEFAULT 'shamcash',
  ADD COLUMN IF NOT EXISTS sam_wallet_identifier text,
  ADD COLUMN IF NOT EXISTS sam_invoice_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS sam_webhook_secret text,
  ADD COLUMN IF NOT EXISTS sam_syp_per_usd numeric(12,2) DEFAULT 135,
  ADD COLUMN IF NOT EXISTS sam_syp_rate_updated_at timestamptz;

ALTER TABLE public.store_settings
  DROP CONSTRAINT IF EXISTS store_settings_sam_wallet_mode_check;
ALTER TABLE public.store_settings
  ADD CONSTRAINT store_settings_sam_wallet_mode_check
  CHECK (sam_wallet_mode IN ('manual', 'api'));

ALTER TABLE public.store_settings
  DROP CONSTRAINT IF EXISTS store_settings_sam_invoice_method_check;
ALTER TABLE public.store_settings
  ADD CONSTRAINT store_settings_sam_invoice_method_check
  CHECK (sam_invoice_method IN ('shamcash', 'syriatel'));

ALTER TABLE public.store_settings
  DROP CONSTRAINT IF EXISTS store_settings_sam_invoice_currency_check;
ALTER TABLE public.store_settings
  ADD CONSTRAINT store_settings_sam_invoice_currency_check
  CHECK (sam_invoice_currency IN ('USD', 'SYP', 'EUR'));

CREATE TABLE IF NOT EXISTS public.sam_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('recharge', 'order')),
  entity_id uuid,
  sam_invoice_id text NOT NULL UNIQUE,
  payment_url text,
  amount numeric(12,2) NOT NULL,
  requested_usd_amount numeric(10,2),
  paid_amount numeric(12,2),
  syp_per_usd_snapshot numeric(12,2),
  currency text NOT NULL CHECK (currency IN ('USD', 'SYP', 'EUR')),
  method text NOT NULL CHECK (method IN ('shamcash', 'syriatel')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'expired', 'failed', 'cancelled')),
  transaction_ref text,
  webhook_received_at timestamptz,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sam_invoices_user_status_idx
  ON public.sam_invoices (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS sam_invoices_entity_idx
  ON public.sam_invoices (entity_type, entity_id);

ALTER TABLE public.sam_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own sam invoices" ON public.sam_invoices;
CREATE POLICY "Users read own sam invoices" ON public.sam_invoices
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage sam invoices" ON public.sam_invoices;
CREATE POLICY "Admins manage sam invoices" ON public.sam_invoices
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Admin payout ledger (money sent out of a linked wallet via Sam API)
CREATE TABLE IF NOT EXISTS public.sam_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  method text NOT NULL CHECK (method IN ('shamcash', 'syriatel')),
  source_identifier text,
  recipient_identifier text NOT NULL,
  currency text NOT NULL CHECK (currency IN ('USD', 'SYP', 'EUR')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  note text,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
  sam_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sam_transfers
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sam_transfers_customer_idx
  ON public.sam_transfers (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sam_transfers_created_idx
  ON public.sam_transfers (created_at DESC);

ALTER TABLE public.sam_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read sam transfers" ON public.sam_transfers;
CREATE POLICY "Admins read sam transfers" ON public.sam_transfers
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins manage sam transfers" ON public.sam_transfers;
CREATE POLICY "Admins manage sam transfers" ON public.sam_transfers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- (removed older get_sam_api_settings; see later definition)


REVOKE EXECUTE ON FUNCTION public.is_user_banned(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_user_banned(uuid) TO authenticated, anon;


CREATE OR REPLACE FUNCTION public.assert_user_not_banned(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF public.is_user_banned(p_user_id) THEN
    RAISE EXCEPTION 'Account suspended';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_user_not_banned(uuid) FROM public;


-- (removed older protect_profile_sensitive_fields; see later definition)


-- ---------------------------------------------------------------------------
-- 3. SITE STATUS (public)
-- ---------------------------------------------------------------------------


-- (deduped: earlier get_site_status)
CREATE OR REPLACE FUNCTION public.admin_save_maintenance_settings(
  p_enabled boolean,
  p_message_ar text DEFAULT '',
  p_message_en text DEFAULT '',
  p_allow_admins boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.store_settings
    SET maintenance_enabled = COALESCE(p_enabled, false),
        maintenance_message_ar = nullif(trim(p_message_ar), ''),
        maintenance_message_en = nullif(trim(p_message_en), ''),
        maintenance_allow_admins = COALESCE(p_allow_admins, true)
    WHERE id = 1;

  RETURN public.get_site_status();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_save_maintenance_settings(boolean, text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_save_maintenance_settings(boolean, text, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. BROADCAST / DIRECT MESSAGES
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_all_users(
  p_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_link text DEFAULT null
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user record;
  v_count int := 0;
BEGIN
  FOR v_user IN
    SELECT id FROM public.profiles WHERE role = 'user'
  LOOP
    PERFORM public.notify_user(v_user.id, p_type, p_metadata, p_link);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_all_users(text, jsonb, text) FROM public;


CREATE OR REPLACE FUNCTION public.admin_broadcast_message(
  p_kind text,
  p_title text,
  p_body text,
  p_link text DEFAULT null
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_type text;
  v_count int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'Title is required';
  END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Message body is required';
  END IF;

  v_type := CASE lower(trim(p_kind))
    WHEN 'warning' THEN 'admin_warning'
    WHEN 'maintenance' THEN 'admin_maintenance_notice'
    ELSE 'admin_announcement'
  END;

  v_count := public.notify_all_users(
    v_type,
    jsonb_build_object(
      'kind', lower(trim(p_kind)),
      'title', trim(p_title),
      'body', trim(p_body)
    ),
    nullif(trim(p_link), '')
  );

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_broadcast_message(text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_message(text, text, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_notify_user(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_link text DEFAULT null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_type text;
  v_target_role text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'Title is required';
  END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Message body is required';
  END IF;

  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF v_target_role = 'admin' THEN
    RAISE EXCEPTION 'Cannot send moderation messages to admins';
  END IF;

  v_type := CASE lower(trim(p_kind))
    WHEN 'warning' THEN 'admin_warning'
    ELSE 'admin_announcement'
  END;

  RETURN public.notify_user(
    p_user_id,
    v_type,
    jsonb_build_object(
      'kind', lower(trim(p_kind)),
      'title', trim(p_title),
      'body', trim(p_body)
    ),
    nullif(trim(p_link), '')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_notify_user(uuid, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_notify_user(uuid, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. USER MODERATION RPCs
-- ---------------------------------------------------------------------------


-- (deduped: earlier admin_list_users)
CREATE OR REPLACE FUNCTION public.admin_ban_user(
  p_user_id uuid,
  p_reason text,
  p_expires_at timestamptz DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_target public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Ban reason is required';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF v_target.role = 'admin' THEN
    RAISE EXCEPTION 'Cannot ban admin accounts';
  END IF;

  UPDATE public.profiles
    SET banned_at = now(),
        ban_expires_at = p_expires_at,
        ban_reason = trim(p_reason),
        banned_by = v_admin_id
    WHERE id = p_user_id;

  PERFORM public.notify_user(
    p_user_id,
    'account_banned',
    jsonb_build_object(
      'reason', trim(p_reason),
      'expiresAt', p_expires_at,
      'permanent', p_expires_at IS NULL
    ),
    '/banned'
  );

  RETURN jsonb_build_object(
    'userId', p_user_id,
    'bannedAt', now(),
    'banExpiresAt', p_expires_at,
    'banReason', trim(p_reason),
    'permanent', p_expires_at IS NULL
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_ban_user(uuid, text, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid, text, timestamptz) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_unban_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;

  UPDATE public.profiles
    SET banned_at = NULL,
        ban_expires_at = NULL,
        ban_reason = NULL,
        banned_by = NULL
    WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN jsonb_build_object('userId', p_user_id, 'unbanned', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_unban_user(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_unban_user(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. ENFORCE BANS IN KEY USER RPCs
-- ---------------------------------------------------------------------------

-- (removed create_recharge_request; canonical definition appended later)



-- (removed create_order_atomic; canonical definition appended later)


-- =============================================================================
-- APPEND: moderation_v2
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS require_verified_accounts boolean NOT NULL DEFAULT false;

-- (removed older protect_profile_sensitive_fields; see later definition)



CREATE OR REPLACE FUNCTION public.get_site_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_row public.store_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.store_settings WHERE id = 1;

  RETURN jsonb_build_object(
    'maintenanceEnabled', COALESCE(v_row.maintenance_enabled, false),
    'maintenanceMessageAr', COALESCE(v_row.maintenance_message_ar, ''),
    'maintenanceMessageEn', COALESCE(v_row.maintenance_message_en, ''),
    'maintenanceAllowAdmins', COALESCE(v_row.maintenance_allow_admins, true),
    'requireVerifiedAccounts', COALESCE(v_row.require_verified_accounts, false)
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_save_site_moderation_settings(
  p_require_verified boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.store_settings
    SET require_verified_accounts = COALESCE(p_require_verified, false)
    WHERE id = 1;

  RETURN public.get_site_status();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_save_site_moderation_settings(boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_save_site_moderation_settings(boolean) TO authenticated;


CREATE OR REPLACE FUNCTION public.assert_user_verified_if_required(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_required boolean;
  v_verified_at timestamptz;
BEGIN
  SELECT COALESCE(require_verified_accounts, false)
  INTO v_required
  FROM public.store_settings
  WHERE id = 1;

  IF NOT v_required THEN
    RETURN;
  END IF;

  SELECT verified_at INTO v_verified_at
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_verified_at IS NULL THEN
    RAISE EXCEPTION 'Account verification required';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_user_verified_if_required(uuid) FROM public;



-- (deduped: earlier admin_list_users)



-- (removed older admin_get_user_profile; see later definition)


REVOKE EXECUTE ON FUNCTION public.admin_get_user_profile(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_user_profile(uuid) TO authenticated;



-- (deduped: earlier admin_verify_user)
CREATE OR REPLACE FUNCTION public.admin_unverify_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.profiles
    SET verified_at = NULL
    WHERE id = p_user_id AND role = 'user';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN jsonb_build_object('userId', p_user_id, 'verified', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_unverify_user(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_unverify_user(uuid) TO authenticated;

-- =============================================================================
-- APPEND: moderation_v3_user_auth
-- =============================================================================

-- (removed older admin_get_user_profile; see later definition)


-- =============================================================================
-- APPEND: username
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL AND trim(username) <> '';

CREATE OR REPLACE FUNCTION public.generate_default_username()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_candidate text;
  v_attempt int := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    v_candidate := 'Echo_' || lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE lower(username) = lower(v_candidate)
    );
    IF v_attempt >= 24 THEN
      v_candidate := 'Echo_' || lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      EXIT;
    END IF;
  END LOOP;
  RETURN v_candidate;
END;
$$;

-- Backfill existing users with stable Echo_ + id fragment (unique per account).
UPDATE public.profiles
SET username = 'Echo_' || lower(substr(replace(id::text, '-', ''), 1, 6))
WHERE username IS NULL OR trim(username) = '';

-- Fill any remaining gaps randomly.
UPDATE public.profiles
SET username = public.generate_default_username()
WHERE username IS NULL OR trim(username) = '';


-- (deduped: earlier profiles_set_defaults)


DROP TRIGGER IF EXISTS profiles_before_insert_defaults ON public.profiles;
CREATE TRIGGER profiles_before_insert_defaults
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_set_defaults();


-- (deduped: earlier handle_new_user)



-- (deduped: earlier protect_profile_sensitive_fields)


DROP FUNCTION IF EXISTS public.admin_list_users(text, int);
CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search text DEFAULT '',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_order_by text DEFAULT 'created_at',
  p_balance_filter text DEFAULT 'all',
  p_status_filter text DEFAULT 'all'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_search text := lower(trim(COALESCE(p_search, '')));
  v_order_by text := lower(trim(COALESCE(p_order_by, 'created_at')));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_order_by NOT IN ('created_at', 'balance', 'total_spent', 'order_count', 'name', 'username') THEN
    v_order_by := 'created_at';
  END IF;

  RETURN (
    WITH filtered AS (
      SELECT
        p.id,
        p.username,
        p.name,
        p.role,
        p.balance,
        p.banned_at,
        p.ban_expires_at,
        p.ban_reason,
        p.verified_at,
        p.phone,
        p.country,
        p.sam_shamcash_wallet_id,
        p.sam_syriatel_recipient,
        p.created_at,
        u.email,
        COALESCE((SELECT SUM(o.total) FROM public.orders o WHERE o.user_id = p.id AND o.status = 'completed'), 0) AS total_spent,
        (SELECT COUNT(*)::int FROM public.orders o WHERE o.user_id = p.id AND o.status = 'completed') AS order_count
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE p.role = 'user'
        AND (
          v_search = ''
          OR lower(COALESCE(p.username, '')) LIKE '%' || v_search || '%'
          OR lower(COALESCE(p.name, '')) LIKE '%' || v_search || '%'
          OR lower(COALESCE(u.email, '')) LIKE '%' || v_search || '%'
        )
        AND (
          lower(COALESCE(p_balance_filter, 'all')) = 'all'
          OR (lower(p_balance_filter) = 'positive' AND p.balance > 0)
          OR (lower(p_balance_filter) = 'zero' AND p.balance = 0)
        )
        AND (
          lower(COALESCE(p_status_filter, 'all')) = 'all'
          OR (lower(p_status_filter) = 'verified' AND p.verified_at IS NOT NULL)
          OR (lower(p_status_filter) = 'unverified' AND p.verified_at IS NULL)
          OR (lower(p_status_filter) = 'banned' AND p.banned_at IS NOT NULL AND (p.ban_expires_at IS NULL OR p.ban_expires_at > now()))
          OR (lower(p_status_filter) = 'active' AND (p.banned_at IS NULL OR (p.ban_expires_at IS NOT NULL AND p.ban_expires_at <= now())))
        )
    )
    SELECT json_build_object(
      'rows', COALESCE((
        SELECT json_agg(row_to_json(page))
        FROM (
          SELECT *
          FROM filtered
          ORDER BY
            CASE WHEN v_order_by = 'balance' THEN balance END DESC NULLS LAST,
            CASE WHEN v_order_by = 'total_spent' THEN total_spent END DESC NULLS LAST,
            CASE WHEN v_order_by = 'order_count' THEN order_count END DESC NULLS LAST,
            CASE WHEN v_order_by = 'name' THEN lower(COALESCE(name, '')) END ASC,
            CASE WHEN v_order_by = 'username' THEN lower(COALESCE(username, '')) END ASC,
            created_at DESC,
            id DESC
          LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
          OFFSET GREATEST(0, COALESCE(p_offset, 0))
        ) page
      ), '[]'::json),
      'total', (SELECT COUNT(*) FROM filtered)
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_users(text, int, int, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, int, int, text, text, text) TO authenticated;

-- (removed older admin_get_user_profile; see later definition)


-- =============================================================================
-- APPEND: username_change
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username_changed_at timestamptz;

CREATE OR REPLACE FUNCTION public.validate_username_format(p_username text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_value text := lower(trim(COALESCE(p_username, '')));
BEGIN
  IF v_value = '' THEN
    RAISE EXCEPTION 'username_invalid';
  END IF;

  v_value := regexp_replace(v_value, '^@+', '');

  IF length(v_value) < 4 OR length(v_value) > 20 THEN
    RAISE EXCEPTION 'username_invalid';
  END IF;

  IF v_value !~ '^[a-z][a-z0-9]*$' THEN
    RAISE EXCEPTION 'username_invalid';
  END IF;

  RETURN v_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_username(p_new_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.profiles%ROWTYPE;
  v_next text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  v_next := public.validate_username_format(p_new_username);

  IF lower(COALESCE(v_row.username, '')) = v_next THEN
    RAISE EXCEPTION 'username_unchanged';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(username) = v_next
      AND id <> v_uid
  ) THEN
    RAISE EXCEPTION 'username_taken';
  END IF;

  UPDATE public.profiles
  SET
    username = v_next,
    username_changed_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'username', v_next,
    'username_changed_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_change_username(
  p_user_id uuid,
  p_new_username text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.profiles%ROWTYPE;
  v_next text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  v_next := public.validate_username_format(p_new_username);

  IF lower(COALESCE(v_row.username, '')) = v_next THEN
    RAISE EXCEPTION 'username_unchanged';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(username) = v_next
      AND id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'username_taken';
  END IF;

  UPDATE public.profiles
  SET username = v_next
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'username', v_next
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.change_username(text) FROM public;
GRANT EXECUTE ON FUNCTION public.change_username(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_change_username(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_change_username(uuid, text) TO authenticated;

-- Include cooldown timestamp in admin profile payload
-- (removed older admin_get_user_profile; see later definition)


-- =============================================================================
-- APPEND: admin_user_profile_fix.sql
-- =============================================================================

-- Fix: admin_get_user_profile referenced order_ref before that column exists.
-- Run this in Supabase SQL Editor if the user detail page errors on order_ref.

-- (removed older admin_get_user_profile; see later definition)


-- =============================================================================
-- APPEND: order_ref
-- =============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_ref_unique
  ON public.orders (order_ref)
  WHERE order_ref IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS public.orders_ref_seq START 100001;

-- Backfill existing orders oldest-first so refs match chronological order.
WITH numbered AS (
  SELECT
    id,
    100000 + row_number() OVER (ORDER BY created_at ASC, id ASC) AS seq
  FROM public.orders
  WHERE order_ref IS NULL OR trim(order_ref) = ''
)
UPDATE public.orders o
SET order_ref = 'EC-' || n.seq::text
FROM numbered n
WHERE o.id = n.id;

SELECT setval(
  'public.orders_ref_seq',
  GREATEST(
    100001,
    COALESCE((
      SELECT max((regexp_replace(order_ref, '^EC-', ''))::bigint)
      FROM public.orders
      WHERE order_ref ~ '^EC-[0-9]+$'
    ), 100000) + 1
  ),
  false
);

CREATE OR REPLACE FUNCTION public.assign_order_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_ref IS NULL OR trim(NEW.order_ref) = '' THEN
    NEW.order_ref := 'EC-' || nextval('public.orders_ref_seq')::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_assign_ref ON public.orders;
CREATE TRIGGER orders_assign_ref
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_order_ref();

-- Include order_ref in admin user profile recent orders.
-- (removed older admin_get_user_profile; see later definition)


-- =============================================================================
-- APPEND: inbox_dismiss
-- =============================================================================


-- (deduped: earlier dismiss_notification)
-- =============================================================================
-- APPEND: game_player_uids
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS game_player_uids jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.upsert_profile_game_player_uid(
  p_user_id uuid,
  p_game_id uuid,
  p_uid text,
  p_server text DEFAULT null
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid text := nullif(trim(p_uid), '');
  v_server text := nullif(trim(p_server), '');
BEGIN
  IF p_user_id IS NULL OR p_game_id IS NULL OR v_uid IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET game_player_uids = COALESCE(game_player_uids, '{}'::jsonb)
    || jsonb_build_object(
      p_game_id::text,
      jsonb_strip_nulls(jsonb_build_object(
        'uid', v_uid,
        'server', v_server,
        'updated_at', now()
      ))
    )
  WHERE id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_profile_game_player_uid(uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.upsert_profile_game_player_uid(uuid, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_order_items_save_game_player_uid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid;
  v_storage_game_id uuid;
  v_uid text;
  v_server text;
BEGIN
  v_uid := nullif(trim(NEW.player_uid), '');
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.user_id INTO v_user_id
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(g.parent_game_id, g.id)
  INTO v_storage_game_id
  FROM public.offers off
  JOIN public.games g ON g.id = off.game_id
  WHERE off.id = NEW.offer_id;

  IF v_storage_game_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_server := nullif(trim(NEW.player_server), '');

  PERFORM public.upsert_profile_game_player_uid(
    v_user_id,
    v_storage_game_id,
    v_uid,
    v_server
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_items_save_game_player_uid ON public.order_items;
CREATE TRIGGER order_items_save_game_player_uid
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_order_items_save_game_player_uid();

-- Patch admin_get_user_profile to expose saved UIDs for gifting
CREATE OR REPLACE FUNCTION public.admin_get_user_profile(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_row public.profiles%ROWTYPE;
  v_email text;
  v_order_count int;
  v_recharge_count int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;

  SELECT count(*)::int INTO v_order_count
  FROM public.orders WHERE user_id = p_user_id;

  SELECT count(*)::int INTO v_recharge_count
  FROM public.recharge_requests WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'email', v_email,
    'name', v_row.name,
    'role', v_row.role,
    'balance', v_row.balance,
    'avatar_url', v_row.avatar_url,
    'bio', v_row.bio,
    'phone', v_row.phone,
    'country', v_row.country,
    'sam_shamcash_wallet_id', v_row.sam_shamcash_wallet_id,
    'sam_syriatel_recipient', v_row.sam_syriatel_recipient,
    'favorite_game', v_row.favorite_game,
    'discord_username', v_row.discord_username,
    'default_player_uid', v_row.default_player_uid,
    'game_player_uids', COALESCE(v_row.game_player_uids, '{}'::jsonb),
    'banned_at', v_row.banned_at,
    'ban_expires_at', v_row.ban_expires_at,
    'ban_reason', v_row.ban_reason,
    'verified_at', v_row.verified_at,
    'created_at', v_row.created_at,
    'orderCount', v_order_count,
    'rechargeCount', v_recharge_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_user_profile(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_user_profile(uuid) TO authenticated;

-- =============================================================================
-- APPEND: admin_gift
-- =============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS gift_message text,
  ADD COLUMN IF NOT EXISTS gift_admin_note text,
  ADD COLUMN IF NOT EXISTS gifted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 1. Block admins from purchasing for themselves via create_order_atomic
-- (removed create_order_atomic; canonical definition appended later)


REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) TO authenticated;

-- 2. Admin gifts a product to a user (no charge)

-- (deduped: earlier admin_gift_order)
-- 3. Dev mock purchase — bypass create_order_atomic admin block
CREATE OR REPLACE FUNCTION public.admin_run_mock_purchase(
  p_offer_id uuid,
  p_mock_code text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_offer public.offers%ROWTYPE;
  v_balance numeric;
  v_dev_test numeric;
  v_needed numeric;
  v_order_id uuid;
  v_fulfill jsonb;
  v_new_balance numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_offer FROM public.offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;

  SELECT balance, dev_test_balance
  INTO v_balance, v_dev_test
  FROM public.profiles WHERE id = v_admin_id FOR UPDATE;

  IF v_balance < v_offer.price THEN
    v_needed := ceil((v_offer.price - v_balance) * 100) / 100;
    PERFORM public.admin_credit_test_balance(v_needed);
    SELECT balance INTO v_balance FROM public.profiles WHERE id = v_admin_id;
  END IF;

  UPDATE public.profiles
  SET
    balance = balance - v_offer.price,
    dev_test_balance = GREATEST(0, dev_test_balance - v_offer.price)
  WHERE id = v_admin_id AND balance >= v_offer.price
  RETURNING balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  INSERT INTO public.orders (user_id, total, payment_method, status)
  VALUES (v_admin_id, v_offer.price, 'balance', 'completed')
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, offer_id, name_snapshot, price, quantity)
  VALUES (
    v_order_id,
    v_offer.id,
    COALESCE(v_offer.name_en, v_offer.name_ar, 'Test offer'),
    v_offer.price,
    1
  );

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (v_admin_id, 'purchase', -v_offer.price, v_new_balance, 'balance', NULL, 'completed');

  v_fulfill := public.admin_mock_fulfill_order(v_order_id, p_mock_code);

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'offerId', v_offer.id,
    'offerName', COALESCE(v_offer.name_en, v_offer.name_ar),
    'total', v_offer.price,
    'newBalance', v_new_balance,
    'devTestBalance', (SELECT dev_test_balance FROM public.profiles WHERE id = v_admin_id),
    'fulfillment', v_fulfill,
    'receiptPath', '/success?orderId=' || v_order_id::text
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_run_mock_purchase(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_run_mock_purchase(uuid, text) TO authenticated;

-- =============================================================================
-- APPEND: syriatel_payment
-- =============================================================================

-- 1. Syriatel manual columns
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS syriatel_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS syriatel_qr_image_url text,
  ADD COLUMN IF NOT EXISTS syriatel_pay_code text;

-- 2. Dual Sam API receiving wallets (store wallets where customers pay)
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS sam_shamcash_wallet_identifier text,
  ADD COLUMN IF NOT EXISTS sam_syriatel_wallet_identifier text;

-- Migrate legacy single wallet identifier
UPDATE public.store_settings
SET
  sam_shamcash_wallet_identifier = COALESCE(
    sam_shamcash_wallet_identifier,
    CASE WHEN COALESCE(sam_invoice_method, 'shamcash') = 'shamcash' THEN sam_wallet_identifier END
  ),
  sam_syriatel_wallet_identifier = COALESCE(
    sam_syriatel_wallet_identifier,
    CASE WHEN sam_invoice_method = 'syriatel' THEN sam_wallet_identifier END
  )
WHERE id = 1;

-- 3. Recharge RPC — accept ShamCash or SyriatelCash
DROP FUNCTION IF EXISTS public.create_recharge_request(numeric);

-- (removed older create_recharge_request; see later definition)


DROP FUNCTION IF EXISTS public.create_recharge_request(numeric, text);

REVOKE EXECUTE ON FUNCTION public.create_recharge_request(numeric, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_recharge_request(numeric, text, text) TO authenticated;

-- 4. Order creation — SyriatelCash manual checkout
-- (removed create_order_atomic; canonical definition appended later)


-- 5. Sam API admin RPCs — dual receiving wallets

-- (deduped: earlier get_sam_api_settings)


DROP FUNCTION IF EXISTS public.save_sam_api_settings(boolean, text, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.save_sam_api_settings(boolean, text, text, text, text, text, boolean, boolean);
DROP FUNCTION IF EXISTS public.save_sam_api_settings(boolean, text, text, text, text, text, boolean, boolean, numeric);


-- (deduped: earlier save_sam_api_settings)
-- 6. Public payment config

-- (deduped: earlier get_payment_methods)
-- =============================================================================
-- APPEND: sam_invoice_recharge
-- =============================================================================

-- 1. create_recharge_request — manual QR or Sam API mode (admin toggle)

-- (deduped: earlier create_recharge_request)


DROP FUNCTION IF EXISTS public.create_recharge_request(numeric, text);

REVOKE EXECUTE ON FUNCTION public.create_recharge_request(numeric, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_recharge_request(numeric, text, text) TO authenticated;

-- 2. Active recharge — include pending Sam invoice for API resume

-- (deduped: earlier get_my_active_recharge_request)
-- 3. Complete recharge after Sam invoice paid (service role / edge only)

-- (deduped: earlier complete_recharge_from_sam_invoice)
-- 4. Cancel pending recharge when Sam invoice expires

-- (deduped: earlier cancel_recharge_from_sam_invoice)
-- 5. Cancel own pending recharge (client) — used by Sam invoice flow when creation
--    fails (e.g. Sam NOT_FOUND), so the user is not stuck on "already pending" lock.

-- (deduped: earlier cancel_my_recharge_request)
-- =============================================================================
-- APPEND: sam_invoice_orders
-- =============================================================================

-- 1. create_order_atomic — API wallet mode branch
-- create_order_atomic: canonical copy in §27


REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) TO authenticated;

-- 2. Complete order after Sam invoice paid (service role / edge only)

-- (deduped: earlier complete_order_from_sam_invoice)
-- 3. Cancel pending order when Sam invoice expires
CREATE OR REPLACE FUNCTION public.cancel_order_from_sam_invoice(p_sam_invoice_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_inv public.sam_invoices%ROWTYPE;
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_inv
  FROM public.sam_invoices
  WHERE sam_invoice_id = p_sam_invoice_id
  FOR UPDATE;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_inv.entity_type IS DISTINCT FROM 'order' OR v_inv.entity_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_an_order');
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_inv.entity_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'order_not_found');
  END IF;

  IF v_order.status = 'completed' THEN
    RETURN jsonb_build_object('orderId', v_order.id, 'status', 'completed', 'skipped', true);
  END IF;

  IF v_order.status IN ('pending_payment', 'payment_sent') THEN
    UPDATE public.orders SET status = 'cancelled' WHERE id = v_order.id;
  END IF;

  RETURN jsonb_build_object(
    'orderId', v_order.id,
    'status', 'cancelled'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_order_from_sam_invoice(text) FROM public;
GRANT EXECUTE ON FUNCTION public.cancel_order_from_sam_invoice(text) TO service_role;

-- =============================================================================
-- §26b Owner-only order receipt (success page / no IDOR)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_order_receipt(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order jsonb;
  v_items jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT to_jsonb(o.*) INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.user_id = v_user_id;

  IF v_order IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(oi.*) ORDER BY oi.created_at), '[]'::jsonb)
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  RETURN jsonb_build_object('order', v_order, 'items', v_items);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_order_receipt(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_order_receipt(uuid) TO authenticated;

-- =============================================================================
-- §27 Canonical create_order_atomic
-- =============================================================================


-- (deduped: earlier create_order_atomic)
-- =============================================================================
-- §28 Site logs (admin activity feed)
-- Apply scripts/site-logs-migration.sql on existing projects (table + RPCs + hooks).
-- =============================================================================

-- =============================================================================
-- §29 SYP recharge + security hardening (also inlined above for fresh installs)
-- Existing projects: scripts/sam-recharge-syp-currency-migration.sql
--   fix-concurrent-balance-purchase.sql, fix-url-order-receipt-security.sql,
--   disable-manual-order-approval-api-mode.sql
-- =============================================================================


-- =============================================================================
-- §30  Post-0.6.0 patches merged from scripts/*.sql (2026-07-24)
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS
-- Source scripts deleted after merge — do not re-run old script files.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/partner-tiers-migration.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- Partner / reseller tiers (cost + markup %) + 15-minute invite links
-- Plan B: partner always pays max(cost + tier%, tiny floor) — not public fixed price
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.partner_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  markup_percent numeric(8,3) NOT NULL CHECK (markup_percent >= 0 AND markup_percent <= 500),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  tier_id uuid NOT NULL REFERENCES public.partner_tiers(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_invites_token_idx ON public.partner_invites (token);
CREATE INDEX IF NOT EXISTS partner_invites_expires_idx ON public.partner_invites (expires_at DESC);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS partner_tier_id uuid REFERENCES public.partner_tiers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_partner_tier_idx ON public.profiles (partner_tier_id)
  WHERE partner_tier_id IS NOT NULL;

ALTER TABLE public.partner_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read active partner tiers" ON public.partner_tiers;
CREATE POLICY "Authenticated read active partner tiers" ON public.partner_tiers
  FOR SELECT TO authenticated
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage partner tiers" ON public.partner_tiers;
CREATE POLICY "Admins manage partner tiers" ON public.partner_tiers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage partner invites" ON public.partner_invites;
CREATE POLICY "Admins manage partner invites" ON public.partner_invites
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Seed default tiers (safe re-run)
INSERT INTO public.partner_tiers (slug, name_en, name_ar, markup_percent, sort_order)
VALUES
  ('reseller', 'Reseller', 'تاجر / محل', 8, 10),
  ('super', 'Super partner', 'شريك سوبر', 1, 20)
ON CONFLICT (slug) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_ar = EXCLUDED.name_ar,
  markup_percent = EXCLUDED.markup_percent,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Partner price helper (ceil to cents)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_price_from_cost(p_cost numeric, p_markup_percent numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cost numeric := COALESCE(p_cost, 0);
  v_pct numeric := COALESCE(p_markup_percent, 0);
  v_marked numeric;
BEGIN
  IF v_cost <= 0 THEN
    RETURN NULL;
  END IF;
  v_marked := v_cost * (1 + v_pct / 100.0);
  RETURN ceil(v_marked * 100) / 100.0;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_my_partner_tier
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_partner_tier()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tier public.partner_tiers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT t.* INTO v_tier
  FROM public.profiles p
  JOIN public.partner_tiers t ON t.id = p.partner_tier_id
  WHERE p.id = v_uid
    AND t.is_active = true;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_tier.id,
    'slug', v_tier.slug,
    'nameEn', v_tier.name_en,
    'nameAr', v_tier.name_ar,
    'markupPercent', v_tier.markup_percent
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_partner_tier() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_partner_tier() TO authenticated;

-- ---------------------------------------------------------------------------
-- Admin: set user partner tier
-- ---------------------------------------------------------------------------

-- (deduped: earlier admin_set_user_partner_tier)
-- ---------------------------------------------------------------------------
-- Admin: upsert tier
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_upsert_partner_tier(
  p_id uuid DEFAULT NULL,
  p_slug text DEFAULT NULL,
  p_name_en text DEFAULT NULL,
  p_name_ar text DEFAULT NULL,
  p_markup_percent numeric DEFAULT NULL,
  p_is_active boolean DEFAULT true,
  p_sort_order integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_slug text;
  v_row public.partner_tiers%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_slug := lower(trim(COALESCE(p_slug, '')));
  IF v_slug = '' OR v_slug !~ '^[a-z][a-z0-9_-]{1,31} THEN
    RAISE EXCEPTION 'Invalid tier slug';
  END IF;

  IF p_markup_percent IS NULL OR p_markup_percent < 0 OR p_markup_percent > 500 THEN
    RAISE EXCEPTION 'Invalid markup percent';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.partner_tiers (slug, name_en, name_ar, markup_percent, is_active, sort_order)
    VALUES (
      v_slug,
      COALESCE(nullif(trim(p_name_en), ''), v_slug),
      COALESCE(nullif(trim(p_name_ar), ''), v_slug),
      p_markup_percent,
      COALESCE(p_is_active, true),
      COALESCE(p_sort_order, 0)
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.partner_tiers
    SET
      slug = v_slug,
      name_en = COALESCE(nullif(trim(p_name_en), ''), name_en),
      name_ar = COALESCE(nullif(trim(p_name_ar), ''), name_ar),
      markup_percent = p_markup_percent,
      is_active = COALESCE(p_is_active, is_active),
      sort_order = COALESCE(p_sort_order, sort_order),
      updated_at = now()
    WHERE id = p_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tier not found';
    END IF;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_upsert_partner_tier(uuid, text, text, text, numeric, boolean, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_upsert_partner_tier(uuid, text, text, text, numeric, boolean, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Admin: create invite (default 15 minutes)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_partner_invite(
  p_tier_id uuid,
  p_minutes integer DEFAULT 15,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_mins integer;
  v_row public.partner_invites%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.partner_tiers WHERE id = p_tier_id AND is_active = true) THEN
    RAISE EXCEPTION 'Invalid partner tier';
  END IF;

  v_mins := GREATEST(5, LEAST(24 * 60, COALESCE(p_minutes, 15)));
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.partner_invites (token, tier_id, created_by, note, expires_at)
  VALUES (
    v_token,
    p_tier_id,
    auth.uid(),
    nullif(trim(p_note), ''),
    now() + make_interval(mins => v_mins)
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'token', v_row.token,
    'tierId', v_row.tier_id,
    'expiresAt', v_row.expires_at,
    'path', '/partner/join?token=' || v_row.token
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_partner_invite(uuid, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_create_partner_invite(uuid, integer, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Accept invite (logged-in user)
-- ---------------------------------------------------------------------------

-- (deduped: earlier accept_partner_invite)
-- ---------------------------------------------------------------------------
-- create_order_atomic: partner pays cost + tier markup (plan B)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, numeric, text, jsonb, text, text);
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, numeric, text, jsonb, text, text, text);


-- (deduped: earlier create_order_atomic)
-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/influencer-referral-coupons-migration.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- Influencer referral codes: % off public price for buyers + % commission to
-- influencer wallet. Replaces fixed wallet-credit coupons.
-- Apply: supabase db query --linked -f scripts/influencer-referral-coupons-migration.sql
-- =============================================================================

-- Coupon columns for referral model
ALTER TABLE public.influencer_coupons
  ADD COLUMN IF NOT EXISTS discount_percent numeric(8,3),
  ADD COLUMN IF NOT EXISTS influencer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- amount_usd was required for old model — relax for referral codes
ALTER TABLE public.influencer_coupons
  ALTER COLUMN amount_usd DROP NOT NULL;

UPDATE public.influencer_coupons
SET discount_percent = 3
WHERE discount_percent IS NULL;

ALTER TABLE public.influencer_coupons
  ALTER COLUMN discount_percent SET DEFAULT 3;

DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'influencer_coupons_discount_percent_check'
  ) THEN
    ALTER TABLE public.influencer_coupons
      ADD CONSTRAINT influencer_coupons_discount_percent_check
      CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 50));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS influencer_coupons_influencer_idx
  ON public.influencer_coupons (influencer_user_id)
  WHERE influencer_user_id IS NOT NULL;

-- Buyer binds a code on their profile
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS influencer_coupon_id uuid REFERENCES public.influencer_coupons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_influencer_coupon_idx
  ON public.profiles (influencer_coupon_id)
  WHERE influencer_coupon_id IS NOT NULL;

-- Track commission per order (idempotent)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS influencer_coupon_id uuid REFERENCES public.influencer_coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS influencer_commission_usd numeric(12,2),
  ADD COLUMN IF NOT EXISTS influencer_commission_paid_at timestamptz;

-- ---------------------------------------------------------------------------
-- Price helper: public * (1 - pct/100), never below supplier cost, never above public
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.influencer_price_from_public(
  p_public numeric,
  p_discount_percent numeric,
  p_cost numeric DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_public numeric := COALESCE(p_public, 0);
  v_pct numeric := COALESCE(p_discount_percent, 0);
  v_cost numeric := COALESCE(p_cost, 0);
  v_price numeric;
BEGIN
  IF v_public <= 0 THEN
    RETURN NULL;
  END IF;
  IF v_pct <= 0 THEN
    RETURN ceil(v_public * 100) / 100.0;
  END IF;
  v_price := v_public * (1 - v_pct / 100.0);
  v_price := ceil(v_price * 100) / 100.0;
  IF v_cost > 0 AND v_price < v_cost THEN
    v_price := ceil(v_cost * 100) / 100.0;
  END IF;
  IF v_price > v_public THEN
    v_price := ceil(v_public * 100) / 100.0;
  END IF;
  IF v_price < 0.01 THEN
    v_price := 0.01;
  END IF;
  RETURN v_price;
END;
$$;

-- ---------------------------------------------------------------------------
-- Admin create / update coupon
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_influencer_coupon(
  p_code text,
  p_discount_percent numeric DEFAULT 3,
  p_influencer_user_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_code text;
  v_row public.influencer_coupons%ROWTYPE;
  v_role text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_code := upper(trim(COALESCE(p_code, '')));
  v_code := regexp_replace(v_code, '\s+', '', 'g');

  IF v_code = '' OR length(v_code) < 3 OR length(v_code) > 32 OR v_code !~ '^[A-Z0-9_-]+ THEN
    RAISE EXCEPTION 'Invalid coupon code';
  END IF;

  IF p_discount_percent IS NULL OR p_discount_percent < 0 OR p_discount_percent > 50 THEN
    RAISE EXCEPTION 'Discount percent must be between 0 and 50';
  END IF;

  IF p_influencer_user_id IS NULL THEN
    RAISE EXCEPTION 'Influencer user is required';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = p_influencer_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Influencer user not found';
  END IF;
  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Cannot assign admin as influencer';
  END IF;

  INSERT INTO public.influencer_coupons (
    code, discount_percent, influencer_user_id, note, expires_at, amount_usd, created_by, is_active
  ) VALUES (
    v_code,
    round(p_discount_percent, 3),
    p_influencer_user_id,
    nullif(trim(p_note), ''),
    p_expires_at,
    NULL,
    auth.uid(),
    true
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Coupon code already exists';
END;
$$;

-- Drop old signature if present (amount-based)
DROP FUNCTION IF EXISTS public.admin_create_influencer_coupon(text, numeric, integer, integer, timestamptz, text);

REVOKE EXECUTE ON FUNCTION public.admin_create_influencer_coupon(text, numeric, uuid, text, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_create_influencer_coupon(text, numeric, uuid, text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_influencer_coupon(
  p_coupon_id uuid,
  p_discount_percent numeric DEFAULT NULL,
  p_influencer_user_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_clear_expires boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row public.influencer_coupons%ROWTYPE;
  v_role text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_discount_percent IS NOT NULL AND (p_discount_percent < 0 OR p_discount_percent > 50) THEN
    RAISE EXCEPTION 'Discount percent must be between 0 and 50';
  END IF;

  IF p_influencer_user_id IS NOT NULL THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = p_influencer_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Influencer user not found';
    END IF;
    IF v_role = 'admin' THEN
      RAISE EXCEPTION 'Cannot assign admin as influencer';
    END IF;
  END IF;

  UPDATE public.influencer_coupons
  SET
    discount_percent = COALESCE(p_discount_percent, discount_percent),
    influencer_user_id = COALESCE(p_influencer_user_id, influencer_user_id),
    note = CASE WHEN p_note IS NULL THEN note ELSE nullif(trim(p_note), '') END,
    expires_at = CASE
      WHEN p_clear_expires THEN NULL
      WHEN p_expires_at IS NOT NULL THEN p_expires_at
      ELSE expires_at
    END,
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_coupon_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coupon not found';
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_influencer_coupon(uuid, numeric, uuid, text, timestamptz, boolean, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_update_influencer_coupon(uuid, numeric, uuid, text, timestamptz, boolean, boolean) TO authenticated;


-- (deduped: earlier admin_list_influencer_coupons)
-- ---------------------------------------------------------------------------
-- Customer applies code (binds to profile — not wallet top-up)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_influencer_coupon(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_coupon public.influencer_coupons%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_code := upper(trim(COALESCE(p_code, '')));
  v_code := regexp_replace(v_code, '\s+', '', 'g');
  IF v_code = '' THEN
    RAISE EXCEPTION 'coupon_invalid';
  END IF;

  SELECT * INTO v_coupon
  FROM public.influencer_coupons
  WHERE upper(code) = v_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coupon_invalid';
  END IF;

  IF v_coupon.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'coupon_inactive';
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RAISE EXCEPTION 'coupon_expired';
  END IF;

  IF v_coupon.influencer_user_id IS NULL THEN
    RAISE EXCEPTION 'coupon_invalid';
  END IF;

  -- Influencer cannot use their own code
  IF v_coupon.influencer_user_id = v_uid THEN
    RAISE EXCEPTION 'coupon_own_code';
  END IF;

  -- Partners already have plan-B pricing; still allow bind for commission path only if not partner?
  -- Prefer partner pricing over influencer; bind is still ok for when they lose partner status.

  UPDATE public.profiles
  SET influencer_coupon_id = v_coupon.id
  WHERE id = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'code', v_coupon.code,
    'discountPercent', v_coupon.discount_percent,
    'couponId', v_coupon.id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_influencer_coupon(text) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_influencer_coupon(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.clear_my_influencer_coupon()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE public.profiles SET influencer_coupon_id = NULL WHERE id = auth.uid();
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_my_influencer_coupon() FROM public;
GRANT EXECUTE ON FUNCTION public.clear_my_influencer_coupon() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_influencer_coupon()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_coupon public.influencer_coupons%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.* INTO v_coupon
  FROM public.profiles p
  JOIN public.influencer_coupons c ON c.id = p.influencer_coupon_id
  WHERE p.id = v_uid
    AND c.is_active = true
    AND (c.expires_at IS NULL OR c.expires_at >= now())
    AND c.influencer_user_id IS DISTINCT FROM v_uid
    AND c.discount_percent IS NOT NULL
    AND c.discount_percent > 0;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_coupon.id,
    'code', v_coupon.code,
    'discountPercent', v_coupon.discount_percent,
    'note', v_coupon.note
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_influencer_coupon() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_influencer_coupon() TO authenticated;

-- ---------------------------------------------------------------------------
-- Pay influencer commission once per completed order
-- ---------------------------------------------------------------------------

-- (deduped: earlier pay_influencer_commission_for_order)
-- ---------------------------------------------------------------------------
-- create_order_atomic: partner OR influencer pricing + commission on balance buy
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, numeric, text, jsonb, text, text);
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, numeric, text, jsonb, text, text, text);


-- (deduped: earlier create_order_atomic)
-- Patch confirm_order_payment to pay commission when manual/API completes order

-- (deduped: earlier confirm_order_payment)
-- Old wallet-credit redeem no longer used
DROP FUNCTION IF EXISTS public.redeem_influencer_coupon(text);


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/influencer-margin-model-migration.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- Influencer codes: buyer pays cost + buyer_markup%; influencer gets % of margin
-- (public - cost). Applied at purchase (code on buy page), not wallet top-up.
-- Apply: supabase db query --linked -f scripts/influencer-margin-model-migration.sql
-- =============================================================================

ALTER TABLE public.influencer_coupons
  ADD COLUMN IF NOT EXISTS buyer_markup_percent numeric(8,3),
  ADD COLUMN IF NOT EXISTS influencer_margin_percent numeric(8,3);

-- Migrate from old discount_percent if present
UPDATE public.influencer_coupons
SET
  buyer_markup_percent = COALESCE(buyer_markup_percent, 10),
  influencer_margin_percent = COALESCE(
    influencer_margin_percent,
    LEAST(50, GREATEST(0, COALESCE(discount_percent, 3)))
  )
WHERE buyer_markup_percent IS NULL OR influencer_margin_percent IS NULL;

ALTER TABLE public.influencer_coupons
  ALTER COLUMN buyer_markup_percent SET DEFAULT 10,
  ALTER COLUMN influencer_margin_percent SET DEFAULT 3;

DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'influencer_coupons_buyer_markup_check'
  ) THEN
    ALTER TABLE public.influencer_coupons
      ADD CONSTRAINT influencer_coupons_buyer_markup_check
      CHECK (buyer_markup_percent IS NULL OR (buyer_markup_percent >= 0 AND buyer_markup_percent <= 500));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'influencer_coupons_inf_margin_check'
  ) THEN
    ALTER TABLE public.influencer_coupons
      ADD CONSTRAINT influencer_coupons_inf_margin_check
      CHECK (influencer_margin_percent IS NULL OR (influencer_margin_percent >= 0 AND influencer_margin_percent <= 100));
  END IF;
END $$;

-- Buyer price: cost * (1 + buyer_markup/100), never above public, never below cost
CREATE OR REPLACE FUNCTION public.influencer_buyer_price(
  p_public numeric,
  p_cost numeric,
  p_buyer_markup_percent numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_public numeric := COALESCE(p_public, 0);
  v_cost numeric := COALESCE(p_cost, 0);
  v_pct numeric := COALESCE(p_buyer_markup_percent, 0);
  v_price numeric;
BEGIN
  IF v_public <= 0 THEN
    RETURN NULL;
  END IF;
  -- No supplier cost → cannot compute margin pricing safely
  IF v_cost <= 0 THEN
    RETURN ceil(v_public * 100) / 100.0;
  END IF;

  v_price := v_cost * (1 + v_pct / 100.0);
  v_price := ceil(v_price * 100) / 100.0;

  IF v_price < v_cost THEN
    v_price := ceil(v_cost * 100) / 100.0;
  END IF;
  IF v_price > v_public THEN
    v_price := ceil(v_public * 100) / 100.0;
  END IF;
  IF v_price < 0.01 THEN
    v_price := 0.01;
  END IF;
  RETURN v_price;
END;
$$;

-- Commission per unit: % of margin (public - cost).
-- Example: public $1.12 cost $1 → margin $0.12; 16.67% ≈ $0.02 to influencer.
-- Capped so store residual (buyer_price - cost - commission) never goes negative.
CREATE OR REPLACE FUNCTION public.influencer_commission_per_unit(
  p_public numeric,
  p_cost numeric,
  p_buyer_price numeric,
  p_influencer_margin_percent numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_public numeric := COALESCE(p_public, 0);
  v_cost numeric := COALESCE(p_cost, 0);
  v_buyer numeric := COALESCE(p_buyer_price, 0);
  v_pct numeric := COALESCE(p_influencer_margin_percent, 0);
  v_margin numeric;
  v_comm numeric;
  v_store_room numeric;
BEGIN
  IF v_cost <= 0 OR v_public <= v_cost OR v_pct <= 0 THEN
    RETURN 0;
  END IF;
  v_margin := v_public - v_cost;
  -- % of the store's full public margin (what user meant by “of the margin”)
  v_comm := round(v_margin * (v_pct / 100.0), 2);
  -- Cannot take more than what remains after buyer discount
  v_store_room := GREATEST(0, v_buyer - v_cost);
  IF v_comm > v_store_room THEN
    v_comm := v_store_room;
  END IF;
  IF v_comm < 0.01 THEN
    RETURN 0;
  END IF;
  RETURN v_comm;
END;
$$;

-- Validate code for buy-page apply (no bind required)
CREATE OR REPLACE FUNCTION public.validate_influencer_coupon(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_coupon public.influencer_coupons%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_code := upper(trim(COALESCE(p_code, '')));
  v_code := regexp_replace(v_code, '\s+', '', 'g');
  IF v_code = '' THEN
    RAISE EXCEPTION 'coupon_invalid';
  END IF;

  SELECT * INTO v_coupon
  FROM public.influencer_coupons
  WHERE upper(code) = v_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coupon_invalid';
  END IF;
  IF v_coupon.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'coupon_inactive';
  END IF;
  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RAISE EXCEPTION 'coupon_expired';
  END IF;
  IF v_coupon.influencer_user_id IS NULL THEN
    RAISE EXCEPTION 'coupon_invalid';
  END IF;
  IF v_coupon.influencer_user_id = v_uid THEN
    RAISE EXCEPTION 'coupon_own_code';
  END IF;
  IF v_coupon.buyer_markup_percent IS NULL THEN
    RAISE EXCEPTION 'coupon_invalid';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_coupon.id,
    'code', v_coupon.code,
    'buyerMarkupPercent', v_coupon.buyer_markup_percent,
    'influencerMarginPercent', v_coupon.influencer_margin_percent,
    'note', v_coupon.note
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_influencer_coupon(text) FROM public;
GRANT EXECUTE ON FUNCTION public.validate_influencer_coupon(text) TO authenticated;

-- Admin create with two % fields
DROP FUNCTION IF EXISTS public.admin_create_influencer_coupon(text, numeric, uuid, text, timestamptz);
DROP FUNCTION IF EXISTS public.admin_create_influencer_coupon(text, numeric, numeric, uuid, text, timestamptz);

CREATE OR REPLACE FUNCTION public.admin_create_influencer_coupon(
  p_code text,
  p_buyer_markup_percent numeric DEFAULT 10,
  p_influencer_margin_percent numeric DEFAULT 3,
  p_influencer_user_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_code text;
  v_row public.influencer_coupons%ROWTYPE;
  v_role text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_code := upper(trim(COALESCE(p_code, '')));
  v_code := regexp_replace(v_code, '\s+', '', 'g');
  IF v_code = '' OR length(v_code) < 3 OR length(v_code) > 32 OR v_code !~ '^[A-Z0-9_-]+ THEN
    RAISE EXCEPTION 'Invalid coupon code';
  END IF;

  IF p_buyer_markup_percent IS NULL OR p_buyer_markup_percent < 0 OR p_buyer_markup_percent > 500 THEN
    RAISE EXCEPTION 'Buyer markup percent invalid';
  END IF;
  IF p_influencer_margin_percent IS NULL OR p_influencer_margin_percent < 0 OR p_influencer_margin_percent > 100 THEN
    RAISE EXCEPTION 'Influencer margin percent invalid';
  END IF;
  IF p_influencer_user_id IS NULL THEN
    RAISE EXCEPTION 'Influencer user is required';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = p_influencer_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Influencer user not found';
  END IF;
  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Cannot assign admin as influencer';
  END IF;

  INSERT INTO public.influencer_coupons (
    code, buyer_markup_percent, influencer_margin_percent,
    influencer_user_id, note, expires_at, amount_usd, discount_percent, created_by, is_active
  ) VALUES (
    v_code,
    round(p_buyer_markup_percent, 3),
    round(p_influencer_margin_percent, 3),
    p_influencer_user_id,
    nullif(trim(p_note), ''),
    p_expires_at,
    NULL,
    NULL,
    auth.uid(),
    true
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Coupon code already exists';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_influencer_coupon(text, numeric, numeric, uuid, text, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_create_influencer_coupon(text, numeric, numeric, uuid, text, timestamptz) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_update_influencer_coupon(uuid, numeric, uuid, text, timestamptz, boolean, boolean);

CREATE OR REPLACE FUNCTION public.admin_update_influencer_coupon(
  p_coupon_id uuid,
  p_buyer_markup_percent numeric DEFAULT NULL,
  p_influencer_margin_percent numeric DEFAULT NULL,
  p_influencer_user_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_clear_expires boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row public.influencer_coupons%ROWTYPE;
  v_role text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_buyer_markup_percent IS NOT NULL AND (p_buyer_markup_percent < 0 OR p_buyer_markup_percent > 500) THEN
    RAISE EXCEPTION 'Buyer markup percent invalid';
  END IF;
  IF p_influencer_margin_percent IS NOT NULL AND (p_influencer_margin_percent < 0 OR p_influencer_margin_percent > 100) THEN
    RAISE EXCEPTION 'Influencer margin percent invalid';
  END IF;

  IF p_influencer_user_id IS NOT NULL THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = p_influencer_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Influencer user not found';
    END IF;
    IF v_role = 'admin' THEN
      RAISE EXCEPTION 'Cannot assign admin as influencer';
    END IF;
  END IF;

  UPDATE public.influencer_coupons
  SET
    buyer_markup_percent = COALESCE(p_buyer_markup_percent, buyer_markup_percent),
    influencer_margin_percent = COALESCE(p_influencer_margin_percent, influencer_margin_percent),
    influencer_user_id = COALESCE(p_influencer_user_id, influencer_user_id),
    note = CASE WHEN p_note IS NULL THEN note ELSE nullif(trim(p_note), '') END,
    expires_at = CASE
      WHEN p_clear_expires THEN NULL
      WHEN p_expires_at IS NOT NULL THEN p_expires_at
      ELSE expires_at
    END,
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_coupon_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coupon not found';
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_influencer_coupon(uuid, numeric, numeric, uuid, text, timestamptz, boolean, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_update_influencer_coupon(uuid, numeric, numeric, uuid, text, timestamptz, boolean, boolean) TO authenticated;


-- (deduped: earlier admin_list_influencer_coupons)
-- Commission pay from order line public vs cost
CREATE OR REPLACE FUNCTION public.pay_influencer_commission_for_order(p_order_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_coupon public.influencer_coupons%ROWTYPE;
  v_commission numeric := 0;
  v_new_bal numeric;
  v_item record;
  v_buyer numeric;
  v_unit_comm numeric;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  IF v_order.status IS DISTINCT FROM 'completed' THEN
    RETURN 0;
  END IF;
  IF v_order.influencer_commission_paid_at IS NOT NULL THEN
    RETURN COALESCE(v_order.influencer_commission_usd, 0);
  END IF;
  IF v_order.influencer_coupon_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_coupon
  FROM public.influencer_coupons
  WHERE id = v_order.influencer_coupon_id
  FOR UPDATE;

  IF NOT FOUND OR v_coupon.influencer_user_id IS NULL THEN
    RETURN 0;
  END IF;
  IF v_coupon.influencer_user_id = v_order.user_id THEN
    RETURN 0;
  END IF;

  FOR v_item IN
    SELECT
      oi.quantity,
      oi.price AS paid_price,
      o.price AS public_price,
      o.g2bulk_cost_usd AS cost
    FROM public.order_items oi
    JOIN public.offers o ON o.id = oi.offer_id
    WHERE oi.order_id = p_order_id
  LOOP
    v_buyer := COALESCE(v_item.paid_price, 0);
    v_unit_comm := public.influencer_commission_per_unit(
      v_item.public_price,
      v_item.cost,
      v_buyer,
      v_coupon.influencer_margin_percent
    );
    v_commission := v_commission
      + (v_unit_comm * GREATEST(1, COALESCE(v_item.quantity, 1)));
  END LOOP;

  v_commission := round(v_commission, 2);
  IF v_commission < 0.01 THEN
    UPDATE public.orders
    SET influencer_commission_usd = 0, influencer_commission_paid_at = now()
    WHERE id = p_order_id;
    RETURN 0;
  END IF;

  PERFORM set_config('echocore.allow_balance_change', '1', true);

  UPDATE public.profiles
  SET balance = COALESCE(balance, 0) + v_commission
  WHERE id = v_coupon.influencer_user_id
  RETURNING balance INTO v_new_bal;

  IF v_new_bal IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.transactions (
    user_id, type, amount, balance_after, payment_method, reference, status
  ) VALUES (
    v_coupon.influencer_user_id,
    'adjustment',
    v_commission,
    v_new_bal,
    'influencer_commission',
    'INF-' || v_coupon.code || '-' || left(p_order_id::text, 8),
    'completed'
  );

  UPDATE public.orders
  SET
    influencer_commission_usd = v_commission,
    influencer_commission_paid_at = now()
  WHERE id = p_order_id;

  UPDATE public.influencer_coupons
  SET redemption_count = COALESCE(redemption_count, 0) + 1, updated_at = now()
  WHERE id = v_coupon.id;

  PERFORM public.notify_user(
    v_coupon.influencer_user_id,
    'influencer_commission',
    jsonb_build_object(
      'amount', v_commission,
      'code', v_coupon.code,
      'orderId', p_order_id,
      'newBalance', v_new_bal,
      'marginPercent', v_coupon.influencer_margin_percent
    ),
    '/profile'
  );

  RETURN v_commission;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pay_influencer_commission_for_order(uuid) FROM public;

-- create_order_atomic with optional p_influencer_code (buy-page apply)
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, numeric, text, jsonb, text, text);
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, numeric, text, jsonb, text, text, text);
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, numeric, text, jsonb, text, text, text, text);


-- (deduped: earlier create_order_atomic)
-- Keep 7-arg overload for older clients (no code)

-- (deduped: earlier create_order_atomic)
-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/influencer-self-read-migration.sql
-- -----------------------------------------------------------------------------
-- Allow influencers to detect their own active codes (for profile/header badge)
-- Apply: supabase db query --linked -f scripts/influencer-self-read-migration.sql

DROP POLICY IF EXISTS "Influencers read own coupons" ON public.influencer_coupons;
CREATE POLICY "Influencers read own coupons" ON public.influencer_coupons
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR influencer_user_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.get_my_influencer_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*)::int, min(code)
  INTO v_count, v_code
  FROM public.influencer_coupons
  WHERE influencer_user_id = v_uid
    AND is_active = true
    AND (expires_at IS NULL OR expires_at >= now());

  IF v_count IS NULL OR v_count < 1 THEN
    RETURN jsonb_build_object('isInfluencer', false);
  END IF;

  RETURN jsonb_build_object(
    'isInfluencer', true,
    'codeCount', v_count,
    'primaryCode', v_code
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_influencer_status() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_influencer_status() TO authenticated;


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/partner-notifs-coupons-migration.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- Partner/verify notifications + thanks to verified users + influencer coupons
-- Apply: supabase db query --linked -f scripts/partner-notifs-coupons-migration.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Notify when admin verifies a user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_verify_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_was timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT verified_at INTO v_was
  FROM public.profiles
  WHERE id = p_user_id AND role = 'user'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  UPDATE public.profiles
  SET verified_at = now()
  WHERE id = p_user_id AND role = 'user';

  -- Only notify on first verification (or re-verify after unverify)
  IF v_was IS NULL THEN
    PERFORM public.notify_user(
      p_user_id,
      'account_verified',
      jsonb_build_object('verified', true),
      '/profile'
    );
  END IF;

  RETURN jsonb_build_object('userId', p_user_id, 'verified', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_verify_user(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_verify_user(uuid) TO authenticated;

-- Auto-verify after recharge: also notify when first verified

-- (deduped: earlier mark_user_verified_after_recharge)
-- ---------------------------------------------------------------------------
-- 2) Notify when partner tier assigned / removed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_partner_tier(
  p_user_id uuid,
  p_tier_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev uuid;
  v_tier public.partner_tiers%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_tier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.partner_tiers WHERE id = p_tier_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Invalid partner tier';
  END IF;

  SELECT partner_tier_id INTO v_prev
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  UPDATE public.profiles
  SET partner_tier_id = p_tier_id
  WHERE id = p_user_id;

  IF p_tier_id IS NOT NULL THEN
    SELECT * INTO v_tier FROM public.partner_tiers WHERE id = p_tier_id;
    PERFORM public.notify_user(
      p_user_id,
      'partner_assigned',
      jsonb_build_object(
        'tierId', v_tier.id,
        'tierSlug', v_tier.slug,
        'tierNameEn', v_tier.name_en,
        'tierNameAr', v_tier.name_ar,
        'markupPercent', v_tier.markup_percent
      ),
      '/catalog'
    );
  ELSIF v_prev IS NOT NULL THEN
    PERFORM public.notify_user(
      p_user_id,
      'partner_removed',
      jsonb_build_object('removed', true),
      '/catalog'
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'userId', p_user_id, 'tierId', p_tier_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_partner_tier(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_set_user_partner_tier(uuid, uuid) TO authenticated;

-- Invite accept also notifies
CREATE OR REPLACE FUNCTION public.accept_partner_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.partner_invites%ROWTYPE;
  v_tier public.partner_tiers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_inv
  FROM public.partner_invites
  WHERE token = trim(p_token)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_invalid';
  END IF;

  IF v_inv.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'invite_used';
  END IF;

  IF v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;

  SELECT * INTO v_tier FROM public.partner_tiers WHERE id = v_inv.tier_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_invalid';
  END IF;

  UPDATE public.profiles
  SET partner_tier_id = v_tier.id
  WHERE id = v_uid;

  UPDATE public.partner_invites
  SET used_at = now(), used_by = v_uid
  WHERE id = v_inv.id;

  PERFORM public.notify_user(
    v_uid,
    'partner_assigned',
    jsonb_build_object(
      'tierId', v_tier.id,
      'tierSlug', v_tier.slug,
      'tierNameEn', v_tier.name_en,
      'tierNameAr', v_tier.name_ar,
      'markupPercent', v_tier.markup_percent,
      'source', 'invite'
    ),
    '/catalog'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'tier', jsonb_build_object(
      'id', v_tier.id,
      'slug', v_tier.slug,
      'nameEn', v_tier.name_en,
      'nameAr', v_tier.name_ar,
      'markupPercent', v_tier.markup_percent
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_partner_invite(text) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_partner_invite(text) TO authenticated;

-- Soft-remove tier (deactivate); clear assignments optional stays on users until reassigned
CREATE OR REPLACE FUNCTION public.admin_delete_partner_tier(p_tier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_users int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_tier_id IS NULL THEN
    RAISE EXCEPTION 'Tier is required';
  END IF;

  SELECT count(*)::int INTO v_users
  FROM public.profiles
  WHERE partner_tier_id = p_tier_id;

  -- Soft delete: deactivate so new assigns/invites cannot use it
  UPDATE public.partner_tiers
  SET is_active = false, updated_at = now()
  WHERE id = p_tier_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tier not found';
  END IF;

  RETURN jsonb_build_object('ok', true, 'tierId', p_tier_id, 'usersOnTier', v_users, 'deactivated', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_partner_tier(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_delete_partner_tier(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Thanks message to all verified users
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_notify_verified_users(
  p_title text,
  p_body text,
  p_link text DEFAULT '/profile'
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user record;
  v_count int := 0;
  v_title text := trim(COALESCE(p_title, ''));
  v_body text := trim(COALESCE(p_body, ''));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_title = '' OR v_body = '' THEN
    RAISE EXCEPTION 'Title and body are required';
  END IF;

  FOR v_user IN
    SELECT id FROM public.profiles
    WHERE role = 'user' AND verified_at IS NOT NULL
  LOOP
    PERFORM public.notify_user(
      v_user.id,
      'verified_thanks',
      jsonb_build_object(
        'title', v_title,
        'body', v_body
      ),
      nullif(trim(p_link), '')
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_notify_verified_users(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_notify_verified_users(text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Influencer coupons (wallet credit on redeem)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.influencer_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  amount_usd numeric(12,2) NOT NULL CHECK (amount_usd > 0 AND amount_usd <= 500),
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemption_count integer NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  per_user_limit integer NOT NULL DEFAULT 1 CHECK (per_user_limit > 0 AND per_user_limit <= 20),
  expires_at timestamptz,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS influencer_coupons_code_uidx
  ON public.influencer_coupons (upper(code));

CREATE TABLE IF NOT EXISTS public.influencer_coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.influencer_coupons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_usd numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS influencer_coupon_redemptions_coupon_idx
  ON public.influencer_coupon_redemptions (coupon_id, created_at DESC);

CREATE INDEX IF NOT EXISTS influencer_coupon_redemptions_user_idx
  ON public.influencer_coupon_redemptions (user_id, created_at DESC);

ALTER TABLE public.influencer_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage influencer coupons" ON public.influencer_coupons;
CREATE POLICY "Admins manage influencer coupons" ON public.influencer_coupons
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins read coupon redemptions" ON public.influencer_coupon_redemptions;
CREATE POLICY "Admins read coupon redemptions" ON public.influencer_coupon_redemptions
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Users read own coupon redemptions" ON public.influencer_coupon_redemptions;
CREATE POLICY "Users read own coupon redemptions" ON public.influencer_coupon_redemptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.admin_create_influencer_coupon(
  p_code text,
  p_amount_usd numeric,
  p_max_redemptions integer DEFAULT NULL,
  p_per_user_limit integer DEFAULT 1,
  p_expires_at timestamptz DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_code text;
  v_row public.influencer_coupons%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_code := upper(trim(COALESCE(p_code, '')));
  v_code := regexp_replace(v_code, '\s+', '', 'g');

  IF v_code = '' OR length(v_code) < 3 OR length(v_code) > 32 OR v_code !~ '^[A-Z0-9_-]+ THEN
    RAISE EXCEPTION 'Invalid coupon code';
  END IF;

  IF p_amount_usd IS NULL OR p_amount_usd < 0.01 OR p_amount_usd > 500 THEN
    RAISE EXCEPTION 'Amount must be between $0.01 and $500';
  END IF;

  IF p_max_redemptions IS NOT NULL AND p_max_redemptions < 1 THEN
    RAISE EXCEPTION 'Max redemptions invalid';
  END IF;

  IF p_per_user_limit IS NULL OR p_per_user_limit < 1 OR p_per_user_limit > 20 THEN
    RAISE EXCEPTION 'Per-user limit invalid';
  END IF;

  INSERT INTO public.influencer_coupons (
    code, amount_usd, max_redemptions, per_user_limit, expires_at, note, created_by
  ) VALUES (
    v_code,
    round(p_amount_usd, 2),
    p_max_redemptions,
    COALESCE(p_per_user_limit, 1),
    p_expires_at,
    nullif(trim(p_note), ''),
    auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Coupon code already exists';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_influencer_coupon(text, numeric, integer, integer, timestamptz, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_create_influencer_coupon(text, numeric, integer, integer, timestamptz, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_influencer_coupon_active(
  p_coupon_id uuid,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row public.influencer_coupons%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.influencer_coupons
  SET is_active = COALESCE(p_is_active, false), updated_at = now()
  WHERE id = p_coupon_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coupon not found';
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_influencer_coupon_active(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_set_influencer_coupon_active(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_influencer_coupons(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_lim integer := GREATEST(1, LEAST(200, COALESCE(p_limit, 50)));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC)
    FROM (
      SELECT *
      FROM public.influencer_coupons
      ORDER BY created_at DESC
      LIMIT v_lim
    ) c
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_influencer_coupons(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_influencer_coupons(integer) TO authenticated;

-- Customer redeems coupon → wallet credit
CREATE OR REPLACE FUNCTION public.redeem_influencer_coupon(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_coupon public.influencer_coupons%ROWTYPE;
  v_user_uses int;
  v_new_balance numeric;
  v_old_balance numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.is_admin() AND auth.uid() = v_uid THEN
    -- Admins have no customer wallet use; still allow for testing if role is user only
    NULL;
  END IF;

  v_code := upper(trim(COALESCE(p_code, '')));
  v_code := regexp_replace(v_code, '\s+', '', 'g');
  IF v_code = '' THEN
    RAISE EXCEPTION 'coupon_invalid';
  END IF;

  -- Serialize per code
  PERFORM pg_advisory_xact_lock(hashtext('coupon:' || v_code));

  SELECT * INTO v_coupon
  FROM public.influencer_coupons
  WHERE upper(code) = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coupon_invalid';
  END IF;

  IF v_coupon.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'coupon_inactive';
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RAISE EXCEPTION 'coupon_expired';
  END IF;

  IF v_coupon.max_redemptions IS NOT NULL AND v_coupon.redemption_count >= v_coupon.max_redemptions THEN
    RAISE EXCEPTION 'coupon_exhausted';
  END IF;

  SELECT count(*)::int INTO v_user_uses
  FROM public.influencer_coupon_redemptions
  WHERE coupon_id = v_coupon.id AND user_id = v_uid;

  IF v_user_uses >= v_coupon.per_user_limit THEN
    RAISE EXCEPTION 'coupon_already_used';
  END IF;

  SELECT COALESCE(balance, 0) INTO v_old_balance
  FROM public.profiles
  WHERE id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  PERFORM set_config('echocore.allow_balance_change', '1', true);

  UPDATE public.profiles
  SET balance = COALESCE(balance, 0) + v_coupon.amount_usd
  WHERE id = v_uid
  RETURNING balance INTO v_new_balance;

  UPDATE public.influencer_coupons
  SET redemption_count = redemption_count + 1, updated_at = now()
  WHERE id = v_coupon.id;

  INSERT INTO public.influencer_coupon_redemptions (coupon_id, user_id, amount_usd)
  VALUES (v_coupon.id, v_uid, v_coupon.amount_usd);

  INSERT INTO public.transactions (
    user_id, type, amount, balance_after, payment_method, reference, status
  ) VALUES (
    v_uid,
    'adjustment',
    v_coupon.amount_usd,
    v_new_balance,
    'coupon',
    'COUPON-' || v_coupon.code,
    'completed'
  );

  PERFORM public.notify_user(
    v_uid,
    'coupon_redeemed',
    jsonb_build_object(
      'amount', v_coupon.amount_usd,
      'code', v_coupon.code,
      'newBalance', v_new_balance,
      'note', v_coupon.note
    ),
    '/profile'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'amount', v_coupon.amount_usd,
    'code', v_coupon.code,
    'newBalance', v_new_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.redeem_influencer_coupon(text) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_influencer_coupon(text) TO authenticated;


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/cart-purchase-security-migration.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- Cart multi-buy + purchase security hardening
-- Run in Supabase SQL Editor on existing projects.
-- - Active offer checks + quantity in totals
-- - Max line items
-- - Idempotency key (safe client retries / double-submit)
-- - Keeps per-user advisory lock + balance FOR UPDATE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.purchase_idempotency (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS purchase_idempotency_created_idx
  ON public.purchase_idempotency (created_at DESC);

ALTER TABLE public.purchase_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own purchase_idempotency" ON public.purchase_idempotency;
CREATE POLICY "Users read own purchase_idempotency" ON public.purchase_idempotency
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- No direct client inserts — SECURITY DEFINER RPC only

-- Drop prior overloads so PostgREST binds a single function
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, numeric, text, jsonb, text, text);
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, numeric, text, jsonb, text, text, text);


-- (deduped: earlier create_order_atomic)
-- Keep 6-arg overload compatible if PostgREST still binds older form
-- (Postgres allows both if defaults differ — we only expose the 7-arg form above)


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/no-refund-on-soft-timeout.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- CRITICAL: Never auto-refund balance when fulfillment "fails" due to poll timeout.
-- G2Bulk often completes AFTER our poll window → refund + user retry = FREE multi-topup.
-- Soft errors → keep/fulfill as "fulfilling" (retryable). Terminal supplier fails only refund.
-- Apply: supabase db query --linked -f scripts/no-refund-on-soft-timeout.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_soft_fulfillment_error(p_error text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_error IS NOT NULL AND (
    p_error ILIKE '%timed out%'
    OR p_error ILIKE '%timeout%'
    OR p_error ILIKE '%still processing%'
    OR p_error ILIKE '%aborted%'
    OR p_error ILIKE '%abort%'
    OR p_error ILIKE '%deadline%'
    OR p_error ILIKE '%network%'
    OR p_error ILIKE '%ECONNRESET%'
    OR p_error ILIKE '%fetch failed%'
  );
$$;


-- (deduped: earlier apply_g2bulk_fulfillment)
-- Block double-buy while a same-player+offer order is still open (paid, not terminal)
CREATE OR REPLACE FUNCTION public.has_open_duplicate_topup(
  p_user_id uuid,
  p_offer_id uuid,
  p_player_uid text,
  p_within_minutes int DEFAULT 20
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid text := nullif(trim(COALESCE(p_player_uid, '')), '');
  v_found boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_offer_id IS NULL OR v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.user_id = p_user_id
      AND o.status = 'completed'
      AND o.fulfillment_status IN ('pending', 'fulfilling')
      AND o.created_at > now() - make_interval(mins => GREATEST(5, LEAST(COALESCE(p_within_minutes, 20), 120)))
      AND oi.offer_id = p_offer_id
      AND nullif(trim(COALESCE(oi.player_uid, '')), '') = v_uid
  ) INTO v_found;

  RETURN COALESCE(v_found, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_open_duplicate_topup(uuid, uuid, text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.has_open_duplicate_topup(uuid, uuid, text, int) TO authenticated;


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/fix-expire-never-kill-supplier-orders.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- Never auto-fail orders that already have a G2Bulk supplier order id.
-- Those must be recovered by re-polling delivery, not marked failed (codes lost!).
-- Apply: supabase db query --linked -f scripts/fix-expire-never-kill-supplier-orders.sql
-- =============================================================================


-- (deduped: earlier expire_stale_pending_orders)
-- Restore EC-style false fails that still have supplier order id (codes recoverable)
UPDATE public.orders
SET
  fulfillment_status = 'fulfilling',
  g2bulk_metadata = COALESCE(g2bulk_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'restored_for_code_recovery', true,
      'restored_at', now(),
      'previous_error', g2bulk_metadata->>'last_error'
    )
    - 'last_error'
    - 'failed_at'
    - 'auto_expired'
WHERE status = 'completed'
  AND fulfillment_status = 'failed'
  AND g2bulk_order_id IS NOT NULL
  AND length(trim(g2bulk_order_id)) > 0
  AND COALESCE((g2bulk_metadata->>'balance_refunded')::boolean, false) = false
  AND (
    g2bulk_metadata->>'last_error' ILIKE '%processing%'
    OR g2bulk_metadata->>'last_error' ILIKE '%stuck%'
    OR g2bulk_metadata->>'last_error' ILIKE '%timeout%'
    OR g2bulk_metadata->>'last_error' ILIKE '%timed out%'
    OR g2bulk_metadata->>'auto_expire_reason' = 'fulfillment_stuck_fulfilling'
  );


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/fix-false-failed-orders-migration.sql
-- -----------------------------------------------------------------------------
-- 1) Stop marking successful legacy completed orders as failed.
-- 2) Restore orders wrongly failed by fulfillment_over_15_minutes auto-expire.
-- Run: supabase db query --linked -f scripts/fix-false-failed-orders-migration.sql


-- (deduped: earlier expire_stale_pending_orders)
-- Restore orders wrongly marked failed by the previous blanket pending→failed expire.
UPDATE public.orders
SET
  fulfillment_status = 'fulfilled',
  g2bulk_metadata = COALESCE(g2bulk_metadata, '{}'::jsonb) || jsonb_build_object(
    'restored_from_false_expire', true,
    'restored_at', now()
  )
WHERE status = 'completed'
  AND fulfillment_status = 'failed'
  AND (
    g2bulk_metadata->>'auto_expire_reason' = 'fulfillment_over_15_minutes'
    OR (
      COALESCE((g2bulk_metadata->>'auto_expired')::boolean, false) = true
      AND g2bulk_metadata->>'last_error' ILIKE '%timed out after 15 minutes%'
    )
  );

-- Also clear false auto-failed when last_error is only the timeout message
-- and order was completed long ago without a real supplier error trail.
UPDATE public.orders
SET
  fulfillment_status = 'fulfilled',
  g2bulk_metadata = COALESCE(g2bulk_metadata, '{}'::jsonb) || jsonb_build_object(
    'restored_from_false_expire', true,
    'restored_at', now()
  )
WHERE status = 'completed'
  AND fulfillment_status = 'failed'
  AND g2bulk_metadata->>'last_error' = 'Fulfillment timed out after 15 minutes';


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/expire-stale-orders-migration.sql
-- -----------------------------------------------------------------------------
-- Auto-close abandoned / stuck orders after 15 minutes.
-- Run: supabase db query --linked -f scripts/expire-stale-orders-migration.sql

CREATE OR REPLACE FUNCTION public.expire_stale_pending_orders(
  p_max_age_minutes int DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_minutes int := GREATEST(5, LEAST(COALESCE(p_max_age_minutes, 15), 120));
  v_cutoff timestamptz := now() - make_interval(mins => v_minutes);
  v_cancelled int := 0;
  v_fulfill_failed int := 0;
BEGIN
  -- Only admins or service role (edge) may run cleanup.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 1) Unpaid / abandoned checkout attempts
  UPDATE public.orders
  SET
    status = 'cancelled',
    g2bulk_metadata = COALESCE(g2bulk_metadata, '{}'::jsonb) || jsonb_build_object(
      'auto_expired', true,
      'auto_expired_at', now(),
      'auto_expire_reason', 'pending_over_15_minutes'
    )
  WHERE status IN ('pending_payment', 'payment_sent')
    AND created_at < v_cutoff;

  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  -- Cancel related open Sam invoices for those orders (best-effort)
  BEGIN
    UPDATE public.sam_invoices si
    SET status = 'expired'
    WHERE si.entity_type = 'order'
      AND si.entity_id IN (
        SELECT id FROM public.orders
        WHERE status = 'cancelled'
          AND COALESCE((g2bulk_metadata->>'auto_expired')::boolean, false) = true
          AND g2bulk_metadata->>'auto_expire_reason' = 'pending_over_15_minutes'
          AND created_at < v_cutoff
      )
      AND COALESCE(si.status, '') NOT IN ('paid', 'completed', 'cancelled');
  EXCEPTION
    WHEN undefined_table THEN NULL;
    WHEN undefined_column THEN NULL;
    WHEN OTHERS THEN NULL;
  END;

  -- 2) Only fail actively stuck "fulfilling" — never bare pending/null
  -- (those are often successful legacy completed sales without tracking).
  UPDATE public.orders
  SET
    fulfillment_status = 'failed',
    g2bulk_metadata = COALESCE(g2bulk_metadata, '{}'::jsonb) || jsonb_build_object(
      'last_error', 'Fulfillment timed out after 15 minutes',
      'auto_expired', true,
      'auto_expired_at', now(),
      'auto_expire_reason', 'fulfillment_stuck_fulfilling'
    )
  WHERE status = 'completed'
    AND fulfillment_status = 'fulfilling'
    AND COALESCE(updated_at, created_at) < v_cutoff;

  GET DIAGNOSTICS v_fulfill_failed = ROW_COUNT;

  RETURN jsonb_build_object(
    'cancelledPending', v_cancelled,
    'failedStuckFulfillment', v_fulfill_failed,
    'maxAgeMinutes', v_minutes,
    'cutoff', v_cutoff
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_pending_orders(int) FROM public;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_orders(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_orders(int) TO service_role;

COMMENT ON FUNCTION public.expire_stale_pending_orders(int) IS
  'Cancels unpaid orders older than N minutes and marks stuck fulfillments as failed.';


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/expire-stale-recharges-migration.sql
-- -----------------------------------------------------------------------------
-- Auto-cancel abandoned recharge requests (لم يكمل stuck for hours/days).
-- Sam invoice webhooks should cancel on expiry; this is a safety net when
-- webhooks miss or the user never finishes.
-- Apply: supabase db query --linked -f scripts/expire-stale-recharges-migration.sql

CREATE OR REPLACE FUNCTION public.expire_stale_pending_recharges(
  p_max_age_minutes int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_minutes int := GREATEST(10, LEAST(COALESCE(p_max_age_minutes, 20), 1440));
  v_cutoff timestamptz := now() - make_interval(mins => v_minutes);
  v_cancelled int := 0;
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  -- Admins, service role, or authenticated users (cleanup on recharge page load)
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    -- Allow any signed-in user to run cleanup (idempotent, no data leak)
    NULL;
  END IF;

  -- 1) pending/payment_sent with expired Sam invoice
  WITH expired_inv AS (
    SELECT DISTINCT r.id
    FROM public.recharge_requests r
    JOIN public.sam_invoices si
      ON si.entity_type = 'recharge'
     AND si.entity_id = r.id
    WHERE r.status IN ('pending', 'payment_sent')
      AND (
        COALESCE(si.status, '') IN ('expired', 'failed', 'cancelled')
        OR (si.expires_at IS NOT NULL AND si.expires_at <= now())
      )
  ),
  upd AS (
    UPDATE public.recharge_requests r
    SET status = 'cancelled', updated_at = now()
    FROM expired_inv e
    WHERE r.id = e.id
      AND r.status IN ('pending', 'payment_sent')
    RETURNING r.id
  )
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_ids FROM upd;

  v_cancelled := coalesce(array_length(v_ids, 1), 0);

  -- 2) Abandoned pending without a paid path — older than cutoff
  WITH stale AS (
    UPDATE public.recharge_requests r
    SET status = 'cancelled', updated_at = now()
    WHERE r.status = 'pending'
      AND r.created_at < v_cutoff
      AND r.id <> ALL (v_ids)
    RETURNING r.id
  )
  SELECT v_cancelled + coalesce((SELECT count(*)::int FROM stale), 0)
  INTO v_cancelled;

  -- Mark open Sam invoices as expired for cancelled recharges (best-effort)
  BEGIN
    UPDATE public.sam_invoices si
    SET status = 'expired'
    WHERE si.entity_type = 'recharge'
      AND si.entity_id IN (
        SELECT id FROM public.recharge_requests
        WHERE status = 'cancelled'
          AND updated_at > now() - interval '2 minutes'
      )
      AND COALESCE(si.status, '') NOT IN ('paid', 'completed', 'cancelled', 'expired');
  EXCEPTION
    WHEN undefined_table THEN NULL;
    WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'cancelledPending', v_cancelled,
    'maxAgeMinutes', v_minutes,
    'cutoff', v_cutoff
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_pending_recharges(int) FROM public;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_recharges(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_recharges(int) TO service_role;

COMMENT ON FUNCTION public.expire_stale_pending_recharges(int) IS
  'Cancels abandoned pending recharges (expired Sam invoice or older than N minutes).';


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/game-custom-images-migration.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- Lock admin-uploaded game cover/logo so G2Bulk catalog sync does not overwrite them.
-- Apply: supabase db query --linked -f scripts/game-custom-images-migration.sql
-- =============================================================================

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS image_custom boolean NOT NULL DEFAULT false;

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS logo_custom boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.games.image_custom IS 'When true, admin set cover (image_url); catalog sync must not overwrite.';
COMMENT ON COLUMN public.games.logo_custom IS 'When true, admin set logo_url; catalog sync must not overwrite.';

-- Backfill: anything hosted on our Supabase storage (or non-G2Bulk CDN) is treated as custom
UPDATE public.games
SET image_custom = true
WHERE image_custom = false
  AND image_url IS NOT NULL
  AND length(trim(image_url)) > 0
  AND (
    image_url ILIKE '%/storage/v1/object/%'
    OR image_url ILIKE '%product-images%'
    OR image_url ILIKE '%supabase.co%'
  )
  AND image_url NOT ILIKE '%g2bulk%';

UPDATE public.games
SET logo_custom = true
WHERE logo_custom = false
  AND logo_url IS NOT NULL
  AND length(trim(logo_url)) > 0
  AND (
    logo_url ILIKE '%/storage/v1/object/%'
    OR logo_url ILIKE '%product-images%'
    OR logo_url ILIKE '%supabase.co%'
  )
  AND logo_url NOT ILIKE '%g2bulk%';

-- Optional: offer sale/custom images (sale_image is already admin-only; keep flag for future)
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS image_custom boolean NOT NULL DEFAULT false;

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS sale_image_custom boolean NOT NULL DEFAULT false;

UPDATE public.offers
SET sale_image_custom = true
WHERE sale_image_custom = false
  AND sale_image_url IS NOT NULL
  AND length(trim(sale_image_url)) > 0;

UPDATE public.offers
SET image_custom = true
WHERE image_custom = false
  AND image_url IS NOT NULL
  AND length(trim(image_url)) > 0
  AND (
    image_url ILIKE '%/storage/v1/object/%'
    OR image_url ILIKE '%product-images%'
    OR image_url ILIKE '%supabase.co%'
  )
  AND image_url NOT ILIKE '%g2bulk%';


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/igdb-settings-migration.sql
-- -----------------------------------------------------------------------------
-- IGDB (Twitch) credentials for admin game image search.
-- Stored in store_settings — not Vite env. Edge function `igdb` reads them.

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS igdb_client_id text;

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS igdb_client_secret text;

COMMENT ON COLUMN public.store_settings.igdb_client_id IS
  'Twitch/IGDB Client ID for game image search (admin UI).';
COMMENT ON COLUMN public.store_settings.igdb_client_secret IS
  'Twitch/IGDB Client Secret (admin UI only; never expose to anon).';


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/igdb-auto-cover-migration.sql
-- -----------------------------------------------------------------------------
-- Optional auto-cover from IGDB when G2Bulk syncs games (admin toggle).
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS igdb_auto_cover_on_sync boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.store_settings.igdb_auto_cover_on_sync IS
  'When true and IGDB keys are set, G2Bulk sync fetches a cover via first name word and sets image_url (skips image_custom games).';


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/binance-pay-migration.sql
-- -----------------------------------------------------------------------------
-- Binance Pay merchant integration: receive USDT customer recharges.
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS binance_api_key text;
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS binance_api_secret text;
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS binance_cert_sn text;
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS binance_merchant_id text;
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS binance_webhook_secret text;
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS binance_api_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.binance_pay_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recharge_request_id uuid REFERENCES public.recharge_requests(id) ON DELETE CASCADE,
  entity_type text NOT NULL DEFAULT 'recharge'
    CHECK (entity_type IN ('recharge', 'order')),
  prepay_id text,
  merchant_trade_no text NOT NULL UNIQUE,
  order_amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USDT',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','expired','failed','cancelled')),
  paid_amount numeric(12,2),
  transaction_ref text,
  checkout_url text,
  biz_status text,
  webhook_received_at timestamptz,
  webhook_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS binance_pay_orders_recharge_idx
  ON public.binance_pay_orders (recharge_request_id);
CREATE INDEX IF NOT EXISTS binance_pay_orders_status_idx
  ON public.binance_pay_orders (status, created_at DESC);

ALTER TABLE public.binance_pay_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full binance_pay_orders" ON public.binance_pay_orders;
CREATE POLICY "Service role full binance_pay_orders" ON public.binance_pay_orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.complete_recharge_from_binance_pay_order(p_merchant_trade_no text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_ord public.binance_pay_orders%ROWTYPE;
  v_row public.recharge_requests%ROWTYPE;
  v_new_balance numeric;
  v_ref text;
  v_paid numeric(12,2);
  v_credit numeric(10,2);
BEGIN
  SELECT * INTO v_ord
  FROM public.binance_pay_orders
  WHERE merchant_trade_no = p_merchant_trade_no
  FOR UPDATE;

  IF v_ord.id IS NULL THEN
    RAISE EXCEPTION 'Binance Pay order not found';
  END IF;

  IF v_ord.entity_type IS DISTINCT FROM 'recharge' OR v_ord.recharge_request_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_a_recharge');
  END IF;

  SELECT * INTO v_row
  FROM public.recharge_requests
  WHERE id = v_ord.recharge_request_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Recharge request not found';
  END IF;

  IF v_row.status = 'approved' THEN
    SELECT balance INTO v_new_balance
    FROM public.profiles
    WHERE id = v_row.user_id;
    RETURN jsonb_build_object(
      'requestId', v_row.id,
      'userId', v_row.user_id,
      'amount', COALESCE(v_row.credited_amount, v_row.amount),
      'requestedAmount', v_row.amount,
      'creditedAmount', COALESCE(v_row.credited_amount, v_row.amount),
      'newBalance', v_new_balance,
      'status', 'approved',
      'skipped', true
    );
  END IF;

  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'Recharge request is not awaiting payment confirmation';
  END IF;

  v_paid := round(COALESCE(v_ord.paid_amount, v_ord.order_amount)::numeric, 2);
  IF v_paid IS NULL OR v_paid <= 0 THEN
    RAISE EXCEPTION 'Paid amount is missing or invalid';
  END IF;
  v_credit := round(v_paid, 2);
  IF v_credit < 0.01 THEN
    RAISE EXCEPTION 'Paid amount too small to credit';
  END IF;

  v_ref := COALESCE(
    nullif(trim(v_ord.transaction_ref), ''),
    nullif(trim(v_row.reference), ''),
    v_ord.merchant_trade_no
  );

  UPDATE public.profiles
  SET balance = COALESCE(balance, 0) + v_credit
  WHERE id = v_row.user_id
  RETURNING balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (v_row.user_id, 'recharge', v_credit, v_new_balance, 'Binance Pay', v_ref, 'completed');

  UPDATE public.recharge_requests
  SET status = 'approved', credited_amount = v_credit, reviewed_at = now(), updated_at = now()
  WHERE id = v_row.id;

  UPDATE public.binance_pay_orders
  SET status = 'paid', paid_amount = v_credit,
    webhook_received_at = COALESCE(webhook_received_at, now()), updated_at = now()
  WHERE id = v_ord.id;

  PERFORM public.notify_user(
    v_row.user_id,
    'recharge_approved',
    jsonb_build_object(
      'requestId', v_row.id, 'amount', v_credit, 'requestedAmount', v_row.amount,
      'creditedAmount', v_credit, 'paidAmount', v_paid, 'payCurrency', v_ord.currency,
      'newBalance', v_new_balance
    ),
    '/profile'
  );

  RETURN jsonb_build_object(
    'requestId', v_row.id, 'userId', v_row.user_id, 'amount', v_credit,
    'requestedAmount', v_row.amount, 'creditedAmount', v_credit, 'paidAmount', v_paid,
    'payCurrency', v_ord.currency, 'newBalance', v_new_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_recharge_from_binance_pay_order(text) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_recharge_from_binance_pay_order(text) TO service_role;


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/bestselling-offers-migration.sql
-- -----------------------------------------------------------------------------
-- Public bestsellers for home “Suggested offers” (top N by completed order qty)
-- Apply: supabase db query --linked -f scripts/bestselling-offers-migration.sql

CREATE OR REPLACE FUNCTION public.get_bestselling_offer_ids(p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_lim integer := GREATEST(1, LEAST(50, COALESCE(p_limit, 10)));
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.units DESC, x.offer_id)
    FROM (
      SELECT
        oi.offer_id,
        SUM(GREATEST(1, COALESCE(oi.quantity, 1)))::bigint AS units
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      JOIN public.offers off ON off.id = oi.offer_id
      WHERE o.status = 'completed'
        AND COALESCE(o.payment_method, '') IS DISTINCT FROM 'admin_gift'
        AND oi.offer_id IS NOT NULL
        AND off.active IS NOT FALSE
      GROUP BY oi.offer_id
      ORDER BY units DESC, oi.offer_id
      LIMIT v_lim
    ) x
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_bestselling_offer_ids(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_bestselling_offer_ids(integer) TO anon, authenticated;


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/player-charname-migration.sql
-- -----------------------------------------------------------------------------
-- Player charname for G2Bulk top-up games (order_items + RPCs).
-- Run: supabase db query --linked -f scripts/player-charname-migration.sql

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS player_charname text;

COMMENT ON COLUMN public.order_items.player_charname IS
  'In-game character name / extra identifier required by some G2Bulk top-up games.';


CREATE OR REPLACE FUNCTION public.admin_gift_order(
  p_target_user_id uuid,
  p_offer_id uuid,
  p_player_uid text DEFAULT null,
  p_player_server text DEFAULT null,
  p_player_charname text DEFAULT null,
  p_gift_message text DEFAULT null,
  p_admin_note text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_offer public.offers%ROWTYPE;
  v_target public.profiles%ROWTYPE;
  v_order_id uuid;
  v_name_snapshot text;
  v_message text;
  v_admin_name text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_target_user_id IS NULL OR p_offer_id IS NULL THEN
    RAISE EXCEPTION 'Target user and offer are required';
  END IF;

  IF p_target_user_id = v_admin_id THEN
    RAISE EXCEPTION 'Cannot gift to yourself — use dev tools for testing';
  END IF;

  SELECT * INTO v_target
  FROM public.profiles
  WHERE id = p_target_user_id;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_target.role = 'admin' THEN
    RAISE EXCEPTION 'Cannot gift to another admin account';
  END IF;

  SELECT * INTO v_offer
  FROM public.offers
  WHERE id = p_offer_id;

  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;

  IF v_offer.active IS FALSE THEN
    RAISE EXCEPTION 'Offer is not active';
  END IF;

  v_name_snapshot := COALESCE(v_offer.name_en, v_offer.name_ar, 'Gift offer');
  v_message := nullif(trim(p_gift_message), '');

  SELECT COALESCE(nullif(trim(name), ''), nullif(trim(username), ''), 'GH-Store')
  INTO v_admin_name
  FROM public.profiles
  WHERE id = v_admin_id;

  INSERT INTO public.orders (
    user_id,
    total,
    payment_method,
    status,
    gift_message,
    gift_admin_note,
    gifted_by
  )
  VALUES (
    p_target_user_id,
    v_offer.price,
    'admin_gift',
    'completed',
    v_message,
    nullif(trim(p_admin_note), ''),
    v_admin_id
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (
    order_id,
    offer_id,
    name_snapshot,
    price,
    quantity,
    player_uid,
    player_server,
    player_charname
  )
  VALUES (
    v_order_id,
    v_offer.id,
    v_name_snapshot,
    v_offer.price,
    1,
    nullif(trim(p_player_uid), ''),
    nullif(trim(p_player_server), ''),
    nullif(trim(p_player_charname), '')
  );

  PERFORM public.notify_user(
    p_target_user_id,
    'order_gifted',
    jsonb_build_object(
      'orderId', v_order_id,
      'total', v_offer.price,
      'offerName', v_name_snapshot,
      'giftMessage', v_message,
      'giftedBy', v_admin_name
    ),
    '/success?orderId=' || v_order_id::text
  );

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'targetUserId', p_target_user_id,
    'offerId', v_offer.id,
    'offerName', v_name_snapshot,
    'total', v_offer.price,
    'status', 'completed',
    'giftMessage', v_message
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_gift_order(uuid, uuid, text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_gift_order(uuid, uuid, text, text, text, text, text) TO authenticated;

-- §27 Canonical create_order_atomic
-- =============================================================================


-- (deduped: earlier create_order_atomic)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/profile-gender-dob-username-signup.sql
-- -----------------------------------------------------------------------------
-- Profile: optional gender + date_of_birth; username availability check for signup
-- Apply: supabase db query --linked -f scripts/profile-gender-dob-username-signup.sql
-- Existing users stay NULL for new columns (no backfill required).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text;

DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_gender_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_gender_check
      CHECK (gender IS NULL OR gender IN ('male', 'female'));
  END IF;
END $$;

-- Public username availability probe (signup + settings before claim)
CREATE OR REPLACE FUNCTION public.check_username_available(p_username text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_raw text := lower(trim(COALESCE(p_username, '')));
  v_uid uuid := auth.uid();
BEGIN
  v_raw := regexp_replace(v_raw, '^@+', '');

  IF v_raw = '' THEN
    RETURN jsonb_build_object(
      'available', true,
      'empty', true,
      'username', ''
    );
  END IF;

  IF length(v_raw) < 4 OR length(v_raw) > 20 OR v_raw !~ '^[a-z][a-z0-9]* THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'username_invalid',
      'username', v_raw
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE lower(p.username) = v_raw
      AND (v_uid IS NULL OR p.id IS DISTINCT FROM v_uid)
  ) THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'username_taken',
      'username', v_raw
    );
  END IF;

  RETURN jsonb_build_object(
    'available', true,
    'empty', false,
    'username', v_raw
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_username_available(text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon, authenticated;

-- Prefer username / gender / DOB from auth signup metadata when present

-- (deduped: earlier handle_new_user)


-- Allow users to set gender + date_of_birth on their own profile (username still via change_username)
-- No extra policy needed if "Users update own name" already allows column updates.


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/google-username-from-email-migration.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- Google / OAuth signup: default username from email local-part
-- e.g. xxxxxx@gmail.com → username "xxxxxx" (sanitized + unique)
--
-- Run in Supabase SQL Editor.
-- Rules match app: ^[a-z][a-z0-9]*$ length 4–20
-- =============================================================================

-- Build a valid username seed from an email address (or empty if unusable).
CREATE OR REPLACE FUNCTION public.username_seed_from_email(p_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_local text;
  v_seed text;
BEGIN
  IF p_email IS NULL OR position('@' in p_email) < 2 THEN
    RETURN NULL;
  END IF;

  -- Local part before @; drop Gmail +tag
  v_local := split_part(lower(trim(p_email)), '@', 1);
  v_local := split_part(v_local, '+', 1);

  -- Keep only a-z0-9 (strip dots, underscores, etc.)
  v_seed := regexp_replace(v_local, '[^a-z0-9]', '', 'g');

  IF v_seed IS NULL OR v_seed = '' THEN
    RETURN NULL;
  END IF;

  -- Must start with a letter
  IF v_seed !~ '^[a-z]' THEN
    v_seed := 'u' || v_seed;
  END IF;

  -- Max 20 before uniqueness suffixes
  v_seed := left(v_seed, 20);

  -- Min length 4: pad with digits from a stable hash of the seed
  IF length(v_seed) < 4 THEN
    v_seed := rpad(v_seed, 4, '0');
  END IF;

  RETURN v_seed;
END;
$$;

-- Unique username: prefer email seed, else Echo_ random (legacy).
CREATE OR REPLACE FUNCTION public.generate_default_username(p_email text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_base text;
  v_candidate text;
  v_attempt int := 0;
  v_suffix text;
BEGIN
  v_base := public.username_seed_from_email(p_email);

  IF v_base IS NOT NULL AND v_base <> '' THEN
    -- Try exact seed, then seed + 2..digits
    LOOP
      v_attempt := v_attempt + 1;
      IF v_attempt = 1 THEN
        v_candidate := v_base;
      ELSE
        v_suffix := (v_attempt - 1)::text;
        v_candidate := left(v_base, greatest(1, 20 - length(v_suffix))) || v_suffix;
      END IF;

      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE lower(username) = lower(v_candidate)
      );

      IF v_attempt >= 40 THEN
        EXIT; -- fall through to random Echo_
      END IF;
    END LOOP;

    IF v_attempt < 40 THEN
      RETURN lower(v_candidate);
    END IF;
  END IF;

  -- Fallback: Echo_ + random (same style as before)
  v_attempt := 0;
  LOOP
    v_attempt := v_attempt + 1;
    v_candidate := 'echo' || lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    -- Ensure pattern ^[a-z][a-z0-9]*$ (no underscore)
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE lower(username) = lower(v_candidate)
    );
    IF v_attempt >= 24 THEN
      v_candidate := 'echo' || lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      EXIT;
    END IF;
  END LOOP;

  RETURN v_candidate;
END;
$$;

-- Before insert: if username empty, derive from email stored on profile... we don't
-- have email on profiles. handle_new_user sets username explicitly. This trigger
-- still fills gaps with random (no email available here).
CREATE OR REPLACE FUNCTION public.profiles_set_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.username IS NULL OR trim(NEW.username) = '' THEN
    NEW.username := public.generate_default_username(NULL);
  END IF;

  IF NEW.name IS NULL OR trim(NEW.name) = '' THEN
    NEW.name := NEW.username;
  END IF;

  RETURN NEW;
END;
$$;

-- New auth users (Google + email signup): username from metadata or email local-part
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_username text;
  v_gender text;
  v_dob text;
  v_date date;
  v_email text;
BEGIN
  v_email := lower(trim(COALESCE(new.email, '')));
  v_name := NULLIF(trim(COALESCE(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'full name',
    ''
  )), '');

  -- Prefer explicit signup username (email form)
  v_username := lower(trim(COALESCE(new.raw_user_meta_data->>'username', '')));
  v_username := regexp_replace(COALESCE(v_username, ''), '^@+', '');

  IF v_username = '' THEN
    -- Google / OTP / no username chosen → from email (xxxxxx@gmail.com → xxxxxx)
    v_username := public.generate_default_username(v_email);
  ELSIF length(v_username) < 4
     OR length(v_username) > 20
     OR v_username !~ '^[a-z][a-z0-9]* THEN
    -- Invalid metadata: fall back to email-based instead of failing OAuth
    v_username := public.generate_default_username(v_email);
  ELSIF EXISTS (
    SELECT 1 FROM public.profiles p WHERE lower(p.username) = v_username
  ) THEN
    v_username := public.generate_default_username(v_email);
  END IF;

  v_gender := lower(trim(COALESCE(new.raw_user_meta_data->>'gender', '')));
  v_dob := nullif(trim(COALESCE(new.raw_user_meta_data->>'date_of_birth', '')), '');

  IF v_gender NOT IN ('male', 'female') THEN
    v_gender := NULL;
  END IF;

  IF v_dob IS NOT NULL THEN
    BEGIN
      v_date := v_dob::date;
      IF v_date > CURRENT_DATE OR v_date < (CURRENT_DATE - INTERVAL '120 years') THEN
        v_date := NULL;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_date := NULL;
    END;
  END IF;

  -- Display name: Google full name, else email local-part, else username
  IF v_name IS NULL OR v_name = '' THEN
    v_name := NULLIF(public.username_seed_from_email(v_email), '');
  END IF;
  IF v_name IS NULL OR v_name = '' THEN
    v_name := v_username;
  END IF;

  INSERT INTO public.profiles (id, role, name, username, gender, date_of_birth)
  VALUES (
    new.id,
    'user',
    v_name,
    v_username,
    v_gender,
    v_date
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

-- Optional: backfill Google users who still have Echo_ random or empty username
-- and whose email local-part is free. Safe to re-run.
DO $
DECLARE
  r record;
  v_seed text;
  v_next text;
BEGIN
  FOR r IN
    SELECT p.id, u.email, p.username
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE u.email IS NOT NULL
      AND (
        p.username IS NULL
        OR trim(p.username) = ''
        OR p.username ~* '^echo[0-9a-f]{6,}
        OR p.username ~* '^echo_'
      )
  LOOP
    v_seed := public.username_seed_from_email(r.email);
    IF v_seed IS NULL THEN
      CONTINUE;
    END IF;
    v_next := public.generate_default_username(r.email);
    IF v_next IS NOT NULL AND v_next <> '' THEN
      UPDATE public.profiles
      SET username = v_next
      WHERE id = r.id
        AND (username IS DISTINCT FROM v_next);
    END IF;
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/inbox-bell-hide-migration.sql
-- -----------------------------------------------------------------------------
-- Bell "clear/dismiss" hides notifications from the header dropdown only.
-- Main /notifications inbox keeps every item (invoices, receipts, history).
-- Run: supabase db query --linked -f scripts/inbox-bell-hide-migration.sql

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS bell_hidden_at timestamptz;

CREATE INDEX IF NOT EXISTS notifications_user_bell_visible_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE bell_hidden_at IS NULL;


-- (deduped: earlier get_my_notifications)


CREATE OR REPLACE FUNCTION public.clear_all_notifications()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.notifications
  SET
    bell_hidden_at = now(),
    read_at = COALESCE(read_at, now())
  WHERE user_id = v_user_id
    AND bell_hidden_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_notification(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_updated int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.notifications
  SET
    bell_hidden_at = now(),
    read_at = COALESCE(read_at, now())
  WHERE id = p_notification_id
    AND user_id = v_user_id
    AND bell_hidden_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/customer-review-admin-notify-migration.sql
-- -----------------------------------------------------------------------------
-- Customer reviews: optional order link + notify admins on new pending review.
-- Run in Supabase SQL Editor (admin).

-- 1) Optional order_id for post-purchase reviews
ALTER TABLE public.customer_reviews
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS customer_reviews_order_id_idx
  ON public.customer_reviews (order_id)
  WHERE order_id IS NOT NULL;

-- 2) Notify all admins when a customer submits a pending review
CREATE OR REPLACE FUNCTION public.on_customer_review_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.is_seed IS TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  PERFORM public.notify_all_admins(
    'admin_customer_review',
    jsonb_build_object(
      'reviewId', NEW.id,
      'authorName', NEW.author_name,
      'userName', NEW.author_name,
      'rating', NEW.rating,
      'message', left(coalesce(NEW.content, ''), 200),
      'orderId', NEW.order_id
    ),
    '/dashboard/reviews'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_review_notify_admins ON public.customer_reviews;
CREATE TRIGGER customer_review_notify_admins
  AFTER INSERT ON public.customer_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.on_customer_review_insert();

COMMENT ON FUNCTION public.on_customer_review_insert() IS
  'Notifies admins of new pending customer reviews for homepage moderation.';

-- 3) Remove seed/mock reviews (real storefront should start empty)
DELETE FROM public.customer_reviews WHERE is_seed = true;


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/contact-replies-migration.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- Contact message in-app conversation (admin ↔ customer)
-- Apply: supabase db query --linked -f scripts/contact-replies-migration.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.contact_message_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_message_id uuid NOT NULL REFERENCES public.contact_messages(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('admin', 'user')),
  sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_message_replies_thread_idx
  ON public.contact_message_replies (contact_message_id, created_at ASC);

ALTER TABLE public.contact_message_replies ENABLE ROW LEVEL SECURITY;

-- Users may read their own contact form rows (registered submitters)
DROP POLICY IF EXISTS "Users read own contact messages" ON public.contact_messages;
CREATE POLICY "Users read own contact messages" ON public.contact_messages
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Replies: admin full access; users read/write only on their threads
DROP POLICY IF EXISTS "Admins manage contact replies" ON public.contact_message_replies;
CREATE POLICY "Admins manage contact replies" ON public.contact_message_replies
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users read own contact replies" ON public.contact_message_replies;
CREATE POLICY "Users read own contact replies" ON public.contact_message_replies
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.contact_messages cm
      WHERE cm.id = contact_message_id
        AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users insert own contact replies" ON public.contact_message_replies;
CREATE POLICY "Users insert own contact replies" ON public.contact_message_replies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_role = 'user'
    AND sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.contact_messages cm
      WHERE cm.id = contact_message_id
        AND cm.user_id = auth.uid()
        AND cm.status <> 'archived'
    )
  );

-- ---------------------------------------------------------------------------
-- Fetch thread (message + replies) for admin or owning user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_contact_thread(p_message_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_msg public.contact_messages%ROWTYPE;
  v_replies jsonb;
BEGIN
  IF p_message_id IS NULL THEN
    RAISE EXCEPTION 'Message id required';
  END IF;

  SELECT * INTO v_msg
  FROM public.contact_messages
  WHERE id = p_message_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF NOT public.is_admin() AND (v_msg.user_id IS NULL OR v_msg.user_id <> auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at ASC), '[]'::jsonb)
  INTO v_replies
  FROM (
    SELECT
      id,
      contact_message_id,
      sender_role,
      sender_user_id,
      body,
      created_at
    FROM public.contact_message_replies
    WHERE contact_message_id = p_message_id
    ORDER BY created_at ASC
  ) r;

  RETURN jsonb_build_object(
    'message', jsonb_build_object(
      'id', v_msg.id,
      'user_id', v_msg.user_id,
      'name', v_msg.name,
      'email', v_msg.email,
      'message', v_msg.message,
      'status', v_msg.status,
      'created_at', v_msg.created_at
    ),
    'replies', v_replies
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_contact_thread(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_contact_thread(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Send reply (admin or owning registered user)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_contact_reply(
  p_message_id uuid,
  p_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_msg public.contact_messages%ROWTYPE;
  v_body text := trim(COALESCE(p_body, ''));
  v_role text;
  v_reply public.contact_message_replies%ROWTYPE;
  v_admin_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_message_id IS NULL THEN
    RAISE EXCEPTION 'Message id required';
  END IF;
  IF length(v_body) = 0 THEN
    RAISE EXCEPTION 'Reply body required';
  END IF;
  IF length(v_body) > 4000 THEN
    RAISE EXCEPTION 'Reply too long';
  END IF;

  SELECT * INTO v_msg
  FROM public.contact_messages
  WHERE id = p_message_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF public.is_admin() THEN
    v_role := 'admin';
  ELSIF v_msg.user_id IS NOT NULL AND v_msg.user_id = auth.uid() THEN
    v_role := 'user';
  ELSE
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_role = 'user' AND v_msg.status = 'archived' THEN
    RAISE EXCEPTION 'Conversation is closed';
  END IF;

  INSERT INTO public.contact_message_replies (
    contact_message_id,
    sender_role,
    sender_user_id,
    body
  )
  VALUES (
    p_message_id,
    v_role,
    auth.uid(),
    v_body
  )
  RETURNING * INTO v_reply;

  -- Mark thread active for admin when customer replies
  IF v_role = 'user' AND v_msg.status = 'read' THEN
    UPDATE public.contact_messages
    SET status = 'new'
    WHERE id = p_message_id;
  ELSIF v_role = 'admin' AND v_msg.status = 'new' THEN
    UPDATE public.contact_messages
    SET status = 'read'
    WHERE id = p_message_id;
  END IF;

  -- Notify the other party
  IF v_role = 'admin' AND v_msg.user_id IS NOT NULL THEN
    SELECT nullif(trim(COALESCE(p.name, p.username, '')), '') INTO v_admin_name
    FROM public.profiles p
    WHERE p.id = auth.uid();

    PERFORM public.notify_user(
      v_msg.user_id,
      'contact_reply',
      jsonb_build_object(
        'messageId', v_msg.id,
        'name', COALESCE(v_admin_name, 'GH-Store'),
        'preview', left(v_body, 160)
      ),
      '/support?message=' || v_msg.id::text
    );
  ELSIF v_role = 'user' THEN
    PERFORM public.notify_all_admins(
      'admin_contact_reply',
      jsonb_build_object(
        'messageId', v_msg.id,
        'name', COALESCE(v_msg.name, ''),
        'email', COALESCE(v_msg.email, ''),
        'preview', left(v_body, 160),
        'userId', auth.uid()
      ),
      '/dashboard/contact?message=' || v_msg.id::text
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_reply.id,
    'contact_message_id', v_reply.contact_message_id,
    'sender_role', v_reply.sender_role,
    'sender_user_id', v_reply.sender_user_id,
    'body', v_reply.body,
    'created_at', v_reply.created_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_contact_reply(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.send_contact_reply(uuid, text) TO authenticated;

-- List contact threads for the current registered user
CREATE OR REPLACE FUNCTION public.get_my_contact_threads(p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.sort_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      s.id,
      s.name,
      s.email,
      s.message,
      s.status,
      s.created_at,
      s.last_reply_at,
      s.reply_count,
      s.sort_at
    FROM (
      SELECT
        cm.id,
        cm.name,
        cm.email,
        cm.message,
        cm.status,
        cm.created_at,
        (
          SELECT max(r.created_at)
          FROM public.contact_message_replies r
          WHERE r.contact_message_id = cm.id
        ) AS last_reply_at,
        (
          SELECT count(*)::int
          FROM public.contact_message_replies r
          WHERE r.contact_message_id = cm.id
        ) AS reply_count,
        COALESCE(
          (
            SELECT max(r.created_at)
            FROM public.contact_message_replies r
            WHERE r.contact_message_id = cm.id
          ),
          cm.created_at
        ) AS sort_at
      FROM public.contact_messages cm
      WHERE cm.user_id = auth.uid()
    ) s
    ORDER BY s.sort_at DESC
    LIMIT v_limit
  ) q;

  RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_contact_threads(int) FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_contact_threads(int) TO authenticated;


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/contact-rate-limit-migration.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- Contact form hardening: submit only via RPC (honeypot + rate limits)
-- Apply: supabase db query --linked -f scripts/contact-rate-limit-migration.sql
-- =============================================================================

-- Index for rate-limit lookups by email
CREATE INDEX IF NOT EXISTS contact_messages_email_created_idx
  ON public.contact_messages (lower(email), created_at DESC);

CREATE INDEX IF NOT EXISTS contact_messages_user_created_idx
  ON public.contact_messages (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Block direct client inserts (bots used the open INSERT policy)
DROP POLICY IF EXISTS "Anyone can submit contact messages" ON public.contact_messages;

-- Optional: keep zero-row insert policy disabled — SECURITY DEFINER RPC only

CREATE OR REPLACE FUNCTION public.submit_contact_message(
  p_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_honeypot text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_message text := trim(COALESCE(p_message, ''));
  v_name text := nullif(trim(COALESCE(p_name, '')), '');
  v_uid uuid := auth.uid();
  v_count int;
  v_id uuid;
BEGIN
  -- Honeypot: bots fill hidden fields — pretend success
  IF p_honeypot IS NOT NULL AND length(trim(p_honeypot)) > 0 THEN
    RETURN jsonb_build_object('ok', true, 'ignored', true);
  END IF;

  IF v_email = '' OR v_message = '' THEN
    RAISE EXCEPTION 'contact_required';
  END IF;

  IF char_length(v_email) < 4 OR char_length(v_email) > 255
     OR v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+ THEN
    RAISE EXCEPTION 'contact_invalid_email';
  END IF;

  IF char_length(v_message) < 10 OR char_length(v_message) > 5000 THEN
    RAISE EXCEPTION 'contact_invalid_message';
  END IF;

  IF v_name IS NOT NULL AND char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'contact_invalid_name';
  END IF;

  -- Rate limit: max 3 messages per email per rolling hour
  SELECT count(*)::int INTO v_count
  FROM public.contact_messages
  WHERE lower(email) = v_email
    AND created_at > now() - interval '1 hour';

  IF v_count >= 3 THEN
    RAISE EXCEPTION 'contact_rate_limited';
  END IF;

  -- Rate limit: max 5 messages per logged-in user per hour
  IF v_uid IS NOT NULL THEN
    SELECT count(*)::int INTO v_count
    FROM public.contact_messages
    WHERE user_id = v_uid
      AND created_at > now() - interval '1 hour';

    IF v_count >= 5 THEN
      RAISE EXCEPTION 'contact_rate_limited';
    END IF;
  END IF;

  INSERT INTO public.contact_messages (user_id, name, email, message, status)
  VALUES (v_uid, v_name, v_email, v_message, 'new')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_contact_message(text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_contact_message(text, text, text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.submit_contact_message(text, text, text, text) IS
  'Public contact form submit with honeypot + per-email/user rate limits. Direct table INSERT is not allowed for clients.';


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/site-logs-migration.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- Site logs — admin activity feed (auth, payments, recharges, orders, contact)
-- Apply: supabase db query --linked -f scripts/site-logs-migration.sql
-- =============================================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS public.site_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_logs_created_at_idx ON public.site_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS site_logs_category_idx ON public.site_logs (category);
CREATE INDEX IF NOT EXISTS site_logs_event_type_idx ON public.site_logs (event_type);

ALTER TABLE public.site_logs ENABLE ROW LEVEL SECURITY;

-- 2. Internal append helper

-- (deduped: earlier append_site_log)
-- 3. Client auth logging (anon + authenticated)
-- NOTE: Keep in sync with scripts/site-logs-auth-all-users.sql
-- FK-safe: only set actor/subject when profiles row exists; enrich all users.

-- (deduped: earlier log_auth_event)

-- (deduped: earlier log_profile_signup_event)


DROP TRIGGER IF EXISTS profiles_log_signup ON public.profiles;
CREATE TRIGGER profiles_log_signup
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_profile_signup_event();

REVOKE EXECUTE ON FUNCTION public.log_profile_signup_event() FROM public;

-- 4. Admin fetch

-- (deduped: earlier get_admin_site_logs)
-- 5. Contact form hook

-- (deduped: earlier on_contact_message_insert)


-- 6. Recharge flows
CREATE OR REPLACE FUNCTION public.create_recharge_request(
  p_amount numeric,
  p_payment_method text DEFAULT 'ShamCash'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_amount numeric(10,2);
  v_reference text;
  v_request_id uuid;
  v_method_ready boolean;
  v_active_count int;
  v_method text := COALESCE(nullif(trim(p_payment_method), ''), 'ShamCash');
  v_wallet_mode text;
  v_user_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_admin() THEN
    RAISE EXCEPTION 'Admin accounts cannot recharge store balance from the storefront';
  END IF;

  BEGIN
    PERFORM public.assert_user_not_banned(v_user_id);
    PERFORM public.assert_user_verified_if_required(v_user_id);
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;

  IF v_method NOT IN ('ShamCash', 'SyriatelCash') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  v_amount := round(p_amount::numeric, 2);

  IF v_amount < 1 OR v_amount > 500 THEN
    RAISE EXCEPTION 'Amount must be between $1 and $500';
  END IF;

  SELECT COALESCE(sam_wallet_mode, 'manual')
  INTO v_wallet_mode
  FROM store_settings
  WHERE id = 1;

  IF v_wallet_mode = 'api' THEN
    IF v_method = 'ShamCash' THEN
      SELECT COALESCE((
        SELECT sam_api_enabled
          AND sam_wallet_mode = 'api'
          AND sam_shamcash_wallet_identifier IS NOT NULL
          AND length(trim(sam_shamcash_wallet_identifier)) > 0
          AND sam_webhook_secret IS NOT NULL
          AND length(trim(sam_webhook_secret)) > 0
        FROM store_settings WHERE id = 1
      ), false) INTO v_method_ready;
      IF NOT v_method_ready THEN
        RAISE EXCEPTION 'Sam API ShamCash recharge is not configured yet';
      END IF;
    ELSE
      SELECT COALESCE((
        SELECT sam_api_enabled
          AND sam_wallet_mode = 'api'
          AND sam_syriatel_wallet_identifier IS NOT NULL
          AND length(trim(sam_syriatel_wallet_identifier)) > 0
          AND sam_webhook_secret IS NOT NULL
          AND length(trim(sam_webhook_secret)) > 0
        FROM store_settings WHERE id = 1
      ), false) INTO v_method_ready;
      IF NOT v_method_ready THEN
        RAISE EXCEPTION 'Sam API Syriatel Cash recharge is not configured yet';
      END IF;
    END IF;
  ELSE
    IF v_method = 'ShamCash' THEN
      SELECT COALESCE((
        SELECT shamcash_enabled
          AND shamcash_qr_image_url IS NOT NULL
          AND length(trim(shamcash_qr_image_url)) > 0
          AND shamcash_pay_code IS NOT NULL
          AND length(trim(shamcash_pay_code)) > 0
        FROM store_settings WHERE id = 1
      ), false) INTO v_method_ready;
      IF NOT v_method_ready THEN
        RAISE EXCEPTION 'Manual ShamCash recharge is not configured yet';
      END IF;
    ELSE
      SELECT COALESCE((
        SELECT syriatel_enabled
          AND syriatel_qr_image_url IS NOT NULL
          AND length(trim(syriatel_qr_image_url)) > 0
          AND syriatel_pay_code IS NOT NULL
          AND length(trim(syriatel_pay_code)) > 0
        FROM store_settings WHERE id = 1
      ), false) INTO v_method_ready;
      IF NOT v_method_ready THEN
        RAISE EXCEPTION 'Manual Syriatel Cash recharge is not configured yet';
      END IF;
    END IF;
  END IF;

  SELECT count(*)::int INTO v_active_count
  FROM recharge_requests
  WHERE user_id = v_user_id
    AND status IN ('pending', 'payment_sent');

  IF v_active_count >= 1 THEN
    RAISE EXCEPTION 'You already have a pending recharge request';
  END IF;

  v_reference := 'GH-Store-' || upper(substr(replace(v_user_id::text, '-', ''), 1, 6))
    || '-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 4));

  INSERT INTO recharge_requests (user_id, amount, reference, status, payment_method)
  VALUES (v_user_id, v_amount, v_reference, 'pending', v_method)
  RETURNING id INTO v_request_id;

  SELECT COALESCE(name, 'Customer') INTO v_user_name FROM profiles WHERE id = v_user_id;

  PERFORM public.append_site_log(
    'recharge',
    'requested',
    'info',
    v_user_id,
    v_user_id,
    jsonb_build_object(
      'requestId', v_request_id,
      'amount', v_amount,
      'reference', v_reference,
      'paymentMethod', v_method,
      'walletMode', v_wallet_mode,
      'userName', v_user_name
    )
  );

  RETURN jsonb_build_object(
    'requestId', v_request_id,
    'reference', v_reference,
    'amount', v_amount,
    'status', 'pending',
    'paymentMethod', v_method
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_recharge_payment_sent(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row recharge_requests%ROWTYPE;
  v_user_name text;
  v_current_balance numeric;
  v_wallet_mode text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(sam_wallet_mode, 'manual')
  INTO v_wallet_mode
  FROM store_settings
  WHERE id = 1;

  IF v_wallet_mode = 'api' THEN
    RAISE EXCEPTION 'Manual payment confirmation is not used in Sam API wallet mode';
  END IF;

  SELECT * INTO v_row
  FROM recharge_requests
  WHERE id = p_request_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recharge request not found';
  END IF;

  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'This recharge request can no longer be updated';
  END IF;

  UPDATE recharge_requests
    SET status = 'payment_sent', updated_at = now()
    WHERE id = p_request_id;

  SELECT name, balance INTO v_user_name, v_current_balance
  FROM profiles WHERE id = v_row.user_id;

  PERFORM public.notify_user(
    v_row.user_id,
    'recharge_payment_sent',
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'reference', v_row.reference,
      'currentBalance', v_current_balance
    ),
    '/recharge'
  );

  PERFORM public.notify_all_admins(
    'admin_recharge_payment_sent',
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'reference', v_row.reference,
      'userName', COALESCE(v_user_name, 'Customer')
    ),
    '/dashboard'
  );

  PERFORM public.append_site_log(
    'recharge',
    'payment_sent',
    'warning',
    v_user_id,
    v_row.user_id,
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'reference', v_row.reference,
      'paymentMethod', v_row.payment_method,
      'userName', COALESCE(v_user_name, 'Customer')
    )
  );

  RETURN jsonb_build_object(
    'requestId', p_request_id,
    'reference', v_row.reference,
    'amount', v_row.amount,
    'status', 'payment_sent',
    'currentBalance', v_current_balance
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_recharge_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_row recharge_requests%ROWTYPE;
  v_new_balance numeric;
  v_user_name text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row
  FROM recharge_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recharge request not found';
  END IF;

  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'Request is not awaiting approval';
  END IF;

  v_new_balance := public.credit_user_balance(
    v_row.user_id,
    v_row.amount,
    v_row.payment_method,
    v_row.reference
  );

  UPDATE recharge_requests
    SET status = 'approved',
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_request_id;

  SELECT COALESCE(name, 'Customer') INTO v_user_name FROM profiles WHERE id = v_row.user_id;

  PERFORM public.notify_user(
    v_row.user_id,
    'recharge_approved',
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'newBalance', v_new_balance
    ),
    '/profile'
  );

  PERFORM public.append_site_log(
    'recharge',
    'approved',
    'success',
    v_admin_id,
    v_row.user_id,
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'newBalance', v_new_balance,
      'paymentMethod', v_row.payment_method,
      'userName', v_user_name
    )
  );

  RETURN jsonb_build_object(
    'requestId', p_request_id,
    'userId', v_row.user_id,
    'amount', v_row.amount,
    'newBalance', v_new_balance,
    'status', 'approved'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_recharge_request(p_request_id uuid, p_note text DEFAULT null)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_row recharge_requests%ROWTYPE;
  v_user_name text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row
  FROM recharge_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recharge request not found';
  END IF;

  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'Request is not awaiting review';
  END IF;

  UPDATE recharge_requests
    SET status = 'rejected',
        admin_note = nullif(trim(p_note), ''),
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_request_id;

  SELECT COALESCE(name, 'Customer') INTO v_user_name FROM profiles WHERE id = v_row.user_id;

  PERFORM public.notify_user(
    v_row.user_id,
    'recharge_rejected',
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'note', nullif(trim(p_note), '')
    ),
    '/recharge'
  );

  PERFORM public.append_site_log(
    'recharge',
    'rejected',
    'danger',
    v_admin_id,
    v_row.user_id,
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'note', nullif(trim(p_note), ''),
      'userName', v_user_name
    )
  );

  RETURN jsonb_build_object(
    'requestId', p_request_id,
    'status', 'rejected'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_my_recharge_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.recharge_requests%ROWTYPE;
  v_user_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.recharge_requests
  WHERE id = p_request_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recharge request not found';
  END IF;

  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'This recharge request can no longer be cancelled';
  END IF;

  UPDATE public.recharge_requests
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_request_id;

  SELECT COALESCE(name, 'Customer') INTO v_user_name FROM profiles WHERE id = v_user_id;

  PERFORM public.append_site_log(
    'recharge',
    'cancelled',
    'info',
    v_user_id,
    v_user_id,
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'userName', v_user_name
    )
  );

  RETURN jsonb_build_object(
    'requestId', p_request_id,
    'status', 'cancelled'
  );
END;
$$;


-- (deduped: earlier complete_recharge_from_sam_invoice)


CREATE OR REPLACE FUNCTION public.cancel_recharge_from_sam_invoice(p_sam_invoice_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_inv public.sam_invoices%ROWTYPE;
  v_row public.recharge_requests%ROWTYPE;
  v_user_name text;
BEGIN
  SELECT * INTO v_inv
  FROM public.sam_invoices
  WHERE sam_invoice_id = p_sam_invoice_id
  FOR UPDATE;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_inv.entity_type IS DISTINCT FROM 'recharge' OR v_inv.entity_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_a_recharge');
  END IF;

  SELECT * INTO v_row
  FROM public.recharge_requests
  WHERE id = v_inv.entity_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Recharge request not found';
  END IF;

  IF v_row.status IN ('approved', 'rejected', 'cancelled') THEN
    RETURN jsonb_build_object(
      'requestId', v_row.id,
      'status', v_row.status,
      'skipped', true
    );
  END IF;

  UPDATE public.recharge_requests
  SET
    status = 'cancelled',
    updated_at = now()
  WHERE id = v_row.id;

  SELECT COALESCE(name, 'Customer') INTO v_user_name FROM public.profiles WHERE id = v_row.user_id;

  PERFORM public.append_site_log(
    'recharge',
    'cancelled',
    'info',
    NULL,
    v_row.user_id,
    jsonb_build_object(
      'requestId', v_row.id,
      'amount', v_row.amount,
      'samInvoiceId', p_sam_invoice_id,
      'reason', 'sam_invoice_expired',
      'userName', v_user_name
    )
  );

  RETURN jsonb_build_object(
    'requestId', v_row.id,
    'status', 'cancelled'
  );
END;
$$;

-- 7. Order flows

-- (deduped: earlier mark_order_payment_sent)


CREATE OR REPLACE FUNCTION public.confirm_order_payment(
  p_order_id uuid,
  p_reference text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_ref text;
  v_user_name text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status NOT IN ('pending_payment', 'payment_sent') THEN
    RAISE EXCEPTION 'Order is not awaiting payment confirmation';
  END IF;

  v_ref := COALESCE(nullif(trim(p_reference), ''), v_order.payment_reference);

  UPDATE public.orders
    SET status = 'completed'
    WHERE id = p_order_id;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  SELECT
    v_order.user_id,
    'purchase',
    -v_order.total,
    p.balance,
    v_order.payment_method,
    v_ref,
    'completed'
  FROM public.profiles p
  WHERE p.id = v_order.user_id;

  SELECT COALESCE(name, 'Customer') INTO v_user_name FROM profiles WHERE id = v_order.user_id;

  PERFORM public.notify_user(
    v_order.user_id,
    'order_completed',
    jsonb_build_object(
      'orderId', p_order_id,
      'total', v_order.total
    ),
    '/success?orderId=' || p_order_id::text
  );

  PERFORM public.append_site_log(
    'order',
    'completed',
    'success',
    v_admin_id,
    v_order.user_id,
    jsonb_build_object(
      'orderId', p_order_id,
      'total', v_order.total,
      'reference', v_ref,
      'paymentMethod', v_order.payment_method,
      'userName', v_user_name
    )
  );

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'status', 'completed'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_order_payment(
  p_order_id uuid,
  p_note text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_user_name text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status NOT IN ('pending_payment', 'payment_sent') THEN
    RAISE EXCEPTION 'Order is not awaiting review';
  END IF;

  UPDATE public.orders
    SET status = 'cancelled'
    WHERE id = p_order_id;

  SELECT COALESCE(name, 'Customer') INTO v_user_name FROM profiles WHERE id = v_order.user_id;

  PERFORM public.notify_user(
    v_order.user_id,
    'order_rejected',
    jsonb_build_object(
      'orderId', p_order_id,
      'total', v_order.total,
      'note', nullif(trim(p_note), '')
    ),
    '/profile'
  );

  PERFORM public.append_site_log(
    'order',
    'rejected',
    'danger',
    v_admin_id,
    v_order.user_id,
    jsonb_build_object(
      'orderId', p_order_id,
      'total', v_order.total,
      'note', nullif(trim(p_note), ''),
      'userName', v_user_name
    )
  );

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'status', 'cancelled',
    'note', nullif(trim(p_note), '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_order_from_sam_invoice(p_sam_invoice_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_inv public.sam_invoices%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_ref text;
  v_user_name text;
BEGIN
  SELECT * INTO v_inv
  FROM public.sam_invoices
  WHERE sam_invoice_id = p_sam_invoice_id
  FOR UPDATE;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_inv.entity_type IS DISTINCT FROM 'order' OR v_inv.entity_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_an_order');
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_inv.entity_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status = 'completed' THEN
    RETURN jsonb_build_object(
      'orderId', v_order.id,
      'status', 'completed',
      'skipped', true
    );
  END IF;

  IF v_order.status NOT IN ('pending_payment', 'payment_sent') THEN
    RAISE EXCEPTION 'Order is not awaiting payment confirmation';
  END IF;

  v_ref := COALESCE(
    nullif(trim(v_inv.transaction_ref), ''),
    nullif(trim(v_order.payment_reference), ''),
    v_inv.sam_invoice_id
  );

  UPDATE public.orders
  SET
    status = 'completed',
    payment_reference = COALESCE(nullif(trim(payment_reference), ''), v_ref)
  WHERE id = v_order.id;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  SELECT
    v_order.user_id,
    'purchase',
    -v_order.total,
    p.balance,
    v_order.payment_method,
    v_ref,
    'completed'
  FROM public.profiles p
  WHERE p.id = v_order.user_id;

  SELECT COALESCE(name, 'Customer') INTO v_user_name FROM public.profiles WHERE id = v_order.user_id;

  PERFORM public.notify_user(
    v_order.user_id,
    'order_completed',
    jsonb_build_object(
      'orderId', v_order.id,
      'total', v_order.total
    ),
    '/success?orderId=' || v_order.id::text
  );

  PERFORM public.append_site_log(
    'order',
    'sam_paid',
    'success',
    NULL,
    v_order.user_id,
    jsonb_build_object(
      'orderId', v_order.id,
      'total', v_order.total,
      'reference', v_ref,
      'paymentMethod', v_order.payment_method,
      'samInvoiceId', p_sam_invoice_id,
      'userName', v_user_name
    )
  );

  RETURN jsonb_build_object(
    'orderId', v_order.id,
    'status', 'completed'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_user_id uuid,
  p_total numeric,
  p_payment_method text,
  p_items jsonb,
  p_player_uid text DEFAULT null,
  p_player_server text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_new_balance numeric;
  v_order_id uuid;
  v_item jsonb;
  v_offer_price numeric;
  v_server_total numeric := 0;
  v_order_status text;
  v_reference text := null;
  v_method_ready boolean := false;
  v_dev_test_balance numeric := 0;
  v_wallet_mode text := 'manual';
  v_user_name text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.is_admin() AND auth.uid() = p_user_id THEN
    RAISE EXCEPTION 'Admins cannot purchase for themselves';
  END IF;

  BEGIN
    PERFORM public.assert_user_not_banned(p_user_id);
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT price INTO v_offer_price
    FROM offers
    WHERE id = (v_item->>'offer_id')::uuid;

    IF v_offer_price IS NULL THEN
      RAISE EXCEPTION 'Offer not found: %', v_item->>'offer_id';
    END IF;

    IF ABS(v_offer_price - (v_item->>'price')::numeric) > 0.001 THEN
      RAISE EXCEPTION 'Price mismatch for offer %: expected %, got %',
        v_item->>'offer_id', v_offer_price, (v_item->>'price')::numeric;
    END IF;

    v_server_total := v_server_total + v_offer_price;
  END LOOP;

  IF ABS(v_server_total - p_total) > 0.001 THEN
    RAISE EXCEPTION 'Total mismatch: expected %, got %', v_server_total, p_total;
  END IF;

  IF p_payment_method = 'balance' THEN
    v_order_status := 'completed';

    UPDATE profiles
    SET
      balance = balance - p_total,
      dev_test_balance = GREATEST(0, dev_test_balance - p_total)
    WHERE id = p_user_id AND balance >= p_total
    RETURNING balance, dev_test_balance INTO v_new_balance, v_dev_test_balance;

    IF v_new_balance IS NULL THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    INSERT INTO transactions (user_id, type, amount, balance_after, payment_method, reference, status)
    VALUES (p_user_id, 'purchase', -p_total, v_new_balance, 'balance', NULL, 'completed');
  ELSE
    v_order_status := 'pending_payment';
    SELECT balance, dev_test_balance
    INTO v_new_balance, v_dev_test_balance
    FROM profiles WHERE id = p_user_id;

    SELECT COALESCE(sam_wallet_mode, 'manual') INTO v_wallet_mode
    FROM store_settings WHERE id = 1;

    IF p_payment_method = 'ShamCash' THEN
      IF v_wallet_mode = 'api' THEN
        SELECT COALESCE((
          SELECT sam_api_enabled
            AND sam_wallet_mode = 'api'
            AND sam_shamcash_wallet_identifier IS NOT NULL
            AND length(trim(sam_shamcash_wallet_identifier)) > 0
            AND sam_webhook_secret IS NOT NULL
            AND length(trim(sam_webhook_secret)) > 0
          FROM store_settings WHERE id = 1
        ), false) INTO v_method_ready;

        IF NOT v_method_ready THEN
          RAISE EXCEPTION 'Sam API ShamCash payment is not configured yet';
        END IF;
      ELSE
        SELECT COALESCE((
          SELECT shamcash_enabled
            AND shamcash_qr_image_url IS NOT NULL
            AND length(trim(shamcash_qr_image_url)) > 0
            AND shamcash_pay_code IS NOT NULL
            AND length(trim(shamcash_pay_code)) > 0
          FROM store_settings WHERE id = 1
        ), false) INTO v_method_ready;

        IF NOT v_method_ready THEN
          RAISE EXCEPTION 'Manual ShamCash payment is not configured yet';
        END IF;

        v_reference := 'GH-Store-ORD-' || upper(substr(replace(p_user_id::text, '-', ''), 1, 6))
          || '-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 4));
      END IF;
    ELSIF p_payment_method = 'SyriatelCash' THEN
      IF v_wallet_mode = 'api' THEN
        SELECT COALESCE((
          SELECT sam_api_enabled
            AND sam_wallet_mode = 'api'
            AND sam_syriatel_wallet_identifier IS NOT NULL
            AND length(trim(sam_syriatel_wallet_identifier)) > 0
            AND sam_webhook_secret IS NOT NULL
            AND length(trim(sam_webhook_secret)) > 0
          FROM store_settings WHERE id = 1
        ), false) INTO v_method_ready;

        IF NOT v_method_ready THEN
          RAISE EXCEPTION 'Sam API Syriatel Cash payment is not configured yet';
        END IF;
      ELSE
        SELECT COALESCE((
          SELECT syriatel_enabled
            AND syriatel_qr_image_url IS NOT NULL
            AND length(trim(syriatel_qr_image_url)) > 0
            AND syriatel_pay_code IS NOT NULL
            AND length(trim(syriatel_pay_code)) > 0
          FROM store_settings WHERE id = 1
        ), false) INTO v_method_ready;

        IF NOT v_method_ready THEN
          RAISE EXCEPTION 'Manual Syriatel Cash payment is not configured yet';
        END IF;

        v_reference := 'GH-Store-ORD-' || upper(substr(replace(p_user_id::text, '-', ''), 1, 6))
          || '-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 4));
      END IF;
    END IF;
  END IF;

  INSERT INTO orders (user_id, total, payment_method, status, payment_reference)
  VALUES (p_user_id, p_total, p_payment_method, v_order_status, v_reference)
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (order_id, offer_id, name_snapshot, price, quantity, player_uid, player_server)
    VALUES (
      v_order_id,
      (v_item->>'offer_id')::uuid,
      v_item->>'name_snapshot',
      (v_item->>'price')::numeric,
      COALESCE((v_item->>'quantity')::integer, 1),
      COALESCE(NULLIF(v_item->>'player_uid', ''), NULLIF(p_player_uid, '')),
      COALESCE(NULLIF(v_item->>'player_server', ''), NULLIF(p_player_server, ''))
    );
  END LOOP;

  SELECT COALESCE(name, 'Customer') INTO v_user_name FROM profiles WHERE id = p_user_id;

  IF p_payment_method = 'balance' AND v_order_status = 'completed' THEN
    PERFORM public.notify_user(
      p_user_id,
      'purchase_completed',
      jsonb_build_object(
        'orderId', v_order_id,
        'total', p_total,
        'newBalance', v_new_balance
      ),
      '/success?orderId=' || v_order_id::text
    );

    PERFORM public.append_site_log(
      'order',
      'balance_paid',
      'success',
      p_user_id,
      p_user_id,
      jsonb_build_object(
        'orderId', v_order_id,
        'total', p_total,
        'newBalance', v_new_balance,
        'userName', v_user_name
      )
    );
  ELSIF v_order_status = 'pending_payment' THEN
    PERFORM public.append_site_log(
      'order',
      'placed',
      'info',
      p_user_id,
      p_user_id,
      jsonb_build_object(
        'orderId', v_order_id,
        'total', p_total,
        'paymentMethod', p_payment_method,
        'reference', v_reference,
        'walletMode', v_wallet_mode,
        'userName', v_user_name
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'newBalance', v_new_balance,
    'devTestBalance', v_dev_test_balance,
    'status', v_order_status,
    'reference', v_reference
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/site-logs-wallet-errors-migration.sql
-- -----------------------------------------------------------------------------
-- Site logs: wallet ledger events + client critical errors + severity filter
-- Apply: supabase db query --linked -f scripts/site-logs-wallet-errors-migration.sql
-- Requires: scripts/site-logs-migration.sql (append_site_log, site_logs table)

-- 1) Normalize severity on append (error → danger)
CREATE OR REPLACE FUNCTION public.append_site_log(
  p_category text,
  p_event_type text,
  p_severity text DEFAULT 'info',
  p_actor_user_id uuid DEFAULT NULL,
  p_subject_user_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_severity text := lower(trim(COALESCE(p_severity, 'info')));
BEGIN
  IF p_category IS NULL OR length(trim(p_category)) = 0 THEN
    RETURN NULL;
  END IF;
  IF p_event_type IS NULL OR length(trim(p_event_type)) = 0 THEN
    RETURN NULL;
  END IF;

  IF v_severity IN ('error', 'err', 'critical', 'fatal') THEN
    v_severity := 'danger';
  ELSIF v_severity IN ('warn') THEN
    v_severity := 'warning';
  ELSIF v_severity IN ('ok', 'ok ') THEN
    v_severity := 'success';
  ELSIF v_severity NOT IN ('info', 'success', 'warning', 'danger') THEN
    v_severity := 'info';
  END IF;

  INSERT INTO public.site_logs (
    category,
    event_type,
    severity,
    actor_user_id,
    subject_user_id,
    metadata
  )
  VALUES (
    trim(p_category),
    trim(p_event_type),
    v_severity,
    p_actor_user_id,
    p_subject_user_id,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.append_site_log(text, text, text, uuid, uuid, jsonb) FROM public;

-- 2) Wallet movement log on every transactions row
CREATE OR REPLACE FUNCTION public.log_wallet_transaction_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_name text;
  v_severity text := 'info';
  v_event text;
  v_amount numeric;
BEGIN
  v_event := lower(trim(COALESCE(NEW.type, 'movement')));
  v_amount := COALESCE(NEW.amount, 0);

  -- Purchases already logged via order triggers (balance_paid / completed).
  -- Logging type=purchase again only shows a bare "purchase" line in the monitor.
  IF v_event = 'purchase' THEN
    RETURN NEW;
  END IF;

  IF v_event = 'recharge' OR (v_event = 'adjustment' AND v_amount > 0) THEN
    v_severity := 'success';
  ELSIF v_event = 'refund' THEN
    v_severity := 'warning';
  ELSIF v_event = 'adjustment' AND v_amount < 0 THEN
    v_severity := 'warning';
  ELSE
    v_severity := 'info';
  END IF;

  SELECT nullif(trim(COALESCE(p.name, p.username, '')), '')
  INTO v_user_name
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  PERFORM public.append_site_log(
    'wallet',
    v_event,
    v_severity,
    NEW.user_id,
    NEW.user_id,
    jsonb_build_object(
      'transactionId', NEW.id,
      'amount', NEW.amount,
      'balanceAfter', NEW.balance_after,
      'paymentMethod', NEW.payment_method,
      'reference', NEW.reference,
      'status', NEW.status,
      'userName', COALESCE(v_user_name, ''),
      'type', NEW.type
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS transactions_log_wallet ON public.transactions;
CREATE TRIGGER transactions_log_wallet
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.log_wallet_transaction_event();

REVOKE EXECUTE ON FUNCTION public.log_wallet_transaction_event() FROM public;

-- 3) Client / storefront critical errors (any authenticated user; rate-limited)
CREATE OR REPLACE FUNCTION public.log_client_error(
  p_event_type text,
  p_severity text DEFAULT 'danger',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_severity text := lower(trim(COALESCE(p_severity, 'danger')));
  v_event text := left(trim(COALESCE(p_event_type, 'client_error')), 80);
  v_meta jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_recent int := 0;
BEGIN
  IF v_event = '' THEN
    v_event := 'client_error';
  END IF;

  IF v_severity IN ('error', 'err', 'critical', 'fatal') THEN
    v_severity := 'danger';
  ELSIF v_severity = 'warn' THEN
    v_severity := 'warning';
  END IF;

  -- Only warning / danger (no spam info from clients)
  IF v_severity NOT IN ('warning', 'danger') THEN
    v_severity := 'danger';
  END IF;

  -- Rate limit: 12 per user (or anon fingerprint) per minute
  IF v_uid IS NOT NULL THEN
    SELECT count(*)::int INTO v_recent
    FROM public.site_logs
    WHERE category = 'error'
      AND actor_user_id = v_uid
      AND created_at > now() - interval '1 minute';
  ELSE
    SELECT count(*)::int INTO v_recent
    FROM public.site_logs
    WHERE category = 'error'
      AND actor_user_id IS NULL
      AND created_at > now() - interval '1 minute'
      AND metadata->>'sessionKey' IS NOT DISTINCT FROM (v_meta->>'sessionKey');
  END IF;

  IF v_recent >= 12 THEN
    RETURN;
  END IF;

  -- Cap huge console dumps
  IF v_meta ? 'consoleLog' AND length(v_meta->>'consoleLog') > 12000 THEN
    v_meta := v_meta || jsonb_build_object(
      'consoleLog', left(v_meta->>'consoleLog', 12000) || E'\n…[truncated]'
    );
  END IF;
  IF v_meta ? 'stack' AND length(v_meta->>'stack') > 8000 THEN
    v_meta := v_meta || jsonb_build_object(
      'stack', left(v_meta->>'stack', 8000) || E'\n…[truncated]'
    );
  END IF;

  IF v_uid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid) THEN
    v_uid := NULL;
  END IF;

  PERFORM public.append_site_log(
    'error',
    v_event,
    v_severity,
    v_uid,
    v_uid,
    v_meta
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_client_error(text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, jsonb) TO anon, authenticated;

-- 4) Admin fetch: category + optional severity bucket (critical = warn/danger)
CREATE OR REPLACE FUNCTION public.get_admin_site_logs(
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_category text DEFAULT NULL,
  p_severity text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
  v_category text := nullif(trim(p_category), '');
  v_severity text := lower(nullif(trim(p_severity), ''));
  v_total bigint;
  v_logs jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_severity IN ('error', 'err', 'critical', 'fatal') THEN
    v_severity := 'critical';
  ELSIF v_severity = 'warn' THEN
    v_severity := 'warning';
  END IF;

  SELECT count(*)::bigint INTO v_total
  FROM public.site_logs sl
  WHERE (v_category IS NULL OR sl.category = v_category)
    AND (
      v_severity IS NULL
      OR (v_severity = 'critical' AND sl.severity IN ('warning', 'danger', 'error'))
      OR (v_severity IS DISTINCT FROM 'critical' AND sl.severity = v_severity)
    );

  SELECT COALESCE(jsonb_agg(row_to_json(q)::jsonb ORDER BY q.created_at DESC), '[]'::jsonb)
  INTO v_logs
  FROM (
    SELECT
      sl.id,
      sl.category,
      sl.event_type,
      CASE
        WHEN sl.severity IN ('error', 'err') THEN 'danger'
        ELSE sl.severity
      END AS severity,
      sl.actor_user_id,
      sl.subject_user_id,
      sl.metadata,
      sl.created_at,
      COALESCE(ap.name, ap.username, au.email, '') AS actor_name,
      COALESCE(sp.name, sp.username, su.email, '') AS subject_name
    FROM public.site_logs sl
    LEFT JOIN public.profiles ap ON ap.id = sl.actor_user_id
    LEFT JOIN auth.users au ON au.id = sl.actor_user_id
    LEFT JOIN public.profiles sp ON sp.id = sl.subject_user_id
    LEFT JOIN auth.users su ON su.id = sl.subject_user_id
    WHERE (v_category IS NULL OR sl.category = v_category)
      AND (
        v_severity IS NULL
        OR (v_severity = 'critical' AND sl.severity IN ('warning', 'danger', 'error'))
        OR (v_severity IS DISTINCT FROM 'critical' AND sl.severity = v_severity)
      )
    ORDER BY sl.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) q;

  RETURN jsonb_build_object(
    'logs', v_logs,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_site_logs(int, int, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_admin_site_logs(int, int, text, text) TO authenticated;

-- Keep 3-arg overload for older clients

-- (deduped: earlier get_admin_site_logs)
-- 5) Admin-only dev events: allow larger console payloads (already admin-gated)

-- (deduped: earlier log_dev_event)
-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/site-logs-auth-all-users.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- Site logs: log sign-in / sign-up for EVERY user (not only admins)
-- Apply: supabase db query --linked -f scripts/site-logs-auth-all-users.sql
--
-- Root cause: log_auth_event always set actor/subject = auth.uid(). If that
-- user has no profiles row yet (race on first login / OAuth), the INSERT into
-- site_logs fails on FK (actor_user_id → profiles.id) and the event is lost.
-- Admin accounts always have a profile, so only their logins appeared.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.log_auth_event(
  p_event_type text,
  p_email text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_allowed text[] := ARRAY[
    'login_success', 'login_failed', 'logout', 'signup_success', 'signup_failed'
  ];
  v_severity text := 'info';
  v_meta jsonb;
  v_email text;
  v_name text;
  v_meta_user_id uuid;
BEGIN
  IF p_event_type IS NULL OR NOT (p_event_type = ANY(v_allowed)) THEN
    RETURN;
  END IF;

  v_email := lower(trim(COALESCE(p_email, '')));
  IF v_email = '' THEN
    v_email := NULL;
  END IF;

  v_meta := COALESCE(p_metadata, '{}'::jsonb);

  -- Optional client-supplied user id (when session JWT not ready yet)
  IF v_user_id IS NULL AND v_meta ? 'userId' AND nullif(trim(v_meta->>'userId'), '') IS NOT NULL THEN
    BEGIN
      v_meta_user_id := (trim(v_meta->>'userId'))::uuid;
      v_user_id := v_meta_user_id;
    EXCEPTION WHEN OTHERS THEN
      v_user_id := NULL;
    END;
  END IF;

  -- Resolve by email via auth.users when uid still unknown
  IF v_user_id IS NULL AND v_email IS NOT NULL THEN
    SELECT u.id INTO v_user_id
    FROM auth.users u
    WHERE lower(u.email) = v_email
    ORDER BY u.created_at DESC
    LIMIT 1;
  END IF;

  -- Email from auth.users when missing
  IF v_email IS NULL AND v_user_id IS NOT NULL THEN
    SELECT lower(u.email) INTO v_email
    FROM auth.users u
    WHERE u.id = v_user_id;
  END IF;

  -- Display name from profiles / metadata
  v_name := nullif(trim(COALESCE(v_meta->>'userName', v_meta->>'name', '')), '');
  IF v_name IS NULL AND v_user_id IS NOT NULL THEN
    SELECT nullif(trim(COALESCE(p.name, p.username, '')), '') INTO v_name
    FROM public.profiles p
    WHERE p.id = v_user_id;
  END IF;
  IF v_name IS NULL AND v_email IS NOT NULL THEN
    v_name := split_part(v_email, '@', 1);
  END IF;

  -- CRITICAL: only set actor/subject when a profiles row exists (FK on site_logs)
  IF v_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_user_id
  ) THEN
    v_user_id := NULL;
  END IF;

  -- Soft dedupe: same successful login within 30s (tab focus / double handlers)
  IF p_event_type = 'login_success' AND (v_user_id IS NOT NULL OR v_email IS NOT NULL) THEN
    IF EXISTS (
      SELECT 1
      FROM public.site_logs
      WHERE event_type = 'login_success'
        AND created_at > now() - interval '30 seconds'
        AND (
          (v_user_id IS NOT NULL AND actor_user_id = v_user_id)
          OR (v_email IS NOT NULL AND metadata->>'email' = v_email)
        )
    ) THEN
      RETURN;
    END IF;
  END IF;

  IF p_event_type = 'login_failed' AND v_email IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.site_logs
      WHERE event_type = 'login_failed'
        AND metadata->>'email' = v_email
        AND created_at > now() - interval '60 seconds'
    ) THEN
      RETURN;
    END IF;
  END IF;

  -- Soft dedupe signups (client + DB trigger may both fire)
  IF p_event_type = 'signup_success' AND (v_user_id IS NOT NULL OR v_email IS NOT NULL) THEN
    IF EXISTS (
      SELECT 1
      FROM public.site_logs
      WHERE event_type = 'signup_success'
        AND created_at > now() - interval '5 minutes'
        AND (
          (v_user_id IS NOT NULL AND actor_user_id = v_user_id)
          OR (v_email IS NOT NULL AND metadata->>'email' = v_email)
        )
    ) THEN
      RETURN;
    END IF;
  END IF;

  IF v_email IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('email', v_email);
  END IF;
  IF v_name IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('userName', v_name);
  END IF;
  IF v_user_id IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('userId', v_user_id::text);
  END IF;
  -- Drop empty helper keys that confuse the log UI
  v_meta := v_meta - 'name';

  CASE p_event_type
    WHEN 'login_failed', 'signup_failed' THEN v_severity := 'warning';
    WHEN 'login_success', 'signup_success' THEN v_severity := 'success';
    ELSE v_severity := 'info';
  END CASE;

  BEGIN
    PERFORM public.append_site_log(
      'auth',
      p_event_type,
      v_severity,
      v_user_id,
      v_user_id,
      v_meta
    );
  EXCEPTION
    WHEN foreign_key_violation THEN
      -- Never lose the event if profile row is briefly missing
      PERFORM public.append_site_log(
        'auth',
        p_event_type,
        v_severity,
        NULL,
        NULL,
        v_meta
      );
    WHEN OTHERS THEN
      RAISE;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_auth_event(text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.log_auth_event(text, text, jsonb) TO anon, authenticated;

-- Backup: log signup when a profile is created (covers OAuth / email confirm)
CREATE OR REPLACE FUNCTION public.log_profile_signup_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_email text;
  v_name text;
BEGIN
  SELECT lower(u.email) INTO v_email
  FROM auth.users u
  WHERE u.id = NEW.id;

  v_name := nullif(trim(COALESCE(NEW.name, NEW.username, '')), '');
  IF v_name IS NULL AND v_email IS NOT NULL THEN
    v_name := split_part(v_email, '@', 1);
  END IF;

  -- Reuse log_auth_event so dedupe + FK safety apply
  PERFORM public.log_auth_event(
    'signup_success',
    v_email,
    jsonb_build_object(
      'userId', NEW.id::text,
      'userName', COALESCE(v_name, ''),
      'source', 'profile_insert'
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_log_signup ON public.profiles;
CREATE TRIGGER profiles_log_signup
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_profile_signup_event();

REVOKE EXECUTE ON FUNCTION public.log_profile_signup_event() FROM public;


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/site-logs-fix-email.sql
-- -----------------------------------------------------------------------------
-- Fix get_admin_site_logs: profiles has no email column (lives on auth.users)
-- Apply: supabase db query --linked -f scripts/site-logs-fix-email.sql

CREATE OR REPLACE FUNCTION public.get_admin_site_logs(
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_category text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
  v_category text := nullif(trim(p_category), '');
  v_total bigint;
  v_logs jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT count(*)::bigint INTO v_total
  FROM public.site_logs sl
  WHERE v_category IS NULL OR sl.category = v_category;

  SELECT COALESCE(jsonb_agg(row_to_json(q)::jsonb ORDER BY q.created_at DESC), '[]'::jsonb)
  INTO v_logs
  FROM (
    SELECT
      sl.id,
      sl.category,
      sl.event_type,
      sl.severity,
      sl.actor_user_id,
      sl.subject_user_id,
      sl.metadata,
      sl.created_at,
      COALESCE(ap.name, ap.username, au.email, '') AS actor_name,
      COALESCE(sp.name, sp.username, su.email, '') AS subject_name
    FROM public.site_logs sl
    LEFT JOIN public.profiles ap ON ap.id = sl.actor_user_id
    LEFT JOIN auth.users au ON au.id = sl.actor_user_id
    LEFT JOIN public.profiles sp ON sp.id = sl.subject_user_id
    LEFT JOIN auth.users su ON su.id = sl.subject_user_id
    WHERE v_category IS NULL OR sl.category = v_category
    ORDER BY sl.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) q;

  RETURN jsonb_build_object(
    'logs', v_logs,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_site_logs(int, int, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_admin_site_logs(int, int, text) TO authenticated;


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/dev-logs-rpc.sql
-- -----------------------------------------------------------------------------
-- Dev logs RPC — admin technical events (API, webhooks, client errors)
-- Apply: supabase db query --linked -f scripts/dev-logs-rpc.sql
-- Requires: scripts/site-logs-migration.sql

CREATE OR REPLACE FUNCTION public.log_dev_event(
  p_event_type text,
  p_severity text DEFAULT 'info',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_severity text := COALESCE(nullif(trim(p_severity), ''), 'info');
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.is_admin() THEN
    RETURN;
  END IF;

  IF p_event_type IS NULL OR length(trim(p_event_type)) = 0 THEN
    RETURN;
  END IF;

  IF v_severity NOT IN ('info', 'success', 'warning', 'danger') THEN
    v_severity := 'info';
  END IF;

  PERFORM public.append_site_log(
    'dev',
    trim(p_event_type),
    v_severity,
    auth.uid(),
    NULL,
    COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_dev_event(text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.log_dev_event(text, text, jsonb) TO authenticated;


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/admin-manual-balance-credit-migration.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- Admin manual balance credit — recover failed/expired ShamCash recharges
-- Apply: supabase db query --linked -f scripts/admin-manual-balance-credit-migration.sql
-- Requires: site-logs-migration.sql (append_site_log)
-- =============================================================================


-- (deduped: earlier admin_manual_balance_credit)
-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/admin-balance-adjust-migration.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- Admin wallet adjust: ADD or DEDUCT customer store balance + edit profile fields
-- Apply: supabase db query --linked -f scripts/admin-balance-adjust-migration.sql
-- =============================================================================

-- Signed adjust: positive = credit, negative = debit (cannot go below 0)
CREATE OR REPLACE FUNCTION public.admin_adjust_user_balance(
  p_user_id uuid,
  p_amount numeric,
  p_direction text, -- 'credit' | 'debit'
  p_reason text,
  p_transaction_ref text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_user_name text;
  v_admin_name text;
  v_new_balance numeric;
  v_old_balance numeric;
  v_reason text := trim(COALESCE(p_reason, ''));
  v_tx_ref text := trim(COALESCE(p_transaction_ref, ''));
  v_dir text := lower(trim(COALESCE(p_direction, 'credit')));
  v_delta numeric;
  v_reference text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;

  IF v_dir NOT IN ('credit', 'debit') THEN
    RAISE EXCEPTION 'Direction must be credit or debit';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 500 THEN
    RAISE EXCEPTION 'Amount must be between $0.01 and $500';
  END IF;

  -- Allow cents
  IF round(p_amount, 2) <> p_amount THEN
    RAISE EXCEPTION 'Amount may have at most 2 decimal places';
  END IF;

  IF length(v_reason) < 5 THEN
    RAISE EXCEPTION 'Reason is required (at least 5 characters)';
  END IF;

  IF v_tx_ref <> '' AND v_tx_ref !~ '^#[0-9]+ THEN
    RAISE EXCEPTION 'Transaction reference must start with # followed by digits only';
  END IF;

  SELECT COALESCE(name, username, 'Customer'), COALESCE(balance, 0)
  INTO v_user_name, v_old_balance
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  SELECT COALESCE(name, username, 'Admin') INTO v_admin_name
  FROM public.profiles
  WHERE id = v_admin_id;

  v_delta := CASE WHEN v_dir = 'debit' THEN -p_amount ELSE p_amount END;

  IF v_dir = 'debit' AND v_old_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance (current $%)', to_char(v_old_balance, 'FM999990.00');
  END IF;

  -- Allow admin balance writes
  PERFORM set_config('echocore.allow_balance_change', '1', true);

  UPDATE public.profiles
  SET balance = GREATEST(0, COALESCE(balance, 0) + v_delta)
  WHERE id = p_user_id
  RETURNING balance INTO v_new_balance;

  v_reference := COALESCE(
    NULLIF(v_tx_ref, ''),
    upper(v_dir) || '-' || to_char(now(), 'YYYYMMDDHH24MISS')
  );

  INSERT INTO public.transactions (
    user_id, type, amount, balance_after, payment_method, reference, status
  )
  VALUES (
    p_user_id,
    'adjustment', -- signed amount: +credit / -debit (allowed by transactions_type_check)
    v_delta,
    v_new_balance,
    'admin_manual',
    v_reference,
    'completed'
  );

  PERFORM public.notify_user(
    p_user_id,
    CASE WHEN v_dir = 'debit' THEN 'admin_balance_debit' ELSE 'recharge_approved' END,
    jsonb_build_object(
      'amount', p_amount,
      'direction', v_dir,
      'newBalance', v_new_balance,
      'manualCredit', v_dir = 'credit',
      'manualDebit', v_dir = 'debit',
      'reason', v_reason
    ),
    '/profile'
  );

  BEGIN
    PERFORM public.append_site_log(
      'recharge',
      CASE WHEN v_dir = 'debit' THEN 'manual_debit' ELSE 'manual_credit' END,
      'success',
      v_admin_id,
      p_user_id,
      jsonb_build_object(
        'amount', p_amount,
        'delta', v_delta,
        'oldBalance', v_old_balance,
        'newBalance', v_new_balance,
        'reason', v_reason,
        'transactionRef', NULLIF(v_tx_ref, ''),
        'reference', v_reference,
        'userName', v_user_name,
        'adminName', v_admin_name,
        'direction', v_dir
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'userId', p_user_id,
    'userName', v_user_name,
    'amount', p_amount,
    'direction', v_dir,
    'delta', v_delta,
    'oldBalance', v_old_balance,
    'newBalance', v_new_balance,
    'reference', v_reference,
    'status', CASE WHEN v_dir = 'debit' THEN 'debited' ELSE 'credited' END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_adjust_user_balance(uuid, numeric, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_adjust_user_balance(uuid, numeric, text, text, text) TO authenticated;

-- Keep legacy credit RPC working by delegating to adjust
CREATE OR REPLACE FUNCTION public.admin_manual_balance_credit(
  p_user_id uuid,
  p_amount numeric,
  p_reason text,
  p_transaction_ref text DEFAULT NULL,
  p_recharge_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_result jsonb;
  v_admin_id uuid := auth.uid();
  v_req public.recharge_requests%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Optional link to recharge request (legacy recovery flow)
  IF p_recharge_request_id IS NOT NULL THEN
    SELECT * INTO v_req
    FROM public.recharge_requests
    WHERE id = p_recharge_request_id
    FOR UPDATE;

    IF v_req.id IS NULL THEN
      RAISE EXCEPTION 'Recharge request not found';
    END IF;
    IF v_req.user_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Recharge request does not belong to this user';
    END IF;
    IF v_req.status = 'approved' THEN
      RAISE EXCEPTION 'This recharge request is already approved';
    END IF;
  END IF;

  v_result := public.admin_adjust_user_balance(
    p_user_id,
    p_amount,
    'credit',
    p_reason,
    COALESCE(
      NULLIF(TRIM(p_transaction_ref), ''),
      CASE WHEN p_recharge_request_id IS NOT NULL THEN v_req.reference END
    )
  );

  IF p_recharge_request_id IS NOT NULL THEN
    UPDATE public.recharge_requests
    SET
      status = 'approved',
      reviewed_by = v_admin_id,
      reviewed_at = now(),
      admin_note = trim(COALESCE(p_reason, '')),
      updated_at = now()
    WHERE id = p_recharge_request_id;

    v_result := v_result || jsonb_build_object('requestId', p_recharge_request_id);
  END IF;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_manual_balance_credit(uuid, numeric, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_manual_balance_credit(uuid, numeric, text, text, uuid) TO authenticated;

-- Admin edit customer profile fields (not role/balance — use adjust for wallet)
DROP FUNCTION IF EXISTS public.admin_update_user_profile(uuid, text, text, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.admin_update_user_profile(
  p_user_id uuid,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_bio text DEFAULT NULL,
  p_discord_username text DEFAULT NULL,
  p_favorite_game text DEFAULT NULL,
  p_default_player_uid text DEFAULT NULL,
  p_sam_shamcash_wallet_id text DEFAULT NULL,
  p_sam_syriatel_recipient text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row public.profiles%ROWTYPE;
  v_shamcash text := nullif(trim(p_sam_shamcash_wallet_id), '');
  v_syriatel text := nullif(trim(p_sam_syriatel_recipient), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;

  IF v_shamcash IS NOT NULL AND v_shamcash !~* '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'Invalid ShamCash recipient';
  END IF;
  IF v_syriatel IS NOT NULL AND v_syriatel !~ '^(09[0-9]{8}|[0-9]{8})$' THEN
    RAISE EXCEPTION 'Invalid Syriatel recipient';
  END IF;

  UPDATE public.profiles
  SET
    name = CASE WHEN p_name IS NULL THEN name ELSE nullif(trim(p_name), '') END,
    phone = CASE WHEN p_phone IS NULL THEN phone ELSE nullif(trim(p_phone), '') END,
    country = CASE WHEN p_country IS NULL THEN country ELSE nullif(trim(p_country), '') END,
    bio = CASE WHEN p_bio IS NULL THEN bio ELSE nullif(trim(p_bio), '') END,
    discord_username = CASE WHEN p_discord_username IS NULL THEN discord_username ELSE nullif(trim(p_discord_username), '') END,
    favorite_game = CASE WHEN p_favorite_game IS NULL THEN favorite_game ELSE nullif(trim(p_favorite_game), '') END,
    default_player_uid = CASE WHEN p_default_player_uid IS NULL THEN default_player_uid ELSE nullif(trim(p_default_player_uid), '') END,
    sam_shamcash_wallet_id = CASE WHEN p_sam_shamcash_wallet_id IS NULL THEN sam_shamcash_wallet_id ELSE v_shamcash END,
    sam_syriatel_recipient = CASE WHEN p_sam_syriatel_recipient IS NULL THEN sam_syriatel_recipient ELSE v_syriatel END
  WHERE id = p_user_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'phone', v_row.phone,
    'country', v_row.country,
    'bio', v_row.bio,
    'discord_username', v_row.discord_username,
    'favorite_game', v_row.favorite_game,
    'default_player_uid', v_row.default_player_uid,
    'sam_shamcash_wallet_id', v_row.sam_shamcash_wallet_id,
    'sam_syriatel_recipient', v_row.sam_syriatel_recipient,
    'username', v_row.username,
    'balance', v_row.balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_user_profile(uuid, text, text, text, text, text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_update_user_profile(uuid, text, text, text, text, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_user_by_username(p_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE lower(username) = lower(trim(regexp_replace(COALESCE(p_username, ''), '^@+', '')))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN public.admin_get_user_profile(v_user_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_user_by_username(text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_user_by_username(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_profile_summaries(p_user_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'name', p.name,
        'role', p.role,
        'balance', p.balance,
        'sam_shamcash_wallet_id', p.sam_shamcash_wallet_id,
        'sam_syriatel_recipient', p.sam_syriatel_recipient
      ) ORDER BY p.created_at DESC)
      FROM public.profiles p
      WHERE p.id = ANY(COALESCE(p_user_ids, '{}'::uuid[]))
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_profile_summaries(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_profile_summaries(uuid[]) TO authenticated;


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/admin-inbox-activity-migration.sql
-- -----------------------------------------------------------------------------
-- Admin inbox: notify on purchases / fulfillment / recharges, raise retention, fix limits.
-- Run: supabase db query --linked -f scripts/admin-inbox-activity-migration.sql

-- =============================================================================
-- 1) Retention + fetch limits
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id uuid,
  p_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_link text DEFAULT null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_type IS NULL OR length(trim(p_type)) = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (user_id, type, metadata, link)
  VALUES (p_user_id, p_type, COALESCE(p_metadata, '{}'::jsonb), p_link)
  RETURNING id INTO v_id;

  -- Drop read notifications older than 90 days
  DELETE FROM public.notifications
  WHERE user_id = p_user_id
    AND read_at IS NOT NULL
    AND read_at < now() - interval '90 days';

  -- Drop any notification older than 120 days
  DELETE FROM public.notifications
  WHERE user_id = p_user_id
    AND created_at < now() - interval '120 days';

  -- Keep latest 250 per user (admins get more activity)
  DELETE FROM public.notifications
  WHERE user_id = p_user_id
    AND id IN (
      SELECT id
      FROM public.notifications
      WHERE user_id = p_user_id
      ORDER BY created_at DESC
      OFFSET 250
    );

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, text, jsonb, text) FROM public;

CREATE OR REPLACE FUNCTION public.get_my_notifications(p_limit int DEFAULT 30)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(q) ORDER BY q.created_at DESC)
    FROM (
      SELECT id, type, metadata, link, read_at, bell_hidden_at, created_at
      FROM public.notifications
      WHERE user_id = v_user_id
      ORDER BY created_at DESC
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 30), 500))
    ) q
  ), '[]'::json);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_notifications(int) FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_notifications(int) TO authenticated;

-- =============================================================================
-- 2) Helper: safe site log (no-op if append_site_log missing)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.try_append_site_log(
  p_category text,
  p_event_type text,
  p_severity text,
  p_subject_user_id uuid,
  p_actor_user_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  PERFORM public.append_site_log(
    p_category,
    p_event_type,
    p_severity,
    p_subject_user_id,
    p_actor_user_id,
    COALESCE(p_metadata, '{}'::jsonb)
  );
EXCEPTION
  WHEN undefined_function THEN
    NULL;
  WHEN OTHERS THEN
    NULL;
END;
$$;

-- =============================================================================
-- 3) Order completed → notify all admins (+ site log)
-- =============================================================================


-- (deduped: earlier on_order_completed_notify_admins)


DROP TRIGGER IF EXISTS order_completed_notify_admins ON public.orders;
CREATE TRIGGER order_completed_notify_admins
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.on_order_completed_notify_admins();

-- =============================================================================
-- 4) Fulfillment status → notify admins (+ keep customer path as-is in apply_*)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.on_order_fulfillment_notify_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_name text;
  v_link text;
  v_type text;
  v_has_uid boolean := false;
  v_has_codes boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.fulfillment_status IS NOT DISTINCT FROM OLD.fulfillment_status THEN
    RETURN NEW;
  END IF;

  IF NEW.fulfillment_status NOT IN ('fulfilled', 'failed') THEN
    RETURN NEW;
  END IF;

  -- Only fire on transition into these states
  IF TG_OP = 'UPDATE'
    AND OLD.fulfillment_status IS NOT DISTINCT FROM NEW.fulfillment_status
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.fulfillment_status = NEW.fulfillment_status
  THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(nullif(trim(name), ''), nullif(trim(username), ''), 'Customer')
  INTO v_user_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  v_link := '/invoice/order/' || NEW.id::text;

  IF NEW.fulfillment_status = 'failed' THEN
    PERFORM public.notify_all_admins(
      'admin_fulfillment_failed',
      jsonb_build_object(
        'orderId', NEW.id,
        'total', NEW.total,
        'amount', NEW.total,
        'userName', COALESCE(v_user_name, 'Customer'),
        'userId', NEW.user_id,
        'error', COALESCE(NEW.g2bulk_metadata->>'last_error', 'fulfillment failed')
      ),
      v_link
    );
    PERFORM public.try_append_site_log(
      'order',
      'fulfillment_failed',
      'error',
      NEW.user_id,
      NULL,
      jsonb_build_object(
        'orderId', NEW.id,
        'total', NEW.total,
        'amount', NEW.total,
        'userName', COALESCE(v_user_name, 'Customer'),
        'error', COALESCE(NEW.g2bulk_metadata->>'last_error', '')
      )
    );
    RETURN NEW;
  END IF;

  -- fulfilled
  SELECT EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id = NEW.id
      AND player_uid IS NOT NULL
      AND length(trim(player_uid)) > 0
  ) INTO v_has_uid;

  SELECT EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id = NEW.id
      AND delivery_items IS NOT NULL
      AND jsonb_typeof(delivery_items) = 'array'
      AND jsonb_array_length(delivery_items) > 0
  ) INTO v_has_codes;

  v_type := CASE
    WHEN v_has_codes THEN 'admin_delivery_ready'
    WHEN v_has_uid THEN 'admin_topup_delivered'
    ELSE 'admin_order_fulfilled'
  END;

  PERFORM public.notify_all_admins(
    v_type,
    jsonb_build_object(
      'orderId', NEW.id,
      'total', NEW.total,
      'amount', NEW.total,
      'userName', COALESCE(v_user_name, 'Customer'),
      'userId', NEW.user_id,
      'hasCodes', v_has_codes,
      'hasUid', v_has_uid
    ),
    v_link
  );

  PERFORM public.try_append_site_log(
    'order',
    'fulfilled',
    'success',
    NEW.user_id,
    NULL,
    jsonb_build_object(
      'orderId', NEW.id,
      'total', NEW.total,
      'amount', NEW.total,
      'userName', COALESCE(v_user_name, 'Customer'),
      'kind', v_type
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_fulfillment_notify_admins ON public.orders;
CREATE TRIGGER order_fulfillment_notify_admins
  AFTER UPDATE OF fulfillment_status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.on_order_fulfillment_notify_admins();

-- =============================================================================
-- 5) Recharge approved → notify admins (manual + Sam API)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.on_recharge_approved_notify_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_name text;
  v_amount numeric;
  v_link text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(nullif(trim(name), ''), nullif(trim(username), ''), 'Customer')
  INTO v_user_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  v_amount := COALESCE(NEW.credited_amount, NEW.amount);
  v_link := '/invoice/recharge/' || NEW.id::text;

  PERFORM public.notify_all_admins(
    'admin_recharge_completed',
    jsonb_build_object(
      'requestId', NEW.id,
      'amount', v_amount,
      'reference', NEW.reference,
      'paymentMethod', NEW.payment_method,
      'userName', COALESCE(v_user_name, 'Customer'),
      'userId', NEW.user_id
    ),
    v_link
  );

  PERFORM public.try_append_site_log(
    'recharge',
    'completed',
    'success',
    NEW.user_id,
    NULL,
    jsonb_build_object(
      'requestId', NEW.id,
      'amount', v_amount,
      'reference', NEW.reference,
      'paymentMethod', NEW.payment_method,
      'userName', COALESCE(v_user_name, 'Customer')
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recharge_approved_notify_admins ON public.recharge_requests;
CREATE TRIGGER recharge_approved_notify_admins
  AFTER INSERT OR UPDATE OF status ON public.recharge_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.on_recharge_approved_notify_admins();

-- =============================================================================
-- 6) Contact notify: correct link + message preview + site log
-- =============================================================================

CREATE OR REPLACE FUNCTION public.on_contact_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  PERFORM public.notify_all_admins(
    'admin_contact_message',
    jsonb_build_object(
      'messageId', NEW.id,
      'name', NEW.name,
      'email', NEW.email,
      'message', left(coalesce(NEW.message, ''), 200)
    ),
    '/dashboard/contact'
  );

  PERFORM public.try_append_site_log(
    'contact',
    'message_received',
    'info',
    NEW.user_id,
    NULL,
    jsonb_build_object(
      'messageId', NEW.id,
      'name', NEW.name,
      'email', NEW.email
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contact_message_notify_admins ON public.contact_messages;
CREATE TRIGGER contact_message_notify_admins
  AFTER INSERT ON public.contact_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.on_contact_message_insert();

-- =============================================================================
-- 7) Manual payment-sent links → invoice / recharges
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mark_order_payment_sent(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_user_name text;
  v_current_balance numeric;
  v_wallet_mode text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(sam_wallet_mode, 'manual')
  INTO v_wallet_mode
  FROM store_settings
  WHERE id = 1;

  IF v_wallet_mode = 'api' THEN
    RAISE EXCEPTION 'Manual payment confirmation is not used in Sam API wallet mode';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status IS DISTINCT FROM 'pending_payment' THEN
    RAISE EXCEPTION 'Order is not awaiting payment';
  END IF;

  UPDATE public.orders
    SET status = 'payment_sent'
    WHERE id = p_order_id;

  SELECT name, balance INTO v_user_name, v_current_balance
  FROM profiles WHERE id = v_order.user_id;

  PERFORM public.notify_user(
    v_order.user_id,
    'order_payment_sent',
    jsonb_build_object(
      'orderId', p_order_id,
      'total', v_order.total,
      'amount', v_order.total,
      'reference', v_order.payment_reference,
      'currentBalance', v_current_balance
    ),
    '/invoice/order/' || p_order_id::text
  );

  PERFORM public.notify_all_admins(
    'admin_order_payment_sent',
    jsonb_build_object(
      'orderId', p_order_id,
      'total', v_order.total,
      'amount', v_order.total,
      'reference', v_order.payment_reference,
      'userName', COALESCE(v_user_name, 'Customer'),
      'userId', v_order.user_id
    ),
    '/invoice/order/' || p_order_id::text
  );

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'reference', v_order.payment_reference,
    'total', v_order.total,
    'status', 'payment_sent',
    'currentBalance', v_current_balance
  );
END;
$$;

-- Customer fulfillment links → invoice (preserves balance refund guard from stock-guard migration)
CREATE OR REPLACE FUNCTION public.apply_g2bulk_fulfillment(
  p_order_id uuid,
  p_fulfillment_status text,
  p_g2bulk_order_id text DEFAULT null,
  p_delivery_items jsonb DEFAULT null,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_error text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_prev_status text;
  v_meta jsonb;
  v_has_uid boolean := false;
  v_has_codes boolean := false;
  v_codes jsonb := '[]'::jsonb;
  v_link text;
  v_new_balance numeric;
  v_refunded boolean := false;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  v_prev_status := v_order.fulfillment_status;
  v_meta := COALESCE(v_order.g2bulk_metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb);

  IF p_error IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('last_error', p_error, 'failed_at', now());
  END IF;

  UPDATE public.orders
  SET
    fulfillment_status = p_fulfillment_status,
    g2bulk_order_id = COALESCE(p_g2bulk_order_id, g2bulk_order_id),
    g2bulk_metadata = v_meta
  WHERE id = p_order_id;

  UPDATE public.order_items
  SET
    fulfillment_status = p_fulfillment_status,
    delivery_items = COALESCE(p_delivery_items, delivery_items)
  WHERE order_id = p_order_id;

  v_link := '/invoice/order/' || p_order_id::text;

  IF p_fulfillment_status = 'fulfilled'
    AND v_prev_status IS DISTINCT FROM 'fulfilled'
    AND v_order.user_id IS NOT NULL
  THEN
    SELECT EXISTS (
      SELECT 1 FROM public.order_items
      WHERE order_id = p_order_id
        AND player_uid IS NOT NULL
        AND length(trim(player_uid)) > 0
    ) INTO v_has_uid;

    IF p_delivery_items IS NOT NULL AND jsonb_typeof(p_delivery_items) = 'array' THEN
      v_codes := p_delivery_items;
      v_has_codes := jsonb_array_length(v_codes) > 0;
    END IF;

    IF NOT v_has_codes THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(di) ORDER BY oi.created_at), '[]'::jsonb)
      INTO v_codes
      FROM public.order_items oi
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN oi.delivery_items IS NULL THEN '[]'::jsonb
          WHEN jsonb_typeof(oi.delivery_items) = 'array' THEN oi.delivery_items
          ELSE jsonb_build_array(oi.delivery_items)
        END
      ) AS di
      WHERE oi.order_id = p_order_id;

      v_has_codes := COALESCE(jsonb_array_length(v_codes), 0) > 0;
    END IF;

    IF v_has_uid AND NOT v_has_codes THEN
      PERFORM public.notify_user(
        v_order.user_id,
        'topup_delivered',
        jsonb_build_object(
          'orderId', p_order_id,
          'amount', v_order.total,
          'giftMessage', v_order.gift_message
        ),
        v_link
      );
    ELSIF v_has_codes THEN
      PERFORM public.notify_user(
        v_order.user_id,
        'delivery_ready',
        jsonb_build_object(
          'orderId', p_order_id,
          'amount', v_order.total,
          'codes', v_codes,
          'giftMessage', v_order.gift_message
        ),
        v_link
      );
    ELSE
      PERFORM public.notify_user(
        v_order.user_id,
        'order_fulfilled',
        jsonb_build_object(
          'orderId', p_order_id,
          'amount', v_order.total,
          'giftMessage', v_order.gift_message
        ),
        v_link
      );
    END IF;
  ELSIF p_fulfillment_status = 'failed'
    AND v_prev_status IS DISTINCT FROM 'failed'
    AND v_order.user_id IS NOT NULL
  THEN
    IF v_order.payment_method = 'balance'
       AND COALESCE((v_order.g2bulk_metadata->>'balance_refunded')::boolean, false) = false
    THEN
      UPDATE public.profiles
      SET balance = COALESCE(balance, 0) + v_order.total
      WHERE id = v_order.user_id
      RETURNING balance INTO v_new_balance;

      INSERT INTO public.transactions (
        user_id, type, amount, balance_after, payment_method, reference, status
      )
      VALUES (
        v_order.user_id,
        'refund',
        v_order.total,
        v_new_balance,
        'balance',
        'FULFILL-REFUND-' || upper(left(replace(p_order_id::text, '-', ''), 8)),
        'completed'
      );

      v_meta := v_meta || jsonb_build_object(
        'balance_refunded', true,
        'refunded_at', now(),
        'refund_balance', v_new_balance
      );

      UPDATE public.orders
      SET g2bulk_metadata = v_meta
      WHERE id = p_order_id;

      v_refunded := true;

      PERFORM public.notify_user(
        v_order.user_id,
        'fulfillment_failed_refunded',
        jsonb_build_object(
          'orderId', p_order_id,
          'amount', v_order.total,
          'newBalance', v_new_balance,
          'error', COALESCE(p_error, v_meta->>'last_error')
        ),
        v_link
      );
    ELSE
      PERFORM public.notify_user(
        v_order.user_id,
        'fulfillment_failed',
        jsonb_build_object(
          'orderId', p_order_id,
          'amount', v_order.total,
          'error', COALESCE(p_error, v_meta->>'last_error')
        ),
        v_link
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'fulfillmentStatus', p_fulfillment_status,
    'g2bulkOrderId', p_g2bulk_order_id,
    'deliveryItems', p_delivery_items,
    'balanceRefunded', v_refunded,
    'newBalance', v_new_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_g2bulk_fulfillment(uuid, text, text, jsonb, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_g2bulk_fulfillment(uuid, text, text, jsonb, jsonb, text) TO service_role;

COMMENT ON FUNCTION public.on_order_completed_notify_admins() IS
  'Notifies all admins when any order becomes completed (balance / Sam / manual).';
COMMENT ON FUNCTION public.on_order_fulfillment_notify_admins() IS
  'Notifies all admins on fulfillment success/failure.';
COMMENT ON FUNCTION public.on_recharge_approved_notify_admins() IS
  'Notifies all admins when a recharge is approved (manual or Sam API).';


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/fix-purchase-notify-link-migration.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- Paid-order admin notification must NOT look like delivery success.
-- Link to orders queue (not invoice). Invoice only after real fulfillment.
-- Apply: supabase db query --linked -f scripts/fix-purchase-notify-link-migration.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.on_order_completed_notify_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_name text;
  v_link text;
  v_event text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(nullif(trim(name), ''), nullif(trim(username), ''), 'Customer')
  INTO v_user_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  -- Orders tab with highlight — not invoice (invoice only after fulfillment success)
  v_link := '/dashboard/orders?order=' || NEW.id::text;
  v_event := CASE
    WHEN NEW.payment_method = 'balance' THEN 'balance_paid'
    WHEN NEW.payment_method IN ('ShamCash', 'SyriatelCash') THEN 'sam_paid'
    ELSE 'completed'
  END;

  PERFORM public.notify_all_admins(
    'admin_purchase_completed',
    jsonb_build_object(
      'orderId', NEW.id,
      'orderRef', NEW.order_ref,
      'total', NEW.total,
      'amount', NEW.total,
      'paymentMethod', NEW.payment_method,
      'userName', COALESCE(v_user_name, 'Customer'),
      'userId', NEW.user_id,
      'phase', 'payment'  -- payment only; delivery is a separate notification
    ),
    v_link
  );

  PERFORM public.try_append_site_log(
    'order',
    v_event,
    'info',
    NEW.user_id,
    NULL,
    jsonb_build_object(
      'orderId', NEW.id,
      'orderRef', NEW.order_ref,
      'total', NEW.total,
      'amount', NEW.total,
      'paymentMethod', NEW.payment_method,
      'userName', COALESCE(v_user_name, 'Customer')
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_completed_notify_admins ON public.orders;
CREATE TRIGGER order_completed_notify_admins
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.on_order_completed_notify_admins();


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/auto-verify-on-recharge.sql
-- -----------------------------------------------------------------------------
-- Auto-verify (موثق) a customer when their wallet recharge succeeds.
-- Safe: only sets verified_at when currently NULL — never un-verifies or overwrites.
-- Apply: supabase db query --linked -f scripts/auto-verify-on-recharge.sql

CREATE OR REPLACE FUNCTION public.mark_user_verified_after_recharge(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Only promote role=user customers; leave admins alone.
  UPDATE public.profiles
  SET verified_at = now()
  WHERE id = p_user_id
    AND role = 'user'
    AND verified_at IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_user_verified_after_recharge(uuid) FROM public;

-- 1) Recharge request reaches approved (manual admin approve, Sam API, manual credit linked to request)
CREATE OR REPLACE FUNCTION public.on_recharge_success_auto_verify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;

  PERFORM public.mark_user_verified_after_recharge(NEW.user_id);
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never block the recharge if verify fails
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recharge_success_auto_verify ON public.recharge_requests;
CREATE TRIGGER recharge_success_auto_verify
  AFTER INSERT OR UPDATE OF status ON public.recharge_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.on_recharge_success_auto_verify();

REVOKE EXECUTE ON FUNCTION public.on_recharge_success_auto_verify() FROM public;

-- 2) Direct balance credit as type=recharge (credit_user_balance / Sam insert path)
CREATE OR REPLACE FUNCTION public.on_recharge_transaction_auto_verify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type IS DISTINCT FROM 'recharge' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.status, 'completed') IS DISTINCT FROM 'completed'
     AND COALESCE(NEW.status, '') <> '' THEN
    -- Allow NULL/completed; skip failed statuses if ever used
    IF lower(NEW.status) IN ('failed', 'cancelled', 'pending') THEN
      RETURN NEW;
    END IF;
  END IF;

  PERFORM public.mark_user_verified_after_recharge(NEW.user_id);
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_recharge_auto_verify ON public.transactions;
CREATE TRIGGER transactions_recharge_auto_verify
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.on_recharge_transaction_auto_verify();

REVOKE EXECUTE ON FUNCTION public.on_recharge_transaction_auto_verify() FROM public;


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/sam-recharge-syp-currency-migration.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- Sam API recharge: user picks USD or SYP; admin sets SYP/USD rate.
-- Credits wallet from actual paidAmount (proportional for SYP / exact for USD).
-- =============================================================================

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS sam_syp_per_usd numeric(12,2) DEFAULT 135,
  ADD COLUMN IF NOT EXISTS sam_syp_rate_updated_at timestamptz;

ALTER TABLE public.recharge_requests
  ADD COLUMN IF NOT EXISTS pay_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS syp_per_usd_snapshot numeric(12,2),
  ADD COLUMN IF NOT EXISTS credited_amount numeric(10,2);

ALTER TABLE public.recharge_requests
  DROP CONSTRAINT IF EXISTS recharge_requests_pay_currency_check;

ALTER TABLE public.recharge_requests
  ADD CONSTRAINT recharge_requests_pay_currency_check
  CHECK (pay_currency IN ('USD', 'SYP'));

ALTER TABLE public.sam_invoices
  ADD COLUMN IF NOT EXISTS requested_usd_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS syp_per_usd_snapshot numeric(12,2);

-- ---------------------------------------------------------------------------
-- Admin Sam settings — include SYP rate
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_sam_api_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row public.store_settings%ROWTYPE;
  v_key text;
  v_wh text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.store_settings WHERE id = 1;
  v_key := nullif(trim(v_row.sam_api_key), '');
  v_wh := nullif(trim(v_row.sam_webhook_secret), '');

  RETURN jsonb_build_object(
    'sam_api_enabled', COALESCE(v_row.sam_api_enabled, false),
    'sam_wallet_mode', COALESCE(v_row.sam_wallet_mode, 'manual'),
    'sam_shamcash_wallet_identifier', v_row.sam_shamcash_wallet_identifier,
    'sam_syriatel_wallet_identifier', v_row.sam_syriatel_wallet_identifier,
    'sam_invoice_currency', COALESCE(v_row.sam_invoice_currency, 'USD'),
    'sam_syp_per_usd', COALESCE(v_row.sam_syp_per_usd, 135),
    'sam_syp_rate_updated_at', v_row.sam_syp_rate_updated_at,
    'sam_api_key_set', v_key IS NOT NULL,
    'sam_api_key_masked', CASE
      WHEN v_key IS NULL THEN null
      WHEN length(v_key) <= 8 THEN '********'
      ELSE substr(v_key, 1, 4) || '…' || substr(v_key, length(v_key) - 3, 4)
    END,
    'sam_webhook_secret_set', v_wh IS NOT NULL,
    'sam_webhook_secret_masked', CASE
      WHEN v_wh IS NULL THEN null
      WHEN length(v_wh) <= 8 THEN '********'
      ELSE substr(v_wh, 1, 6) || '…'
    END
  );
END;
$$;

DROP FUNCTION IF EXISTS public.save_sam_api_settings(boolean, text, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.save_sam_api_settings(boolean, text, text, text, text, text, boolean, boolean);
DROP FUNCTION IF EXISTS public.save_sam_api_settings(boolean, text, text, text, text, text, boolean, boolean, numeric);

CREATE OR REPLACE FUNCTION public.save_sam_api_settings(
  p_enabled boolean,
  p_wallet_mode text DEFAULT 'manual',
  p_shamcash_wallet_identifier text DEFAULT null,
  p_syriatel_wallet_identifier text DEFAULT null,
  p_invoice_currency text DEFAULT 'USD',
  p_api_key text DEFAULT null,
  p_regenerate_webhook_secret boolean DEFAULT false,
  p_clear_api_key boolean DEFAULT false,
  p_syp_per_usd numeric DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_trim_key text;
  v_old_rate numeric;
  v_new_rate numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_wallet_mode IS NOT NULL AND p_wallet_mode NOT IN ('manual', 'api') THEN
    RAISE EXCEPTION 'Invalid wallet mode';
  END IF;

  IF p_invoice_currency IS NOT NULL AND p_invoice_currency NOT IN ('USD', 'SYP', 'EUR') THEN
    RAISE EXCEPTION 'Invalid invoice currency';
  END IF;

  IF p_syp_per_usd IS NOT NULL AND p_syp_per_usd <= 0 THEN
    RAISE EXCEPTION 'SYP per USD rate must be positive';
  END IF;

  SELECT sam_syp_per_usd INTO v_old_rate FROM public.store_settings WHERE id = 1;
  v_trim_key := nullif(trim(p_api_key), '');
  v_new_rate := COALESCE(p_syp_per_usd, v_old_rate, 135);

  UPDATE public.store_settings
  SET
    sam_api_enabled = CASE
      WHEN COALESCE(p_clear_api_key, false) THEN false
      ELSE COALESCE(p_enabled, false)
    END,
    sam_wallet_mode = COALESCE(nullif(trim(p_wallet_mode), ''), sam_wallet_mode, 'manual'),
    sam_shamcash_wallet_identifier = COALESCE(nullif(trim(p_shamcash_wallet_identifier), ''), sam_shamcash_wallet_identifier),
    sam_syriatel_wallet_identifier = COALESCE(nullif(trim(p_syriatel_wallet_identifier), ''), sam_syriatel_wallet_identifier),
    sam_invoice_currency = COALESCE(nullif(trim(p_invoice_currency), ''), sam_invoice_currency, 'USD'),
    sam_syp_per_usd = CASE
      WHEN p_syp_per_usd IS NOT NULL THEN round(p_syp_per_usd, 2)
      ELSE COALESCE(sam_syp_per_usd, 135)
    END,
    sam_syp_rate_updated_at = CASE
      WHEN p_syp_per_usd IS NOT NULL AND round(p_syp_per_usd, 2) IS DISTINCT FROM round(COALESCE(v_old_rate, 135), 2)
        THEN now()
      ELSE sam_syp_rate_updated_at
    END,
    sam_api_key = CASE
      WHEN COALESCE(p_clear_api_key, false) THEN null
      WHEN p_api_key IS NOT NULL THEN v_trim_key
      ELSE sam_api_key
    END,
    sam_webhook_secret = CASE
      WHEN p_regenerate_webhook_secret THEN public.new_sam_webhook_secret()
      WHEN sam_webhook_secret IS NULL OR length(trim(sam_webhook_secret)) = 0 THEN public.new_sam_webhook_secret()
      ELSE sam_webhook_secret
    END,
    shamcash_enabled = CASE
      WHEN COALESCE(nullif(trim(p_wallet_mode), ''), sam_wallet_mode, 'manual') = 'api'
        AND COALESCE(nullif(trim(p_shamcash_wallet_identifier), ''), sam_shamcash_wallet_identifier) IS NOT NULL
        AND length(trim(COALESCE(nullif(trim(p_shamcash_wallet_identifier), ''), sam_shamcash_wallet_identifier))) > 0
      THEN true
      ELSE shamcash_enabled
    END,
    syriatel_enabled = CASE
      WHEN COALESCE(nullif(trim(p_wallet_mode), ''), sam_wallet_mode, 'manual') = 'api'
        AND COALESCE(nullif(trim(p_syriatel_wallet_identifier), ''), sam_syriatel_wallet_identifier) IS NOT NULL
        AND length(trim(COALESCE(nullif(trim(p_syriatel_wallet_identifier), ''), sam_syriatel_wallet_identifier))) > 0
      THEN true
      ELSE syriatel_enabled
    END,
    updated_at = now()
  WHERE id = 1;

  RETURN public.get_sam_api_settings();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_sam_api_settings(boolean, text, text, text, text, text, boolean, boolean, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.save_sam_api_settings(boolean, text, text, text, text, text, boolean, boolean, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- Public payment config
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_payment_methods()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT json_build_object(
    'shamcash', COALESCE((
      SELECT CASE
        WHEN COALESCE(sam_wallet_mode, 'manual') = 'api' THEN
          sam_api_enabled
          AND sam_shamcash_wallet_identifier IS NOT NULL
          AND length(trim(sam_shamcash_wallet_identifier)) > 0
          AND sam_webhook_secret IS NOT NULL
          AND length(trim(sam_webhook_secret)) > 0
        ELSE shamcash_enabled
      END
      FROM store_settings WHERE id = 1
    ), false),
    'syriatel', COALESCE((
      SELECT CASE
        WHEN COALESCE(sam_wallet_mode, 'manual') = 'api' THEN
          sam_api_enabled
          AND sam_syriatel_wallet_identifier IS NOT NULL
          AND length(trim(sam_syriatel_wallet_identifier)) > 0
          AND sam_webhook_secret IS NOT NULL
          AND length(trim(sam_webhook_secret)) > 0
        ELSE syriatel_enabled
      END
      FROM store_settings WHERE id = 1
    ), false),
    'binance', COALESCE((
      SELECT binance_enabled
        AND binance_api_enabled
        AND binance_api_key IS NOT NULL
        AND length(trim(binance_api_key)) > 0
        AND binance_api_secret IS NOT NULL
        AND length(trim(binance_api_secret)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'mastercard', COALESCE((SELECT mastercard_enabled FROM store_settings WHERE id = 1), false),
    'shamcashMerchantName', COALESCE((SELECT shamcash_merchant_name FROM store_settings WHERE id = 1), 'GH-Store'),
    'shamcashQrImageUrl', (SELECT shamcash_qr_image_url FROM store_settings WHERE id = 1),
    'shamcashPayCode', (SELECT shamcash_pay_code FROM store_settings WHERE id = 1),
    'syriatelQrImageUrl', (SELECT syriatel_qr_image_url FROM store_settings WHERE id = 1),
    'syriatelPayCode', (SELECT syriatel_pay_code FROM store_settings WHERE id = 1),
    'shamcashManualReady', COALESCE((
      SELECT shamcash_enabled
        AND shamcash_qr_image_url IS NOT NULL
        AND length(trim(shamcash_qr_image_url)) > 0
        AND shamcash_pay_code IS NOT NULL
        AND length(trim(shamcash_pay_code)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'syriatelManualReady', COALESCE((
      SELECT syriatel_enabled
        AND syriatel_qr_image_url IS NOT NULL
        AND length(trim(syriatel_qr_image_url)) > 0
        AND syriatel_pay_code IS NOT NULL
        AND length(trim(syriatel_pay_code)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'rechargeMin', 1,
    'rechargeMax', 500,
    'shamcashConfigured', COALESCE((
      SELECT shamcash_enabled
        AND shamcash_api_token IS NOT NULL
        AND length(trim(shamcash_api_token)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'walletMode', COALESCE((SELECT sam_wallet_mode FROM store_settings WHERE id = 1), 'manual'),
    'samShamcashApiReady', COALESCE((
      SELECT sam_api_enabled
        AND sam_wallet_mode = 'api'
        AND sam_shamcash_wallet_identifier IS NOT NULL
        AND length(trim(sam_shamcash_wallet_identifier)) > 0
        AND sam_webhook_secret IS NOT NULL
        AND length(trim(sam_webhook_secret)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'samSyriatelApiReady', COALESCE((
      SELECT sam_api_enabled
        AND sam_wallet_mode = 'api'
        AND sam_syriatel_wallet_identifier IS NOT NULL
        AND length(trim(sam_syriatel_wallet_identifier)) > 0
        AND sam_webhook_secret IS NOT NULL
        AND length(trim(sam_webhook_secret)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'samApiReady', COALESCE((
      SELECT sam_api_enabled
        AND sam_wallet_mode = 'api'
        AND sam_webhook_secret IS NOT NULL
        AND length(trim(sam_webhook_secret)) > 0
        AND (
          (sam_shamcash_wallet_identifier IS NOT NULL AND length(trim(sam_shamcash_wallet_identifier)) > 0)
          OR (sam_syriatel_wallet_identifier IS NOT NULL AND length(trim(sam_syriatel_wallet_identifier)) > 0)
        )
      FROM store_settings WHERE id = 1
    ), false),
    'samInvoiceCurrency', COALESCE((SELECT sam_invoice_currency FROM store_settings WHERE id = 1), 'USD'),
    'sypPerUsd', COALESCE((SELECT sam_syp_per_usd FROM store_settings WHERE id = 1), 135),
    'sypRateUpdatedAt', (SELECT sam_syp_rate_updated_at FROM store_settings WHERE id = 1),
    'g2bulkCatalogOnly', COALESCE((SELECT g2bulk_catalog_only FROM store_settings WHERE id = 1), true),
    'g2bulkCatalogMode', COALESCE((SELECT g2bulk_catalog_mode FROM store_settings WHERE id = 1), 'sync'),
    'g2bulkPullSelection', COALESCE((SELECT g2bulk_pull_selection FROM store_settings WHERE id = 1), '{}'::jsonb),
    'binanceApiEnabled', COALESCE((SELECT binance_api_enabled FROM store_settings WHERE id = 1), false),
    'binanceApiReady', COALESCE((
      SELECT binance_api_enabled
        AND binance_api_key IS NOT NULL
        AND length(trim(binance_api_key)) > 0
        AND binance_api_secret IS NOT NULL
        AND length(trim(binance_api_secret)) > 0
      FROM store_settings WHERE id = 1
    ), false)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_methods() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_recharge_request — pay currency (API mode)
-- ---------------------------------------------------------------------------


-- (deduped: earlier create_recharge_request)


DROP FUNCTION IF EXISTS public.create_recharge_request(numeric, text);

REVOKE EXECUTE ON FUNCTION public.create_recharge_request(numeric, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_recharge_request(numeric, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Active recharge — expose pay currency
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_active_recharge_request()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row recharge_requests%ROWTYPE;
  v_invoice jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row
  FROM recharge_requests
  WHERE user_id = v_user_id
    AND status IN ('pending', 'payment_sent')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'samInvoiceId', si.sam_invoice_id,
    'paymentUrl', si.payment_url,
    'expiresAt', si.expires_at,
    'amount', si.amount,
    'currency', si.currency,
    'status', si.status,
    'requestedUsdAmount', si.requested_usd_amount
  )
  INTO v_invoice
  FROM sam_invoices si
  WHERE si.entity_type = 'recharge'
    AND si.entity_id = v_row.id
    AND si.status IN ('pending', 'paid')
  ORDER BY si.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'requestId', v_row.id,
    'reference', v_row.reference,
    'amount', v_row.amount,
    'status', v_row.status,
    'paymentMethod', v_row.payment_method,
    'payCurrency', COALESCE(v_row.pay_currency, 'USD'),
    'sypPerUsd', v_row.syp_per_usd_snapshot,
    'createdAt', v_row.created_at,
    'invoice', v_invoice
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Credit actual paid amount (USD exact / SYP proportional)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_recharge_from_sam_invoice(p_sam_invoice_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_inv public.sam_invoices%ROWTYPE;
  v_row public.recharge_requests%ROWTYPE;
  v_new_balance numeric;
  v_ref text;
  v_paid numeric(12,2);
  v_credit numeric(10,2);
  v_rate numeric(12,2);
BEGIN
  SELECT * INTO v_inv
  FROM public.sam_invoices
  WHERE sam_invoice_id = p_sam_invoice_id
  FOR UPDATE;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_inv.entity_type IS DISTINCT FROM 'recharge' OR v_inv.entity_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_a_recharge');
  END IF;

  SELECT * INTO v_row
  FROM public.recharge_requests
  WHERE id = v_inv.entity_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Recharge request not found';
  END IF;

  IF v_row.status = 'approved' THEN
    SELECT balance INTO v_new_balance
    FROM public.profiles
    WHERE id = v_row.user_id;

    RETURN jsonb_build_object(
      'requestId', v_row.id,
      'userId', v_row.user_id,
      'amount', COALESCE(v_row.credited_amount, v_row.amount),
      'requestedAmount', v_row.amount,
      'creditedAmount', COALESCE(v_row.credited_amount, v_row.amount),
      'newBalance', v_new_balance,
      'status', 'approved',
      'skipped', true
    );
  END IF;

  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'Recharge request is not awaiting payment confirmation';
  END IF;

  v_paid := round(COALESCE(v_inv.paid_amount, v_inv.amount)::numeric, 2);

  IF v_paid IS NULL OR v_paid <= 0 THEN
    RAISE EXCEPTION 'Paid amount is missing or invalid';
  END IF;

  IF v_inv.currency = 'SYP' THEN
    v_rate := COALESCE(
      v_inv.syp_per_usd_snapshot,
      v_row.syp_per_usd_snapshot,
      (SELECT sam_syp_per_usd FROM store_settings WHERE id = 1)
    );
    IF v_rate IS NULL OR v_rate <= 0 THEN
      RAISE EXCEPTION 'SYP exchange rate is not configured';
    END IF;
    v_credit := round(v_paid / v_rate, 2);
  ELSE
    v_credit := round(v_paid, 2);
  END IF;

  IF v_credit < 0.01 THEN
    RAISE EXCEPTION 'Paid amount too small to credit';
  END IF;

  v_ref := COALESCE(
    nullif(trim(v_inv.transaction_ref), ''),
    nullif(trim(v_row.reference), ''),
    v_inv.sam_invoice_id
  );

  UPDATE public.profiles
  SET balance = COALESCE(balance, 0) + v_credit
  WHERE id = v_row.user_id
  RETURNING balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (v_row.user_id, 'recharge', v_credit, v_new_balance, v_row.payment_method, v_ref, 'completed');

  UPDATE public.recharge_requests
  SET
    status = 'approved',
    credited_amount = v_credit,
    reviewed_at = now(),
    updated_at = now()
  WHERE id = v_row.id;

  PERFORM public.notify_user(
    v_row.user_id,
    'recharge_approved',
    jsonb_build_object(
      'requestId', v_row.id,
      'amount', v_credit,
      'requestedAmount', v_row.amount,
      'creditedAmount', v_credit,
      'paidAmount', v_paid,
      'payCurrency', v_inv.currency,
      'newBalance', v_new_balance
    ),
    '/profile'
  );

  RETURN jsonb_build_object(
    'requestId', v_row.id,
    'userId', v_row.user_id,
    'amount', v_credit,
    'requestedAmount', v_row.amount,
    'creditedAmount', v_credit,
    'paidAmount', v_paid,
    'payCurrency', v_inv.currency,
    'newBalance', v_new_balance,
    'status', 'approved'
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/fix-create-recharge-request-syp.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- Hotfix: restore create_recharge_request(numeric, text, text) after a failed
-- sam-recharge-syp-currency-migration run (old REVOKE-after-DROP bug).
-- Safe to run multiple times.
-- =============================================================================

-- Ensure columns exist (no-op if migration already applied)
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS sam_syp_per_usd numeric(12,2) DEFAULT 135,
  ADD COLUMN IF NOT EXISTS sam_syp_rate_updated_at timestamptz;

ALTER TABLE public.recharge_requests
  ADD COLUMN IF NOT EXISTS pay_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS syp_per_usd_snapshot numeric(12,2),
  ADD COLUMN IF NOT EXISTS credited_amount numeric(10,2);

ALTER TABLE public.recharge_requests
  DROP CONSTRAINT IF EXISTS recharge_requests_pay_currency_check;

ALTER TABLE public.recharge_requests
  ADD CONSTRAINT recharge_requests_pay_currency_check
  CHECK (pay_currency IN ('USD', 'SYP'));

ALTER TABLE public.sam_invoices
  ADD COLUMN IF NOT EXISTS requested_usd_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS syp_per_usd_snapshot numeric(12,2);

DROP FUNCTION IF EXISTS public.create_recharge_request(numeric);
DROP FUNCTION IF EXISTS public.create_recharge_request(numeric, text);

CREATE OR REPLACE FUNCTION public.create_recharge_request(
  p_amount numeric,
  p_payment_method text DEFAULT 'ShamCash',
  p_pay_currency text DEFAULT 'USD'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_amount numeric(10,2);
  v_reference text;
  v_request_id uuid;
  v_method_ready boolean;
  v_active_count int;
  v_method text := COALESCE(nullif(trim(p_payment_method), ''), 'ShamCash');
  v_wallet_mode text;
  v_pay_currency text := upper(COALESCE(nullif(trim(p_pay_currency), ''), 'USD'));
  v_syp_rate numeric(12,2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_admin() THEN
    RAISE EXCEPTION 'Admin accounts cannot recharge store balance from the storefront';
  END IF;

  BEGIN
    PERFORM public.assert_user_not_banned(v_user_id);
    PERFORM public.assert_user_verified_if_required(v_user_id);
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;

  IF v_method NOT IN ('ShamCash', 'SyriatelCash') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF v_pay_currency NOT IN ('USD', 'SYP') THEN
    RAISE EXCEPTION 'Invalid pay currency';
  END IF;

  v_amount := round(p_amount::numeric, 2);

  IF v_amount < 1 OR v_amount > 500 THEN
    RAISE EXCEPTION 'Amount must be between $1 and $500';
  END IF;

  SELECT COALESCE(sam_wallet_mode, 'manual'), COALESCE(sam_syp_per_usd, 135)
  INTO v_wallet_mode, v_syp_rate
  FROM store_settings
  WHERE id = 1;

  IF v_wallet_mode <> 'api' AND v_pay_currency = 'SYP' THEN
    RAISE EXCEPTION 'SYP recharge is only available in Sam API mode';
  END IF;

  IF v_pay_currency = 'SYP' AND (v_syp_rate IS NULL OR v_syp_rate <= 0) THEN
    RAISE EXCEPTION 'SYP exchange rate is not configured';
  END IF;

  IF v_wallet_mode = 'api' THEN
    IF v_method = 'ShamCash' THEN
      SELECT COALESCE((
        SELECT sam_api_enabled
          AND sam_wallet_mode = 'api'
          AND sam_shamcash_wallet_identifier IS NOT NULL
          AND length(trim(sam_shamcash_wallet_identifier)) > 0
          AND sam_webhook_secret IS NOT NULL
          AND length(trim(sam_webhook_secret)) > 0
        FROM store_settings WHERE id = 1
      ), false) INTO v_method_ready;
      IF NOT v_method_ready THEN
        RAISE EXCEPTION 'Sam API ShamCash recharge is not configured yet';
      END IF;
    ELSE
      SELECT COALESCE((
        SELECT sam_api_enabled
          AND sam_wallet_mode = 'api'
          AND sam_syriatel_wallet_identifier IS NOT NULL
          AND length(trim(sam_syriatel_wallet_identifier)) > 0
          AND sam_webhook_secret IS NOT NULL
          AND length(trim(sam_webhook_secret)) > 0
        FROM store_settings WHERE id = 1
      ), false) INTO v_method_ready;
      IF NOT v_method_ready THEN
        RAISE EXCEPTION 'Sam API Syriatel Cash recharge is not configured yet';
      END IF;
    END IF;
  ELSE
    v_pay_currency := 'USD';
    IF v_method = 'ShamCash' THEN
      SELECT COALESCE((
        SELECT shamcash_enabled
          AND shamcash_qr_image_url IS NOT NULL
          AND length(trim(shamcash_qr_image_url)) > 0
          AND shamcash_pay_code IS NOT NULL
          AND length(trim(shamcash_pay_code)) > 0
        FROM store_settings WHERE id = 1
      ), false) INTO v_method_ready;
      IF NOT v_method_ready THEN
        RAISE EXCEPTION 'Manual ShamCash recharge is not configured yet';
      END IF;
    ELSE
      SELECT COALESCE((
        SELECT syriatel_enabled
          AND syriatel_qr_image_url IS NOT NULL
          AND length(trim(syriatel_qr_image_url)) > 0
          AND syriatel_pay_code IS NOT NULL
          AND length(trim(syriatel_pay_code)) > 0
        FROM store_settings WHERE id = 1
      ), false) INTO v_method_ready;
      IF NOT v_method_ready THEN
        RAISE EXCEPTION 'Manual Syriatel Cash recharge is not configured yet';
      END IF;
    END IF;
  END IF;

  SELECT count(*)::int INTO v_active_count
  FROM recharge_requests
  WHERE user_id = v_user_id
    AND status IN ('pending', 'payment_sent');

  IF v_active_count >= 1 THEN
    RAISE EXCEPTION 'You already have a pending recharge request';
  END IF;

  v_reference := 'GH-Store-' || upper(substr(replace(v_user_id::text, '-', ''), 1, 6))
    || '-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 4));

  INSERT INTO recharge_requests (
    user_id, amount, reference, status, payment_method, pay_currency, syp_per_usd_snapshot
  )
  VALUES (
    v_user_id,
    v_amount,
    v_reference,
    'pending',
    v_method,
    v_pay_currency,
    CASE WHEN v_pay_currency = 'SYP' THEN round(v_syp_rate, 2) ELSE NULL END
  )
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'requestId', v_request_id,
    'reference', v_reference,
    'amount', v_amount,
    'status', 'pending',
    'paymentMethod', v_method,
    'payCurrency', v_pay_currency,
    'sypPerUsd', CASE WHEN v_pay_currency = 'SYP' THEN round(v_syp_rate, 2) ELSE NULL END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_recharge_request(numeric, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_recharge_request(numeric, text, text) TO authenticated;


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/lockdown-profiles-rls.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- LOCKDOWN: profiles + money tables (IDOR fix)
-- Problem: anyone who knows a user UUID can read balance + full profile.
-- Cause: RLS missing/disabled or old open policy on public.profiles.
--
-- RUN THIS in Supabase Dashboard → SQL Editor → Run
-- Then re-test in Postman with a non-admin user JWT.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Admin helper (needed by policies)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2) Force RLS on sensitive tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.recharge_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recharge_requests FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.sam_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sam_invoices FORCE ROW LEVEL SECURITY;

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3) Drop EVERY policy on profiles, then recreate locked policies
-- ---------------------------------------------------------------------------
DO $
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
  END LOOP;
END $$;

-- Own row only (authenticated). Anon sees nothing.
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins read all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND role = 'user'
    AND COALESCE(balance, 0) = 0
  );

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No DELETE for normal users
CREATE POLICY "Admins delete profiles" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4) Block customers from changing balance / role / username via PATCH
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
BEGIN
  -- Trusted RPCs set this for legitimate balance changes
  IF current_setting('echocore.allow_balance_change', true) IN ('1', 'true') THEN
    RETURN NEW;
  END IF;

  -- service_role / no JWT (backend only) — leave alone
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF caller_role = 'admin' THEN
    RETURN NEW;
  END IF;

  -- Customer editing own profile: freeze money + role + username
  IF auth.uid() = OLD.id THEN
    NEW.role := OLD.role;
    NEW.balance := OLD.balance;
    NEW.username := OLD.username;
    IF TG_OP = 'UPDATE' THEN
      -- never let client set another user's id
      NEW.id := OLD.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_sensitive_fields ON public.profiles;
CREATE TRIGGER protect_profile_sensitive_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_sensitive_fields();

-- ---------------------------------------------------------------------------
-- 5) Orders / transactions / recharges — own rows only
-- ---------------------------------------------------------------------------
DO $
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.orders', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users read own orders" ON public.orders
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all orders" ON public.orders
  FOR SELECT TO authenticated
  USING (public.is_admin());

DO $
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'order_items'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.order_items', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users read own order items" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND o.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins read all order items" ON public.order_items
  FOR SELECT TO authenticated
  USING (public.is_admin());

DO $
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'transactions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.transactions', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users read own transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (public.is_admin());

DO $
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recharge_requests'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.recharge_requests', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users read own recharge requests" ON public.recharge_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage recharge requests" ON public.recharge_requests
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- store_settings: admin only (API keys live here)
DO $
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'store_settings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.store_settings', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Admins manage store settings" ON public.store_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 6) credit_user_balance must stay admin-only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_user_balance(
  p_user_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference text DEFAULT null
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  new_balance numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  PERFORM set_config('echocore.allow_balance_change', '1', true);

  UPDATE public.profiles
    SET balance = COALESCE(balance, 0) + p_amount
    WHERE id = p_user_id
    RETURNING balance INTO new_balance;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (p_user_id, 'recharge', p_amount, new_balance, p_payment_method, p_reference, 'completed');

  RETURN new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.credit_user_balance(uuid, numeric, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.credit_user_balance(uuid, numeric, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Self-check (run after; should show rowsecurity = true)
-- ---------------------------------------------------------------------------
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'orders', 'order_items', 'transactions',
    'recharge_requests', 'store_settings'
  )
ORDER BY tablename;

SELECT policyname, cmd, roles::text, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/hide-offer-cost-from-public-migration.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- Hide supplier wholesale cost from casual clients (SAFE for Supabase/PostgREST)
--
-- HISTORY: An earlier version REVOKE'd table SELECT and re-GRANTed columns only.
-- That breaks PostgREST (401 permission denied → empty store). DO NOT do that.
--
-- Safe approach:
-- 1) Keep GRANT SELECT on public.offers (required for REST catalog)
-- 2) Admin costs via admin_get_offer_wholesale (SECURITY DEFINER)
-- 3) Partner/influencer display prices via get_my_offer_unit_prices
-- 4) Client strips g2bulk_cost_usd / pricing_margin_percent on storefront loads
--
-- True column lockdown without breaking REST needs a public VIEW + client switch
-- (optional follow-up). Until then, never REVOKE SELECT ON public.offers.
--
-- Apply: supabase db query --linked -f scripts/hide-offer-cost-from-public-migration.sql
-- =============================================================================

-- Ensure REST can always read offers (fixes empty store if broken earlier)
GRANT SELECT ON TABLE public.offers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.offers TO authenticated;

-- ---------------------------------------------------------------------------
-- Admin: wholesale map (SECURITY DEFINER — full row access as owner)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_offer_wholesale(p_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_out jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(
    jsonb_object_agg(
      o.id::text,
      jsonb_build_object(
        'g2bulk_cost_usd', o.g2bulk_cost_usd,
        'pricing_mode', o.pricing_mode,
        'pricing_margin_percent', o.pricing_margin_percent
      )
    ),
    '{}'::jsonb
  )
  INTO v_out
  FROM public.offers o
  WHERE p_ids IS NULL
     OR cardinality(p_ids) IS NULL
     OR cardinality(p_ids) = 0
     OR o.id = ANY (p_ids);

  RETURN v_out;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_offer_wholesale(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_offer_wholesale(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- Shopper unit prices (partner plan-B / influencer) without needing cost in UI
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_offer_unit_prices(
  p_ids uuid[] DEFAULT NULL,
  p_influencer_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_partner_markup numeric := NULL;
  v_buyer_markup numeric := NULL;
  v_inf_margin numeric := NULL;
  v_code text := nullif(upper(trim(COALESCE(p_influencer_code, ''))), '');
  v_out jsonb := '{}'::jsonb;
  r record;
  v_public numeric;
  v_cost numeric;
  v_unit numeric;
  v_partner boolean;
  v_influencer boolean;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT t.markup_percent INTO v_partner_markup
    FROM public.profiles p
    JOIN public.partner_tiers t ON t.id = p.partner_tier_id
    WHERE p.id = v_uid
      AND t.is_active = true;

    IF v_partner_markup IS NULL AND v_code IS NOT NULL THEN
      BEGIN
        v_code := regexp_replace(v_code, '\s+', '', 'g');
        SELECT c.buyer_markup_percent, c.influencer_margin_percent
        INTO v_buyer_markup, v_inf_margin
        FROM public.influencer_coupons c
        WHERE upper(trim(c.code)) = v_code
          AND COALESCE(c.is_active, true) = true
          AND (c.expires_at IS NULL OR c.expires_at > now())
        LIMIT 1;
      EXCEPTION
        WHEN undefined_table THEN
          v_buyer_markup := NULL;
          v_inf_margin := NULL;
        WHEN undefined_column THEN
          v_buyer_markup := NULL;
          v_inf_margin := NULL;
      END;
    END IF;
  END IF;

  FOR r IN
    SELECT o.id, o.price, o.g2bulk_cost_usd
    FROM public.offers o
    WHERE (p_ids IS NULL OR cardinality(p_ids) IS NULL OR cardinality(p_ids) = 0 OR o.id = ANY (p_ids))
      AND COALESCE(o.active, true) = true
  LOOP
    v_public := COALESCE(r.price, 0);
    v_cost := r.g2bulk_cost_usd;
    v_unit := v_public;
    v_partner := false;
    v_influencer := false;

    IF v_partner_markup IS NOT NULL AND v_cost IS NOT NULL AND v_cost > 0 THEN
      BEGIN
        v_unit := public.partner_price_from_cost(v_cost, v_partner_markup);
      EXCEPTION
        WHEN undefined_function THEN
          v_unit := v_public;
      END;
      IF v_unit IS NULL OR v_unit > v_public THEN
        v_unit := v_public;
      END IF;
      IF v_unit < v_public - 0.0001 THEN
        v_partner := true;
      END IF;
    ELSIF v_buyer_markup IS NOT NULL AND v_cost IS NOT NULL AND v_cost > 0 THEN
      BEGIN
        v_unit := public.influencer_buyer_price(v_public, v_cost, v_buyer_markup);
      EXCEPTION
        WHEN undefined_function THEN
          v_unit := v_public;
      END;
      IF v_unit IS NULL THEN
        v_unit := v_public;
      END IF;
      IF v_unit < v_public - 0.0001 THEN
        v_influencer := true;
      END IF;
    END IF;

    v_out := v_out || jsonb_build_object(
      r.id::text,
      jsonb_build_object(
        'unitPrice', v_unit,
        'publicPrice', v_public,
        'partnerPriced', v_partner,
        'influencerPriced', v_influencer
      )
    );
  END LOOP;

  RETURN v_out;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_offer_unit_prices(uuid[], text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_offer_unit_prices(uuid[], text) TO authenticated;

COMMENT ON FUNCTION public.admin_get_offer_wholesale(uuid[]) IS
  'Admin-only map of offer id → g2bulk_cost_usd + pricing policy.';
COMMENT ON FUNCTION public.get_my_offer_unit_prices(uuid[], text) IS
  'Unit prices for current user (partner / influencer) without needing cost in the client UI.';


-- -----------------------------------------------------------------------------
-- MERGED FROM: scripts/fix-offers-select-restore-migration.sql
-- -----------------------------------------------------------------------------
-- =============================================================================
-- EMERGENCY FIX: restore public catalog reads on offers
-- The hide-offer-cost migration used column-only GRANTs after REVOKE SELECT.
-- Supabase/PostgREST needs table-level SELECT on offers or the whole table 401s
-- and the storefront appears empty (games ok, offers denied).
--
-- Apply: supabase db query --linked -f scripts/fix-offers-select-restore-migration.sql
-- =============================================================================

GRANT SELECT ON TABLE public.offers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.offers TO authenticated;

-- Keep admin wholesale + unit-price RPCs (safe to re-run if already present)
-- Cost is again readable via PostgREST; client still strips secrets in app code.
-- Safer DB hide = view-based path (see hide-offer-cost-from-public-migration.sql notes).



-- =============================================================================
-- §31 CANONICAL create_order_atomic (partner + influencer + idempotency)
-- Must be last definition so CREATE OR REPLACE wins over older merges.
-- =============================================================================
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, numeric, text, jsonb, text, text);
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, numeric, text, jsonb, text, text, text);
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, numeric, text, jsonb, text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_user_id uuid,
  p_total numeric,
  p_payment_method text,
  p_items jsonb,
  p_player_uid text DEFAULT null,
  p_player_server text DEFAULT null,
  p_idempotency_key text DEFAULT null,
  p_influencer_code text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_new_balance numeric;
  v_current_balance numeric;
  v_order_id uuid;
  v_item jsonb;
  v_offer_price numeric;
  v_offer_active boolean;
  v_offer_cost numeric;
  v_qty integer;
  v_expected numeric;
  v_server_total numeric := 0;
  v_order_status text;
  v_reference text := null;
  v_method_ready boolean := false;
  v_dev_test_balance numeric := 0;
  v_wallet_mode text := 'manual';
  v_idem text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_replay_order uuid;
  v_replay_status text;
  v_replay_ref text;
  v_partner_markup numeric := null;
  v_inf_coupon_id uuid := null;
  v_buyer_markup numeric := null;
  v_code text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.is_admin() AND auth.uid() = p_user_id THEN
    RAISE EXCEPTION 'Admins cannot purchase for themselves';
  END IF;

  BEGIN
    PERFORM public.assert_user_not_banned(p_user_id);
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  IF jsonb_array_length(p_items) > 20 THEN
    RAISE EXCEPTION 'Too many items in cart (max 20)';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  SELECT t.markup_percent INTO v_partner_markup
  FROM public.profiles p
  JOIN public.partner_tiers t ON t.id = p.partner_tier_id AND t.is_active = true
  WHERE p.id = p_user_id;

  -- Influencer code only when not a partner
  IF v_partner_markup IS NULL THEN
    v_code := upper(trim(COALESCE(p_influencer_code, '')));
    v_code := regexp_replace(v_code, '\s+', '', 'g');
    IF v_code <> '' THEN
      SELECT c.id, c.buyer_markup_percent
      INTO v_inf_coupon_id, v_buyer_markup
      FROM public.influencer_coupons c
      WHERE upper(c.code) = v_code
        AND c.is_active = true
        AND (c.expires_at IS NULL OR c.expires_at >= now())
        AND c.influencer_user_id IS DISTINCT FROM p_user_id
        AND c.buyer_markup_percent IS NOT NULL;
    END IF;
  END IF;

  IF v_idem IS NOT NULL THEN
    SELECT pi.order_id, o.status, o.payment_reference, p.balance, COALESCE(p.dev_test_balance, 0)
    INTO v_replay_order, v_replay_status, v_replay_ref, v_new_balance, v_dev_test_balance
    FROM public.purchase_idempotency pi
    JOIN public.orders o ON o.id = pi.order_id
    JOIN public.profiles p ON p.id = p_user_id
    WHERE pi.user_id = p_user_id AND pi.key = v_idem;

    IF v_replay_order IS NOT NULL THEN
      RETURN jsonb_build_object(
        'orderId', v_replay_order,
        'newBalance', v_new_balance,
        'devTestBalance', v_dev_test_balance,
        'status', v_replay_status,
        'reference', v_replay_ref,
        'idempotentReplay', true
      );
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := GREATEST(1, LEAST(99, COALESCE((v_item->>'quantity')::integer, 1)));

    SELECT price, COALESCE(active, true), g2bulk_cost_usd
    INTO v_offer_price, v_offer_active, v_offer_cost
    FROM offers
    WHERE id = (v_item->>'offer_id')::uuid;

    IF v_offer_price IS NULL THEN
      RAISE EXCEPTION 'Offer not found: %', v_item->>'offer_id';
    END IF;
    IF v_offer_active IS NOT TRUE THEN
      RAISE EXCEPTION 'Offer inactive: %', v_item->>'offer_id';
    END IF;

    IF v_partner_markup IS NOT NULL AND v_offer_cost IS NOT NULL AND v_offer_cost > 0 THEN
      v_expected := public.partner_price_from_cost(v_offer_cost, v_partner_markup);
      IF v_expected IS NULL OR v_expected > v_offer_price THEN
        v_expected := v_offer_price;
      END IF;
    ELSIF v_buyer_markup IS NOT NULL AND v_offer_cost IS NOT NULL AND v_offer_cost > 0 THEN
      v_expected := public.influencer_buyer_price(v_offer_price, v_offer_cost, v_buyer_markup);
      IF v_expected IS NULL THEN
        v_expected := v_offer_price;
      END IF;
    ELSE
      v_expected := v_offer_price;
    END IF;

    IF ABS(v_expected - (v_item->>'price')::numeric) > 0.001 THEN
      RAISE EXCEPTION 'Price mismatch for offer %: expected %, got %',
        v_item->>'offer_id', v_expected, v_item->>'price';
    END IF;

    v_server_total := v_server_total + (v_expected * v_qty);
  END LOOP;

  IF ABS(v_server_total - p_total) > 0.001 THEN
    RAISE EXCEPTION 'Total mismatch: expected %, got %', v_server_total, p_total;
  END IF;

  IF p_payment_method = 'balance' THEN
    v_order_status := 'completed';

    SELECT balance, dev_test_balance
    INTO v_current_balance, v_dev_test_balance
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
      RAISE EXCEPTION 'User profile not found';
    END IF;
    IF v_current_balance < p_total THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    v_new_balance := v_current_balance - p_total;
    v_dev_test_balance := GREATEST(0, v_dev_test_balance - p_total);

    PERFORM set_config('echocore.allow_balance_change', '1', true);

    UPDATE profiles
    SET balance = v_new_balance, dev_test_balance = v_dev_test_balance
    WHERE id = p_user_id;

    INSERT INTO transactions (user_id, type, amount, balance_after, payment_method, reference, status)
    VALUES (p_user_id, 'purchase', -p_total, v_new_balance, 'balance', NULL, 'completed');
  ELSE
    v_order_status := 'pending_payment';
    SELECT balance, dev_test_balance
    INTO v_new_balance, v_dev_test_balance
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;

    SELECT COALESCE(sam_wallet_mode, 'manual') INTO v_wallet_mode
    FROM store_settings WHERE id = 1;

    IF p_payment_method = 'ShamCash' THEN
      IF v_wallet_mode = 'api' THEN
        SELECT COALESCE((
          SELECT sam_api_enabled AND sam_wallet_mode = 'api'
            AND sam_shamcash_wallet_identifier IS NOT NULL
            AND length(trim(sam_shamcash_wallet_identifier)) > 0
            AND sam_webhook_secret IS NOT NULL AND length(trim(sam_webhook_secret)) > 0
          FROM store_settings WHERE id = 1
        ), false) INTO v_method_ready;
        IF NOT v_method_ready THEN
          RAISE EXCEPTION 'Sam API ShamCash payment is not configured yet';
        END IF;
      ELSE
        SELECT COALESCE((
          SELECT shamcash_enabled
            AND shamcash_qr_image_url IS NOT NULL AND length(trim(shamcash_qr_image_url)) > 0
            AND shamcash_pay_code IS NOT NULL AND length(trim(shamcash_pay_code)) > 0
          FROM store_settings WHERE id = 1
        ), false) INTO v_method_ready;
        IF NOT v_method_ready THEN
          RAISE EXCEPTION 'Manual ShamCash payment is not configured yet';
        END IF;
        v_reference := 'GH-Store-ORD-' || upper(substr(replace(p_user_id::text, '-', ''), 1, 6))
          || '-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 4));
      END IF;
    ELSIF p_payment_method = 'SyriatelCash' THEN
      IF v_wallet_mode = 'api' THEN
        SELECT COALESCE((
          SELECT sam_api_enabled AND sam_wallet_mode = 'api'
            AND sam_syriatel_wallet_identifier IS NOT NULL
            AND length(trim(sam_syriatel_wallet_identifier)) > 0
            AND sam_webhook_secret IS NOT NULL AND length(trim(sam_webhook_secret)) > 0
          FROM store_settings WHERE id = 1
        ), false) INTO v_method_ready;
        IF NOT v_method_ready THEN
          RAISE EXCEPTION 'Sam API Syriatel Cash payment is not configured yet';
        END IF;
      ELSE
        SELECT COALESCE((
          SELECT syriatel_enabled
            AND syriatel_qr_image_url IS NOT NULL AND length(trim(syriatel_qr_image_url)) > 0
            AND syriatel_pay_code IS NOT NULL AND length(trim(syriatel_pay_code)) > 0
          FROM store_settings WHERE id = 1
        ), false) INTO v_method_ready;
        IF NOT v_method_ready THEN
          RAISE EXCEPTION 'Manual Syriatel Cash payment is not configured yet';
        END IF;
        v_reference := 'GH-Store-ORD-' || upper(substr(replace(p_user_id::text, '-', ''), 1, 6))
          || '-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 4));
      END IF;
    END IF;
  END IF;

  INSERT INTO orders (
    user_id, total, payment_method, status, payment_reference, influencer_coupon_id
  ) VALUES (
    p_user_id, p_total, p_payment_method, v_order_status, v_reference,
    CASE WHEN v_partner_markup IS NULL THEN v_inf_coupon_id ELSE NULL END
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := GREATEST(1, LEAST(99, COALESCE((v_item->>'quantity')::integer, 1)));
    INSERT INTO order_items (
      order_id, offer_id, name_snapshot, price, quantity,
      player_uid, player_server, player_charname
    ) VALUES (
      v_order_id,
      (v_item->>'offer_id')::uuid,
      v_item->>'name_snapshot',
      (v_item->>'price')::numeric,
      v_qty,
      COALESCE(NULLIF(v_item->>'player_uid', ''), NULLIF(p_player_uid, '')),
      COALESCE(NULLIF(v_item->>'player_server', ''), NULLIF(p_player_server, '')),
      NULLIF(v_item->>'player_charname', '')
    );
  END LOOP;

  IF v_idem IS NOT NULL THEN
    INSERT INTO public.purchase_idempotency (user_id, key, order_id)
    VALUES (p_user_id, v_idem, v_order_id)
    ON CONFLICT (user_id, key) DO NOTHING;
  END IF;

  IF p_payment_method = 'balance' AND v_order_status = 'completed' THEN
    PERFORM public.notify_user(
      p_user_id,
      'purchase_completed',
      jsonb_build_object(
        'orderId', v_order_id,
        'total', p_total,
        'newBalance', v_new_balance
      ),
      '/success?orderId=' || v_order_id::text
    );
    BEGIN
      PERFORM public.pay_influencer_commission_for_order(v_order_id);
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'newBalance', v_new_balance,
    'devTestBalance', v_dev_test_balance,
    'status', v_order_status,
    'reference', v_reference
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Admin recharge history (ledger-backed credit status)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_admin_recharge_history_rows(
  p_search text DEFAULT '',
  p_status text DEFAULT '',
  p_method text DEFAULT ''
)
RETURNS TABLE(id uuid, event_at timestamptz, row_data jsonb)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  WITH source_rows AS (
    SELECT
      si.id,
      COALESCE(r.user_id, si.user_id) AS user_id,
      r.id AS recharge_request_id,
      si.sam_invoice_id,
      si.payment_url,
      COALESCE(r.amount, si.requested_usd_amount, si.amount) AS requested_amount,
      si.paid_amount,
      COALESCE(si.currency, r.pay_currency, 'USD') AS currency,
      si.method,
      r.payment_method,
      r.status AS request_status,
      si.status AS payment_status,
       CASE WHEN credit.id IS NOT NULL OR r.credited_amount IS NOT NULL THEN 'credited' ELSE 'not_credited' END AS credit_status,
      si.transaction_ref,
      COALESCE(r.created_at, si.created_at) AS created_at,
      GREATEST(COALESCE(r.updated_at, r.created_at), COALESCE(si.updated_at, si.created_at)) AS event_at,
      COALESCE(credit.amount, r.credited_amount) AS credited_amount,
      r.reference,
      r.reviewed_at,
      si.paid_at,
      si.webhook_received_at,
      si.expires_at,
      p.name AS customer_name,
      p.username AS customer_username
    FROM public.sam_invoices si
    LEFT JOIN public.recharge_requests r ON r.id = si.entity_id
    LEFT JOIN public.profiles p ON p.id = COALESCE(r.user_id, si.user_id)
    LEFT JOIN LATERAL (
      SELECT t.id, t.amount
      FROM public.transactions t
      WHERE t.user_id = COALESCE(r.user_id, si.user_id)
         AND t.type IN ('recharge', 'adjustment')
         AND t.amount > 0
         AND t.status = 'completed'
         AND (
           t.reference = r.reference
           OR t.reference = si.transaction_ref
           OR t.reference = si.sam_invoice_id
           OR t.metadata->>'recharge_request_id' = r.id::text
           OR t.metadata->>'requestId' = r.id::text
           OR t.metadata->>'rechargeRequestId' = r.id::text
           OR t.metadata->>'sam_invoice_id' = si.sam_invoice_id
           OR (
             r.status = 'approved'
             AND r.reviewed_at IS NOT NULL
             AND t.type = 'adjustment'
             AND t.payment_method = 'admin_manual'
             AND t.amount = r.amount
             AND t.created_at >= r.created_at
             AND t.created_at <= r.reviewed_at
                AND NOT (COALESCE(t.metadata, '{}'::jsonb) ?| ARRAY[
                  'recharge_request_id', 'requestId', 'rechargeRequestId'
                ])
                AND NOT EXISTS (
                  SELECT 1
                  FROM public.recharge_requests competing
                  WHERE competing.user_id = r.user_id
                    AND competing.id <> r.id
                    AND competing.status = 'approved'
                    AND competing.reviewed_at IS NOT NULL
                    AND competing.amount = r.amount
                    AND t.created_at >= competing.created_at
                    AND t.created_at <= competing.reviewed_at
                    AND (
                      competing.created_at > r.created_at
                      OR (competing.created_at = r.created_at AND competing.id > r.id)
                    )
                )
              )
         )
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 1
    ) credit ON true
    WHERE si.entity_type = 'recharge'
    UNION ALL
    SELECT
      r.id, r.user_id, r.id, NULL, NULL, r.amount, NULL, r.pay_currency, NULL,
      r.payment_method, r.status, NULL,
      CASE WHEN credit.id IS NOT NULL OR r.credited_amount IS NOT NULL THEN 'credited' ELSE 'not_credited' END,
      NULL, r.created_at, r.updated_at, COALESCE(credit.amount, r.credited_amount), r.reference, r.reviewed_at,
      NULL, NULL, NULL, p.name, p.username
    FROM public.recharge_requests r
    LEFT JOIN public.profiles p ON p.id = r.user_id
    LEFT JOIN LATERAL (
      SELECT t.id, t.amount
      FROM public.transactions t
      WHERE t.user_id = r.user_id
         AND t.type IN ('recharge', 'adjustment')
         AND t.amount > 0
         AND t.status = 'completed'
         AND (
           t.reference = r.reference
           OR t.metadata->>'recharge_request_id' = r.id::text
           OR t.metadata->>'requestId' = r.id::text
           OR t.metadata->>'rechargeRequestId' = r.id::text
           OR (
             r.status = 'approved'
             AND r.reviewed_at IS NOT NULL
             AND t.type = 'adjustment'
             AND t.payment_method = 'admin_manual'
             AND t.amount = r.amount
             AND t.created_at >= r.created_at
             AND t.created_at <= r.reviewed_at
              AND NOT (COALESCE(t.metadata, '{}'::jsonb) ?| ARRAY[
                'recharge_request_id', 'requestId', 'rechargeRequestId'
              ])
              AND NOT EXISTS (
                SELECT 1
                FROM public.recharge_requests competing
                WHERE competing.user_id = r.user_id
                  AND competing.id <> r.id
                  AND competing.status = 'approved'
                  AND competing.reviewed_at IS NOT NULL
                  AND competing.amount = r.amount
                  AND t.created_at >= competing.created_at
                  AND t.created_at <= competing.reviewed_at
                  AND (
                    competing.created_at > r.created_at
                    OR (competing.created_at = r.created_at AND competing.id > r.id)
                  )
              )
            )
         )
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 1
    ) credit ON true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.sam_invoices si
      WHERE si.entity_type = 'recharge' AND si.entity_id = r.id
    )
  ), filtered AS (
    SELECT s.*
    FROM source_rows s
    WHERE (NULLIF(TRIM(p_status), '') IS NULL OR s.request_status = LOWER(TRIM(p_status))
      OR s.payment_status = LOWER(TRIM(p_status)) OR s.credit_status = LOWER(TRIM(p_status)))
      AND (NULLIF(TRIM(p_method), '') IS NULL OR s.method = LOWER(TRIM(p_method))
        OR LOWER(s.payment_method) = LOWER(TRIM(p_method)))
      AND (NULLIF(TRIM(p_search), '') IS NULL OR LOWER(CONCAT_WS(' ', s.customer_name, s.customer_username,
        s.user_id, s.recharge_request_id, s.reference, s.sam_invoice_id, s.transaction_ref)) LIKE '%' || LOWER(TRIM(p_search)) || '%')
  )
  SELECT f.id, f.event_at,
    JSONB_BUILD_OBJECT(
      'id', f.id, 'user_id', f.user_id, 'customer_id', f.user_id,
      'customer_name', f.customer_name, 'customer_username', f.customer_username,
      'recharge_request_id', f.recharge_request_id, 'reference', f.reference,
      'sam_invoice_id', f.sam_invoice_id, 'payment_url', f.payment_url,
      'requested_amount', f.requested_amount, 'paid_amount', f.paid_amount,
      'credited_amount', f.credited_amount, 'currency', f.currency,
      'method', COALESCE(f.method, 'manual'), 'payment_method', f.payment_method,
      'request_status', f.request_status, 'payment_status', f.payment_status,
      'credit_status', f.credit_status, 'transaction_ref', f.transaction_ref,
      'created_at', f.created_at, 'updated_at', f.event_at, 'reviewed_at', f.reviewed_at,
      'paid_at', f.paid_at, 'webhook_received_at', f.webhook_received_at, 'expires_at', f.expires_at
    )
  FROM filtered f;
$$;

CREATE OR REPLACE FUNCTION public.list_admin_recharge_history(
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 25,
  p_search text DEFAULT '',
  p_status text DEFAULT '',
  p_method text DEFAULT '',
  p_admin_id uuid DEFAULT null
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_page int := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size int := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100);
  v_search text := LOWER(TRIM(COALESCE(p_search, '')));
  v_status text := LOWER(TRIM(COALESCE(p_status, '')));
  v_method text := LOWER(TRIM(COALESCE(p_method, '')));
  v_total int;
  v_rows json;
  v_by_request_status json;
  v_by_credit_status json;
BEGIN
  -- Called by the edge function with the service role, where auth.uid() is
  -- null. The edge has already verified the caller is an admin; validate the
  -- passed admin id against profiles instead of auth.uid().
  IF p_admin_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;


  WITH audit_rows AS (
    SELECT row_data->>'request_status' AS request_status
    FROM public.list_admin_recharge_history_rows(v_search, v_status, v_method)
  )
  SELECT COUNT(*) INTO v_total FROM audit_rows;

  WITH audit_rows AS (
    SELECT row_data->>'request_status' AS request_status
    FROM public.list_admin_recharge_history_rows(v_search, v_status, v_method)
  )
  SELECT COALESCE(JSON_OBJECT_AGG(request_status, status_count), '{}'::json)
    INTO v_by_request_status
  FROM (SELECT COALESCE(request_status, 'unlinked') request_status, COUNT(*) status_count
         FROM audit_rows GROUP BY request_status) counts;

  WITH audit_rows AS (
    SELECT row_data->>'credit_status' AS credit_status
    FROM public.list_admin_recharge_history_rows(v_search, v_status, v_method)
  )
  SELECT COALESCE(JSON_OBJECT_AGG(credit_status, status_count), '{}'::json)
    INTO v_by_credit_status
  FROM (SELECT COALESCE(credit_status, 'unknown') credit_status, COUNT(*) status_count
        FROM audit_rows GROUP BY credit_status) counts;

  WITH audit_rows AS (
    SELECT * FROM public.list_admin_recharge_history_rows(v_search, v_status, v_method)
  )
  SELECT COALESCE(JSON_AGG(page_rows.row_data ORDER BY page_rows.event_at DESC, page_rows.id DESC), '[]'::json)
    INTO v_rows
  FROM (
    SELECT * FROM audit_rows
    ORDER BY event_at DESC, id DESC
    OFFSET (v_page - 1) * v_page_size LIMIT v_page_size
  ) page_rows;

  RETURN JSON_BUILD_OBJECT(
    'rows', v_rows,
    'total', v_total,
    'page', v_page,
    'pageSize', v_page_size,
    'stats', JSON_BUILD_OBJECT(
      'total', v_total,
      'byRequestStatus', v_by_request_status,
      'byCreditStatus', v_by_credit_status
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_admin_recharge_history(int, int, text, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.list_admin_recharge_history(int, int, text, text, text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.list_admin_recharge_history_rows(text, text, text) FROM public;

REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_user_id uuid,
  p_total numeric,
  p_payment_method text,
  p_items jsonb,
  p_player_uid text DEFAULT null,
  p_player_server text DEFAULT null,
  p_idempotency_key text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  RETURN public.create_order_atomic(
    p_user_id, p_total, p_payment_method, p_items,
    p_player_uid, p_player_server, p_idempotency_key, null
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text, text) TO authenticated;



-- =============================================================================
-- §32  create_order_atomic 6-arg wrapper → full 8-arg (partner + influencer)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_user_id uuid,
  p_total numeric,
  p_payment_method text,
  p_items jsonb,
  p_player_uid text DEFAULT null,
  p_player_server text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  RETURN public.create_order_atomic(
    p_user_id, p_total, p_payment_method, p_items,
    p_player_uid, p_player_server, null, null
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) TO authenticated;



-- =============================================================================
-- §33 Site logs retention 30d + dedupe + paged admin list
-- =============================================================================
-- Site logs: 30-day retention, anti-spam dedupe, better admin list (severity + window)
-- Apply: supabase db query --linked -f scripts/site-logs-retention-dedupe.sql

-- ---------------------------------------------------------------------------
-- append_site_log: skip near-duplicate rows (same event within 90s)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.append_site_log(
  p_category text,
  p_event_type text,
  p_severity text DEFAULT 'info',
  p_actor_user_id uuid DEFAULT NULL,
  p_subject_user_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_severity text := lower(trim(COALESCE(p_severity, 'info')));
  v_cat text := trim(COALESCE(p_category, ''));
  v_evt text := trim(COALESCE(p_event_type, ''));
  v_meta jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_order text;
  v_email text;
  v_window interval := interval '90 seconds';
BEGIN
  IF v_cat = '' OR v_evt = '' THEN
    RETURN NULL;
  END IF;

  IF v_severity IN ('error', 'err', 'critical', 'fatal') THEN
    v_severity := 'danger';
  ELSIF v_severity IN ('warn') THEN
    v_severity := 'warning';
  ELSIF v_severity IN ('ok', 'ok ') THEN
    v_severity := 'success';
  ELSIF v_severity NOT IN ('info', 'success', 'warning', 'danger') THEN
    v_severity := 'info';
  END IF;

  -- Login success: longer dedupe window (SIGNED_IN + app login both fire)
  IF v_cat = 'auth' AND v_evt = 'login_success' THEN
    v_window := interval '3 minutes';
  END IF;

  v_order := nullif(trim(COALESCE(v_meta->>'orderId', v_meta->>'order_id', '')), '');
  v_email := lower(nullif(trim(COALESCE(v_meta->>'email', '')), ''));

  IF EXISTS (
    SELECT 1
    FROM public.site_logs sl
    WHERE sl.category = v_cat
      AND sl.event_type = v_evt
      AND sl.created_at > now() - v_window
      AND (
        (p_subject_user_id IS NOT NULL AND sl.subject_user_id IS NOT DISTINCT FROM p_subject_user_id)
        OR (p_actor_user_id IS NOT NULL AND sl.actor_user_id IS NOT DISTINCT FROM p_actor_user_id)
        OR (v_email IS NOT NULL AND lower(nullif(trim(sl.metadata->>'email'), '')) IS NOT DISTINCT FROM v_email)
        OR (
          p_subject_user_id IS NULL AND p_actor_user_id IS NULL AND v_email IS NULL
          AND sl.subject_user_id IS NULL AND sl.actor_user_id IS NULL
        )
      )
      AND (
        v_order IS NULL
        OR nullif(trim(COALESCE(sl.metadata->>'orderId', sl.metadata->>'order_id', '')), '')
           IS NOT DISTINCT FROM v_order
      )
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.site_logs (
    category, event_type, severity, actor_user_id, subject_user_id, metadata
  )
  VALUES (
    v_cat, v_evt, v_severity, p_actor_user_id, p_subject_user_id, v_meta
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.append_site_log(text, text, text, uuid, uuid, jsonb) FROM public;

-- ---------------------------------------------------------------------------
-- Purge rows older than 30 days (batched)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_old_site_logs(p_days int DEFAULT 30)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_days int := LEAST(GREATEST(COALESCE(p_days, 30), 7), 365);
  v_deleted int := 0;
BEGIN
  WITH doomed AS (
    SELECT id
    FROM public.site_logs
    WHERE created_at < now() - make_interval(days => v_days)
    ORDER BY created_at ASC
    LIMIT 2000
  )
  DELETE FROM public.site_logs sl
  USING doomed d
  WHERE sl.id = d.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_old_site_logs(int) FROM public;
GRANT EXECUTE ON FUNCTION public.purge_old_site_logs(int) TO authenticated;

-- ---------------------------------------------------------------------------
-- Admin list: last 30 days only, severity filter, page size up to 100
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_admin_site_logs(int, int, text, text);
DROP FUNCTION IF EXISTS public.get_admin_site_logs(int, int, text);

CREATE OR REPLACE FUNCTION public.get_admin_site_logs(
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_category text DEFAULT NULL,
  p_severity text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
  v_category text := nullif(trim(p_category), '');
  v_severity text := lower(nullif(trim(p_severity), ''));
  v_total bigint;
  v_logs jsonb;
  v_since timestamptz := now() - interval '30 days';
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Cheap retention (ignore failures / non-admin should not call purge from client often)
  BEGIN
    PERFORM public.purge_old_site_logs(30);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF v_severity IN ('error', 'err', 'critical', 'fatal') THEN
    v_severity := 'danger';
  ELSIF v_severity = 'warn' THEN
    v_severity := 'warning';
  ELSIF v_severity = 'critical_group' OR v_severity = 'critical' THEN
    v_severity := 'critical';
  END IF;

  SELECT count(*)::bigint INTO v_total
  FROM public.site_logs sl
  WHERE sl.created_at >= v_since
    AND (v_category IS NULL OR sl.category = v_category)
    AND (
      v_severity IS NULL
      OR (v_severity = 'critical' AND sl.severity IN ('warning', 'danger'))
      OR (v_severity IS DISTINCT FROM 'critical' AND sl.severity = v_severity)
    );

  SELECT COALESCE(jsonb_agg(row_to_json(q)::jsonb ORDER BY q.created_at DESC), '[]'::jsonb)
  INTO v_logs
  FROM (
    SELECT
      sl.id,
      sl.category,
      sl.event_type,
      sl.severity,
      sl.actor_user_id,
      sl.subject_user_id,
      sl.metadata,
      sl.created_at,
      COALESCE(ap.name, ap.username, au.email::text, '') AS actor_name,
      COALESCE(sp.name, sp.username, su.email::text, '') AS subject_name
    FROM public.site_logs sl
    LEFT JOIN public.profiles ap ON ap.id = sl.actor_user_id
    LEFT JOIN auth.users au ON au.id = sl.actor_user_id
    LEFT JOIN public.profiles sp ON sp.id = sl.subject_user_id
    LEFT JOIN auth.users su ON su.id = sl.subject_user_id
    WHERE sl.created_at >= v_since
      AND (v_category IS NULL OR sl.category = v_category)
      AND (
        v_severity IS NULL
        OR (v_severity = 'critical' AND sl.severity IN ('warning', 'danger'))
        OR (v_severity IS DISTINCT FROM 'critical' AND sl.severity = v_severity)
      )
    ORDER BY sl.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) q;

  RETURN jsonb_build_object(
    'logs', v_logs,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'retentionDays', 30
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_site_logs(int, int, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_admin_site_logs(int, int, text, text) TO authenticated;

-- 3-arg wrapper for older clients
CREATE OR REPLACE FUNCTION public.get_admin_site_logs(
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_category text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  RETURN public.get_admin_site_logs(p_limit, p_offset, p_category, NULL);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_site_logs(int, int, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_admin_site_logs(int, int, text) TO authenticated;


-- END OF GH-Store SUPABASE SETUP
-- =============================================================================
