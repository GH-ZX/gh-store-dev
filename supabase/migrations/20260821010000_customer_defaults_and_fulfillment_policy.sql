-- Customer-facing defaults supplied by the store owner.
-- Keep these in a migration so a fresh environment and production receive the
-- same safe baseline, while later dashboard edits remain authoritative.
update public.store_settings
set contact = jsonb_set(
  jsonb_set(
    coalesce(contact, '{}'::jsonb),
    '{channels}',
    '[
      {"kind":"whatsapp","label_ar":"واتساب","label_en":"WhatsApp","value":"00963968098330"},
      {"kind":"telegram","label_ar":"تيليجرام","label_en":"Telegram","value":"ahmedghx"},
      {"kind":"email","label_ar":"البريد الإلكتروني","label_en":"Email","value":"ahmedghuwu3@gmail.com"}
    ]'::jsonb,
    true
  ),
  '{note_ar}',
  '"للمساعدة في الطلبات، أرسل رقم الطلب وتفاصيل المشكلة عبر إحدى القنوات أعلاه."'::jsonb,
  true
) || jsonb_build_object(
  'note_en', 'For order help, send your order number and a short description through any channel above.'
),
social_links = '[
  {"platform":"whatsapp","label_ar":"واتساب","label_en":"WhatsApp","url":"https://wa.me/963968098330"},
  {"platform":"telegram","label_ar":"تيليجرام","label_en":"Telegram","url":"https://t.me/ahmedghx"}
]'::jsonb,
payments = jsonb_set(
  coalesce(payments, '{}'::jsonb),
  '{refund_on_fulfillment_failure}',
  'true'::jsonb,
  true
)
where id = 'global';
