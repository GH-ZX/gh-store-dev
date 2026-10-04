-- Migration: Enforce Single-Language English Names for Apps and Products
-- User directive: The names of apps must stay in English even in Arabic (e.g. "Replit" not "ريبليت", one language, not two languages).

BEGIN;

-- Set name_ar = name_en for all products so apps and items stay in clean English without dual language or transliterations
UPDATE public.products
SET
  name_ar = name_en,
  updated_at = timezone('utc', now());

-- Set name_ar = name_en for all offers so offer titles stay in clean English without app transliterations
UPDATE public.offers
SET
  name_ar = name_en,
  updated_at = timezone('utc', now())
WHERE name_ar ~ '[\u0600-\u06FF]' OR name_ar LIKE '%|%';

COMMIT;
