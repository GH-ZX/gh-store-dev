import fs from 'node:fs';

const dump = JSON.parse(fs.readFileSync('all_products_dump.json', 'utf8'));

// Read normalization rules from prepare_catalog_normalization.mjs
const prepContent = fs.readFileSync('scripts/prepare_catalog_normalization.mjs', 'utf8');

// Build the SQL migration for offer terms
let sql = `-- Migration: Normalize Offer Terms, Durations, Warranties and Product Names
-- Updates offer details so subscription duration and warranty are cleanly recorded in structured columns.

BEGIN;

-- Discord Nitro updates
UPDATE public.products
SET
  name_en = 'Discord Nitro',
  name_ar = 'دسكورد نيترو | Discord Nitro',
  description_en = 'Elevate your Discord experience with custom emojis, stickers, HD video streaming, 500MB file uploads, and 2 server boosts.',
  description_ar = 'اشتراك دسكورد نيترو الرسمي للتمتع بإيموجيات مخصصة ومشاركة شاشة بدقة عالية ورفع ملفات أكبر وشارات بروفايل مميزة وتعزيزين للسيرفر.',
  updated_at = timezone('utc', now())
WHERE slug = 'discord';

UPDATE public.offers
SET
  name_en = 'Discord Nitro (1 Year)',
  name_ar = 'دسكورد نيترو (سنة كاملة)',
  description_en = '1-year Discord Nitro membership with 2 server boosts, HD streaming, and 500MB uploads.',
  description_ar = 'اشتراك دسكورد نيترو لمدة سنة كاملة مع تعزيزين للسيرفر ومشاركة شاشة بدقة فائقة.',
  duration_value = 1,
  duration_unit = 'year',
  warranty_kind = 'full',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'discord')
  AND name_en ILIKE '%1-Year%';

UPDATE public.offers
SET
  name_en = 'Discord Nitro (1 Month)',
  name_ar = 'دسكورد نيترو (شهر واحد)',
  description_en = '1-month Discord Nitro membership with custom emojis, stickers, and 2 server boosts.',
  description_ar = 'اشتراك دسكورد نيترو لمدة شهر واحد مع تعزيزين للسيرفر واستخدام الإيموجيات في أي مكان.',
  duration_value = 1,
  duration_unit = 'month',
  warranty_kind = 'full',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'discord')
  AND name_en ILIKE '%1-Month%Nitro Subscription%';

UPDATE public.offers
SET
  name_en = 'Discord Nitro Basic (1 Month)',
  name_ar = 'دسكورد نيترو بيسك (شهر واحد)',
  description_en = '1-month Discord Nitro Basic membership with 50MB uploads and custom emojis.',
  description_ar = 'اشتراك دسكورد نيترو بيسك لمدة شهر واحد مع رفع ملفات حتى 50MB واستخدام الإيموجيات المخصصة.',
  duration_value = 1,
  duration_unit = 'month',
  warranty_kind = 'full',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'discord')
  AND name_en ILIKE '%Basic%';

`;

import { pathToFileURL } from 'node:url';

// Evaluate prepare_catalog_normalization.mjs to get NORMALIZATION
// We can parse the NORMALIZATION object from the file
const startIdx = prepContent.indexOf('const NORMALIZATION = {');
const endIdx = prepContent.indexOf('// Build the SQL migration');
const normCode = prepContent.slice(startIdx, endIdx);

// Execute the code safely
const fn = new Function(`${normCode}; return NORMALIZATION;`);
const NORMALIZATION = fn();

let count = 0;
for (const [slug, item] of Object.entries(NORMALIZATION)) {
  if (!item.offers) continue;
  for (const [key, oItem] of Object.entries(item.offers)) {
    count++;
    sql += `-- Offer for: ${slug}\n`;
    sql += `UPDATE public.offers\nSET\n`;
    sql += `  name_en = ${escapeSql(oItem.name_en)},\n`;
    sql += `  name_ar = ${escapeSql(oItem.name_ar)},\n`;
    sql += `  description_en = ${escapeSql(oItem.desc_en)},\n`;
    sql += `  description_ar = ${escapeSql(oItem.desc_ar)},\n`;
    sql += `  duration_value = ${oItem.duration_value !== null ? oItem.duration_value : 'NULL'},\n`;
    sql += `  duration_unit = ${oItem.duration_unit ? `'${oItem.duration_unit}'` : 'NULL'},\n`;
    sql += `  warranty_kind = '${oItem.warranty_kind}',\n`;
    sql += `  warranty_value = ${oItem.warranty_value !== null ? oItem.warranty_value : 'NULL'},\n`;
    sql += `  warranty_unit = ${oItem.warranty_unit ? `'${oItem.warranty_unit}'` : 'NULL'},\n`;
    sql += `  terms_source = 'manual',\n`;
    sql += `  terms_review_required = false,\n`;
    sql += `  updated_at = timezone('utc', now())\n`;
    sql += `WHERE product_id = (SELECT id FROM public.products WHERE slug = '${slug}');\n\n`;
  }
}

sql += `COMMIT;\n`;

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'` + str.replace(/'/g, `''`) + `'`;
}

fs.writeFileSync('supabase/migrations/20261004130000_normalize_offer_terms.sql', sql);
console.log(`Generated migration 20261004130000_normalize_offer_terms.sql for ${count} offers (+ Discord offers).`);
