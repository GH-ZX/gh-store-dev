-- Migration: Normalize Offer Terms, Durations, Warranties and Product Names
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

-- Offer for: adobe-express-premium-12-months-93
UPDATE public.offers
SET
  name_en = '12 Months Subscription',
  name_ar = 'اشتراك 12 شهراً',
  description_en = 'Full 12-month access to Adobe Express Premium features and cloud storage.',
  description_ar = 'اشتراك كامل لمدة 12 شهراً في ميزات أدوبي إكسبريس بريميوم مع مساحة سحابية.',
  duration_value = 12,
  duration_unit = 'month',
  warranty_kind = 'full',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'adobe-express-premium-12-months-93');

-- Offer for: amboss-full-subscription-9-months-109
UPDATE public.offers
SET
  name_en = 'Full Subscription (9 Months)',
  name_ar = 'اشتراك كامل (9 أشهر)',
  description_en = 'AMBOSS Full Subscription with question bank and clinical knowledge for 9 months.',
  description_ar = 'اشتراك كامل في منصة أمبوس الطبية مع بنك الأسئلة والمكتبة السريرية لمدة 9 أشهر.',
  duration_value = 9,
  duration_unit = 'month',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'amboss-full-subscription-9-months-109');

-- Offer for: apple-tv-official-subscriptions-6m-fw-146
UPDATE public.offers
SET
  name_en = '6 Months (Full Warranty)',
  name_ar = '6 أشهر (ضمان كامل المدة)',
  description_en = 'Official 6-month Apple TV+ subscription with full-term replacement warranty.',
  description_ar = 'اشتراك رسمي لمدة 6 أشهر في آبل تي في بلس مع ضمان كامل المدة.',
  duration_value = 6,
  duration_unit = 'month',
  warranty_kind = 'full',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'apple-tv-official-subscriptions-6m-fw-146');

-- Offer for: autodesk-admin-dashboard-access-3000-invitation-150
UPDATE public.offers
SET
  name_en = '3,000 Invitations Access',
  name_ar = 'صلاحية 3000 دعوة',
  description_en = 'Administrator access with quota up to 3,000 user invitations for Autodesk tools.',
  description_ar = 'وصول إداري يتضمن رصيد يصل إلى 3000 دعوة لمستخدمي برامج وتطبيقات أوتوديسك.',
  duration_value = NULL,
  duration_unit = NULL,
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'autodesk-admin-dashboard-access-3000-invitation-150');

-- Offer for: brain-fm-1-year-174
UPDATE public.offers
SET
  name_en = '1 Year Subscription',
  name_ar = 'اشتراك سنة كاملة',
  description_en = '1-year unlimited access to all Brain.fm music modes for focus, study, and sleep.',
  description_ar = 'وصول غير محدود لجميع أنماط الموسيقى الوظيفية في برين إف إم لمدة سنة كاملة.',
  duration_value = 1,
  duration_unit = 'year',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'brain-fm-1-year-174');

-- Offer for: capcut-6month-fw-individual-26
UPDATE public.offers
SET
  name_en = '6 Months (Full Warranty)',
  name_ar = '6 أشهر (ضمان كامل المدة)',
  description_en = 'Individual CapCut Pro subscription for 6 months with full-term replacement warranty.',
  description_ar = 'اشتراك كاب كات برو فردي لمدة 6 أشهر مع ضمان كامل المدة.',
  duration_value = 6,
  duration_unit = 'month',
  warranty_kind = 'full',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'capcut-6month-fw-individual-26');

-- Offer for: capcut-pro-1-month-fw-18
UPDATE public.offers
SET
  name_en = '1 Month (Full Warranty)',
  name_ar = 'شهر واحد (ضمان كامل المدة)',
  description_en = '1-month CapCut Pro subscription with full warranty coverage throughout the period.',
  description_ar = 'اشتراك شهر واحد في كاب كات برو مع ضمان كامل طوال فترة الاشتراك.',
  duration_value = 1,
  duration_unit = 'month',
  warranty_kind = 'full',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'capcut-pro-1-month-fw-18');

-- Offer for: chatgpt-plus-1m-momo-pay-gmail-nw-89
UPDATE public.offers
SET
  name_en = '1 Month (Gmail Account)',
  name_ar = 'اشتراك شهر (حساب جاهز)',
  description_en = '1-month ChatGPT Plus on dedicated Gmail account credentials provided upon purchase.',
  description_ar = 'اشتراك شهر في شات جي بي تي بلس على حساب جيميل خاص يُسلم فور الشراء.',
  duration_value = 1,
  duration_unit = 'month',
  warranty_kind = 'none',
  warranty_value = 0,
  warranty_unit = 'day',
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'chatgpt-plus-1m-momo-pay-gmail-nw-89');

-- Offer for: cousera-bussiness-6m-ready-account-161
UPDATE public.offers
SET
  name_en = '6 Months (Ready Account)',
  name_ar = '6 أشهر (حساب جاهز)',
  description_en = '6-month Coursera Business access on ready-to-use account credentials.',
  description_ar = 'اشتراك 6 أشهر في كورسيرا للأعمال على حساب جاهز للاستخدام الفوري.',
  duration_value = 6,
  duration_unit = 'month',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'cousera-bussiness-6m-ready-account-161');

-- Offer for: cursor-pro-12m-166
UPDATE public.offers
SET
  name_en = '12 Months Subscription',
  name_ar = 'اشتراك 12 شهراً',
  description_en = 'Annual Cursor Pro subscription with priority fast requests and advanced AI models.',
  description_ar = 'اشتراك سنوي في كيرسور برو مع طلبات سريعة غير محدودة وأحدث النماذج الذكية.',
  duration_value = 12,
  duration_unit = 'month',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'cursor-pro-12m-166');

-- Offer for: descript-creator-1-year-175
UPDATE public.offers
SET
  name_en = '1 Year Subscription',
  name_ar = 'اشتراك سنة كاملة',
  description_en = 'Full 1-year Descript Creator plan with high-definition watermark-free exports and AI features.',
  description_ar = 'اشتراك سنوي في خطة ديسكريبت كريتور بدون علامات مائية وتصدير بجودة فائقة.',
  duration_value = 1,
  duration_unit = 'year',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'descript-creator-1-year-175');

-- Offer for: duolingo-super-slot-12-months-156
UPDATE public.offers
SET
  name_en = '12 Months (Full Warranty)',
  name_ar = '12 شهراً (ضمان كامل المدة)',
  description_en = '12-month Duolingo Super membership slot with full-period replacement warranty.',
  description_ar = 'عضوية دولينجو سوبر لمدة 12 شهراً مع ضمان كامل المدة.',
  duration_value = 12,
  duration_unit = 'month',
  warranty_kind = 'full',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'duolingo-super-slot-12-months-156');

-- Offer for: elevenlabs-elevenlabs-free-10k-credits-w24h-75
UPDATE public.offers
SET
  name_en = '10,000 Credits (24H Warranty)',
  name_ar = '10,000 نقطة (ضمان 24 ساعة)',
  description_en = '10,000 voice generation credits with a 24-hour initial warranty.',
  description_ar = 'رصيد 10,000 نقطة لتوليد الأصوات في إليفن لابس مع ضمان 24 ساعة للتسليم.',
  duration_value = NULL,
  duration_unit = NULL,
  warranty_kind = 'fixed',
  warranty_value = 24,
  warranty_unit = 'hour',
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'elevenlabs-elevenlabs-free-10k-credits-w24h-75');

-- Offer for: elevenlabs-creator-12m-167
UPDATE public.offers
SET
  name_en = '12 Months Subscription',
  name_ar = 'اشتراك 12 شهراً',
  description_en = '12-month Creator plan access for high-quality audio projects.',
  description_ar = 'اشتراك سنوي كامل في خطة إليفن لابس كريتور للمشاريع الصوتية الاحترافية.',
  duration_value = 12,
  duration_unit = 'month',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'elevenlabs-creator-12m-167');

-- Offer for: expressvpn-private-5-devices-30d-27
UPDATE public.offers
SET
  name_en = '30 Days (5 Devices - Private)',
  name_ar = '30 يوماً (5 أجهزة - حساب خاص)',
  description_en = 'Private account for up to 5 concurrent devices valid for 30 days.',
  description_ar = 'حساب خاص يدعم حتى 5 أجهزة في نفس الوقت صالح لمدة 30 يوماً مع ضمان كامل.',
  duration_value = 30,
  duration_unit = 'day',
  warranty_kind = 'fixed',
  warranty_value = 30,
  warranty_unit = 'day',
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'expressvpn-private-5-devices-30d-27');

-- Offer for: factory-pro-1-year-176
UPDATE public.offers
SET
  name_en = '1 Year Subscription',
  name_ar = 'اشتراك سنة كاملة',
  description_en = '1-year Factory AI Pro developer access for automated engineering workflows.',
  description_ar = 'اشتراك سنوي في خطة فاكتوري برو لأتمتة دورة تطوير البرمجيات.',
  duration_value = 1,
  duration_unit = 'year',
  warranty_kind = 'none',
  warranty_value = 0,
  warranty_unit = 'day',
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'factory-pro-1-year-176');

-- Offer for: figma-pro-edu-2yrs-107
UPDATE public.offers
SET
  name_en = '2 Years Access',
  name_ar = 'اشتراك سنتين (2 سنة)',
  description_en = '2 years of Figma Professional features through an educational workspace license.',
  description_ar = 'وصول لميزات فيجما بروفيشنال التعليمية لمدة سنتين كاملتين.',
  duration_value = 2,
  duration_unit = 'year',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'figma-pro-edu-2yrs-107');

-- Offer for: framer-pro-1-year-178
UPDATE public.offers
SET
  name_en = '1 Year Subscription',
  name_ar = 'اشتراك سنة كاملة',
  description_en = '1-year annual Framer Pro subscription for publishing responsive websites.',
  description_ar = 'اشتراك سنوي في خطة فرايمر برو لنشر وتصميم المواقع.',
  duration_value = 1,
  duration_unit = 'year',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'framer-pro-1-year-178');

-- Offer for: framer-pro-12m-122
UPDATE public.offers
SET
  name_en = '12 Months Subscription',
  name_ar = 'اشتراك 12 شهراً',
  description_en = '12-month Framer Pro subscription with premium publishing tools.',
  description_ar = 'اشتراك 12 شهراً في فرايمر برو مع أدوات النشر الاحترافية.',
  duration_value = 12,
  duration_unit = 'month',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'framer-pro-12m-122');

-- Offer for: gamma-ai-plus-1m-w25d-163
UPDATE public.offers
SET
  name_en = '1 Month (25 Days Warranty)',
  name_ar = 'اشتراك شهر واحد (ضمان 25 يوماً)',
  description_en = '1-month Gamma AI Plus plan with 25 days replacement warranty.',
  description_ar = 'اشتراك شهر في خطة جاما بلس مع ضمان لمدة 25 يوماً.',
  duration_value = 1,
  duration_unit = 'month',
  warranty_kind = 'fixed',
  warranty_value = 25,
  warranty_unit = 'day',
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'gamma-ai-plus-1m-w25d-163');

-- Offer for: gamma-pro-12m-123
UPDATE public.offers
SET
  name_en = '12 Months Subscription',
  name_ar = 'اشتراك 12 شهراً',
  description_en = '12 months of Gamma Pro with unlimited AI creation credits.',
  description_ar = 'اشتراك سنوي كامل لمدة 12 شهراً في جاما برو مع رصيد ذكاء اصطناعي مفتوح.',
  duration_value = 12,
  duration_unit = 'month',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'gamma-pro-12m-123');

-- Offer for: gemini-18-months-16
UPDATE public.offers
SET
  name_en = '18 Months Subscription',
  name_ar = 'اشتراك 18 شهراً',
  description_en = '18-month Gemini Advanced subscription on dedicated Google account credentials.',
  description_ar = 'اشتراك 18 شهراً في جيميني أدفانسد على حساب جوجل خاص.',
  duration_value = 18,
  duration_unit = 'month',
  warranty_kind = 'none',
  warranty_value = 0,
  warranty_unit = 'day',
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'gemini-18-months-16');

-- Offer for: gmail-4-9-month-old-nw-60
UPDATE public.offers
SET
  name_en = 'Aged 4-9 Months (Ready Account)',
  name_ar = 'عمر 4-9 أشهر (حساب جاهز)',
  description_en = 'Verified Gmail account aged 4-9 months with full credentials delivered instantly.',
  description_ar = 'حساب جيميل مؤكد ونشط بعمر 4 إلى 9 أشهر يُسلم ببياناته الكاملة فوراً.',
  duration_value = NULL,
  duration_unit = NULL,
  warranty_kind = 'none',
  warranty_value = 0,
  warranty_unit = 'day',
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'gmail-4-9-month-old-nw-60');

-- Offer for: hma-key-hma-android-pc-20-30d-143
UPDATE public.offers
SET
  name_en = '20-30 Days License Key',
  name_ar = 'مفتاح تفعيل لمدة 20 إلى 30 يوماً',
  description_en = 'Official digital license key valid for 20 to 30 days on Android or PC.',
  description_ar = 'مفتاح تفعيل رقمي أصلي صالح لمدة 20 إلى 30 يوماً لأجهزة الأندرويد والكمبيوتر.',
  duration_value = 30,
  duration_unit = 'day',
  warranty_kind = 'fixed',
  warranty_value = 20,
  warranty_unit = 'day',
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'hma-key-hma-android-pc-20-30d-143');

-- Offer for: ilovepdf-premium-1yr-105
UPDATE public.offers
SET
  name_en = '1 Year Subscription',
  name_ar = 'اشتراك سنة كاملة',
  description_en = '1-year unlimited access to all iLovePDF Premium web, desktop, and mobile tools.',
  description_ar = 'اشتراك سنوي كامل في ميزات آي لوف بي دي إف بريميوم للويب والكمبيوتر والجوال.',
  duration_value = 1,
  duration_unit = 'year',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'ilovepdf-premium-1yr-105');

-- Offer for: key-windows-10-pro-retail-98
UPDATE public.offers
SET
  name_en = 'Retail Digital License Key (Lifetime)',
  name_ar = 'مفتاح ترخيص رقمي Retail (مدى الحياة)',
  description_en = '100% genuine retail key for 1 PC with permanent activation.',
  description_ar = 'مفتاح ترخيص Retail أصلي 100% لجهاز كمبيوتر واحد مع تفعيل دائم.',
  duration_value = NULL,
  duration_unit = NULL,
  warranty_kind = 'full',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'key-windows-10-pro-retail-98');

-- Offer for: linear-business-1-year-173
UPDATE public.offers
SET
  name_en = '1 Year Subscription',
  name_ar = 'اشتراك سنة كاملة',
  description_en = '1-year Linear Business plan with advanced workflows and integrations.',
  description_ar = 'اشتراك سنوي في خطة لينيار للأعمال مع دعم سير العمل المتقدم والتكاملات.',
  duration_value = 1,
  duration_unit = 'year',
  warranty_kind = 'none',
  warranty_value = 0,
  warranty_unit = 'day',
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'linear-business-1-year-173');

-- Offer for: lovable-pro-12m-171
UPDATE public.offers
SET
  name_en = '12 Months Subscription',
  name_ar = 'اشتراك 12 شهراً',
  description_en = 'Annual Lovable Pro subscription with monthly message allowances and GitHub sync.',
  description_ar = 'اشتراك سنوي في لوفابل برو مع رصيد رسائل شهري وربط مع مستودعات GitHub.',
  duration_value = 12,
  duration_unit = 'month',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'lovable-pro-12m-171');

-- Offer for: magic-patterns-starter-12m-170
UPDATE public.offers
SET
  name_en = '12 Months Subscription',
  name_ar = 'اشتراك 12 شهراً',
  description_en = '12-month access to Magic Patterns Starter for generating UI components.',
  description_ar = 'اشتراك 12 شهراً في ماجيك باترنز لتوليد مكونات واجهات المستخدم البرمجية.',
  duration_value = 12,
  duration_unit = 'month',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'magic-patterns-starter-12m-170');

-- Offer for: manus-pro-1-year-non-warranty-177
UPDATE public.offers
SET
  name_en = '1 Year (No Warranty)',
  name_ar = 'سنة كاملة (بدون ضمان)',
  description_en = '1-year access to Manus Pro autonomous AI agent capabilities without warranty replacement.',
  description_ar = 'اشتراك سنة كاملة في مانوس برو لتنفيذ مهام الذكاء الاصطناعي بدون ضمان استبدال.',
  duration_value = 1,
  duration_unit = 'year',
  warranty_kind = 'none',
  warranty_value = 0,
  warranty_unit = 'day',
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'manus-pro-1-year-non-warranty-177');

-- Offer for: manus-pro-12m-114
UPDATE public.offers
SET
  name_en = '12 Months Subscription',
  name_ar = 'اشتراك 12 شهراً',
  description_en = '12-month standard Manus Pro agent subscription.',
  description_ar = 'اشتراك 12 شهراً في خدمة مانوس برو الذكية.',
  duration_value = 12,
  duration_unit = 'month',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'manus-pro-12m-114');

-- Offer for: meitu-svip-meitu-svip-1m-w25d-153
UPDATE public.offers
SET
  name_en = '1 Month (25 Days Warranty)',
  name_ar = 'اشتراك شهر واحد (ضمان 25 يوماً)',
  description_en = '1-month Meitu Super VIP membership with 25 days replacement warranty.',
  description_ar = 'عضوية ميتو كبار الشخصيات (SVIP) لمدة شهر مع ضمان لمدة 25 يوماً.',
  duration_value = 1,
  duration_unit = 'month',
  warranty_kind = 'fixed',
  warranty_value = 25,
  warranty_unit = 'day',
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'meitu-svip-meitu-svip-1m-w25d-153');

-- Offer for: microsoft-office-365-plus-1-year-35
UPDATE public.offers
SET
  name_en = '1 Year Subscription',
  name_ar = 'اشتراك سنة كاملة',
  description_en = '1-year Microsoft 365 access with 1TB OneDrive cloud storage.',
  description_ar = 'اشتراك سنوي في مايكروسوفت 365 مع مساحة تخزين 1 تيرابايت على OneDrive.',
  duration_value = 1,
  duration_unit = 'year',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'microsoft-office-365-plus-1-year-35');

-- Offer for: miro-edu-lifetime-access-100-members-151
UPDATE public.offers
SET
  name_en = 'Lifetime Access (100 Members)',
  name_ar = 'وصول مدى الحياة (100 عضو)',
  description_en = 'Permanent educational workspace license supporting up to 100 team collaborators.',
  description_ar = 'ترخيص مساحة عمل تعليمية دائم يدعم حتى 100 عضو متعاون في فريقك.',
  duration_value = NULL,
  duration_unit = NULL,
  warranty_kind = 'full',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'miro-edu-lifetime-access-100-members-151');

-- Offer for: mobbin-10x-seat-12m-169
UPDATE public.offers
SET
  name_en = '12 Months (10 Seats Access)',
  name_ar = 'اشتراك 12 شهراً (10 مقاعد)',
  description_en = '12-month access to Mobbin Pro design library with 10 team seats.',
  description_ar = 'اشتراك سنوي في مكتبة موبين برو الاحترافية مع 10 مقاعد لأعضاء الفريق.',
  duration_value = 12,
  duration_unit = 'month',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'mobbin-10x-seat-12m-169');

-- Offer for: n8n-starter-12m-168
UPDATE public.offers
SET
  name_en = '12 Months Subscription',
  name_ar = 'اشتراك 12 شهراً',
  description_en = '12-month n8n Cloud Starter plan for visual workflow automations.',
  description_ar = 'اشتراك 12 شهراً في خطة n8n كلاود ستارت لأتمتة المهام والعمليات.',
  duration_value = 12,
  duration_unit = 'month',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'n8n-starter-12m-168');

-- Offer for: notion-business-3-months-83
UPDATE public.offers
SET
  name_en = '3 Months (48H Warranty)',
  name_ar = 'اشتراك 3 أشهر (ضمان 48 ساعة)',
  description_en = '3-month Notion Business plan with 48 hours setup warranty.',
  description_ar = 'اشتراك 3 أشهر في نوشن للأعمال مع ضمان 48 ساعة للتفعيل والاستلام.',
  duration_value = 3,
  duration_unit = 'month',
  warranty_kind = 'fixed',
  warranty_value = 48,
  warranty_unit = 'hour',
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'notion-business-3-months-83');

-- Offer for: notion-business-1-year-non-warranty-179
UPDATE public.offers
SET
  name_en = '1 Year (No Warranty)',
  name_ar = 'اشتراك سنة كاملة (بدون ضمان)',
  description_en = 'Annual 1-year Notion Business subscription without replacement warranty.',
  description_ar = 'اشتراك سنوي لمدة سنة في خطة نوشن للأعمال بدون ضمان استبدال.',
  duration_value = 1,
  duration_unit = 'year',
  warranty_kind = 'none',
  warranty_value = 0,
  warranty_unit = 'day',
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'notion-business-1-year-non-warranty-179');

-- Offer for: peacock-official-subscriptions-1year-152
UPDATE public.offers
SET
  name_en = '1 Year Subscription',
  name_ar = 'اشتراك سنة كاملة',
  description_en = 'Official 1-year Peacock TV streaming subscription.',
  description_ar = 'اشتراك رسمي لمدة سنة كاملة في منصة بيكوك تي في الترفيهية.',
  duration_value = 1,
  duration_unit = 'year',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'peacock-official-subscriptions-1year-152');

-- Offer for: quillbot-1-month-183
UPDATE public.offers
SET
  name_en = '1 Month Subscription',
  name_ar = 'اشتراك شهر واحد',
  description_en = '1-month QuillBot Premium with unlimited paraphrasing modes and faster processing.',
  description_ar = 'اشتراك شهر في كويك بوت بريميوم مع أوضاع إعادة صياغة غير محدودة وسرعة معالجة عالية.',
  duration_value = 1,
  duration_unit = 'month',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'quillbot-1-month-183');

-- Offer for: quizlet-plus-12m-fw-137
UPDATE public.offers
SET
  name_en = '12 Months (Full Warranty)',
  name_ar = '12 شهراً (ضمان كامل المدة)',
  description_en = '12 months Quizlet Plus with complete warranty coverage throughout.',
  description_ar = 'اشتراك كويزلت بلس لمدة 12 شهراً مع ضمان كامل المدة.',
  duration_value = 12,
  duration_unit = 'month',
  warranty_kind = 'full',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'quizlet-plus-12m-fw-137');

-- Offer for: quizlet-plus-ultimate-12m-fw-138
UPDATE public.offers
SET
  name_en = '12 Months (Full Warranty)',
  name_ar = '12 شهراً (ضمان كامل المدة)',
  description_en = '12 months Quizlet Plus Ultimate edition with full-term warranty guarantee.',
  description_ar = 'اشتراك كويزلت بلس التيميت لمدة 12 شهراً مع ضمان كامل طوال المدة.',
  duration_value = 12,
  duration_unit = 'month',
  warranty_kind = 'full',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'quizlet-plus-ultimate-12m-fw-138');

-- Offer for: railway-hobby-12m-182
UPDATE public.offers
SET
  name_en = '12 Months Subscription',
  name_ar = 'اشتراك 12 شهراً',
  description_en = '12 months of Railway Hobby cloud credits and deployment capabilities.',
  description_ar = 'اشتراك 12 شهراً في خطة ريلواي هوبي 클라우د لنشر واستضافة المشاريع.',
  duration_value = 12,
  duration_unit = 'month',
  warranty_kind = 'none',
  warranty_value = 0,
  warranty_unit = 'day',
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'railway-hobby-12m-182');

-- Offer for: replit-core-12m-121
UPDATE public.offers
SET
  name_en = '12 Months Subscription',
  name_ar = 'اشتراك 12 شهراً',
  description_en = '12-month Replit Core plan with advanced AI model access and boost power.',
  description_ar = 'اشتراك 12 شهراً في ريبليت كور مع موارد معالجة مضاعفة ومساعد الذكاء الاصطناعي.',
  duration_value = 12,
  duration_unit = 'month',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'replit-core-12m-121');

-- Offer for: scribd-scribd-premium-1m-fw-134
UPDATE public.offers
SET
  name_en = '1 Month (Full Warranty)',
  name_ar = 'شهر واحد (ضمان كامل المدة)',
  description_en = '1-month Scribd Premium subscription with full replacement warranty.',
  description_ar = 'اشتراك شهر واحد في سكريبيد بريميوم مع ضمان كامل المدة.',
  duration_value = 1,
  duration_unit = 'month',
  warranty_kind = 'full',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'scribd-scribd-premium-1m-fw-134');

-- Offer for: shahid-vip-subscription-features-3-months-111
UPDATE public.offers
SET
  name_en = '3 Months Subscription',
  name_ar = 'اشتراك 3 أشهر',
  description_en = '3-month Shahid VIP access on supported smart screens, mobile, and web.',
  description_ar = 'اشتراك 3 أشهر في شاهد VIP يعمل على الشاشات الذكية والجوال والكمبيوتر بدون إعلانات.',
  duration_value = 3,
  duration_unit = 'month',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'shahid-vip-subscription-features-3-months-111');

-- Offer for: slot-canva-pro-team-edu-invite-5month-warranty-29
UPDATE public.offers
SET
  name_en = 'Team Invite (5 Months Warranty)',
  name_ar = 'دعوة فريق (ضمان 5 أشهر)',
  description_en = 'Direct team invitation to Canva Pro with 5 months warranty coverage.',
  description_ar = 'دعوة للانضمام إلى فريق كانفا برو مع ضمان مستمر لمدة 5 أشهر.',
  duration_value = 5,
  duration_unit = 'month',
  warranty_kind = 'fixed',
  warranty_value = 5,
  warranty_unit = 'month',
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'slot-canva-pro-team-edu-invite-5month-warranty-29');

-- Offer for: spotify-3m-redeem-link-164
UPDATE public.offers
SET
  name_en = '3 Months (Direct Activation Link)',
  name_ar = '3 أشهر (رابط تفعيل مباشر)',
  description_en = '3-month Spotify Premium activation link redeemable on your personal account.',
  description_ar = 'رابط تفعيل رسمي لاشتراك سبوتيفاي بريميوم لمدة 3 أشهر لحسابك الشخصي.',
  duration_value = 3,
  duration_unit = 'month',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'spotify-3m-redeem-link-164');

-- Offer for: zoom-12-months-100-people-131
UPDATE public.offers
SET
  name_en = '12 Months (100 Participants)',
  name_ar = 'اشتراك 12 شهراً (100 مشارك)',
  description_en = '12-month Zoom Pro plan hosting up to 100 meeting attendees without time limits.',
  description_ar = 'اشتراك 12 شهراً في زووم برو لإقامة الاجتماعات حتى 100 مشارك بدون حد زمني.',
  duration_value = 12,
  duration_unit = 'month',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'zoom-12-months-100-people-131');

-- Offer for: zoom-3-months-100-people-130
UPDATE public.offers
SET
  name_en = '3 Months (100 Participants)',
  name_ar = 'اشتراك 3 أشهر (100 مشارك)',
  description_en = '3-month Zoom Pro plan hosting up to 100 meeting attendees.',
  description_ar = 'اشتراك 3 أشهر في زووم برو لإقامة الاجتماعات حتى 100 مشارك بدون حد زمني.',
  duration_value = 3,
  duration_unit = 'month',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'zoom-3-months-100-people-130');

-- Offer for: zoom-6-months-100-people-132
UPDATE public.offers
SET
  name_en = '6 Months (100 Participants)',
  name_ar = 'اشتراك 6 أشهر (100 مشارك)',
  description_en = '6-month Zoom Pro plan hosting up to 100 meeting attendees.',
  description_ar = 'اشتراك 6 أشهر في زووم برو لإقامة الاجتماعات حتى 100 مشارك بدون حد زمني.',
  duration_value = 6,
  duration_unit = 'month',
  warranty_kind = 'unknown',
  warranty_value = NULL,
  warranty_unit = NULL,
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'zoom-6-months-100-people-132');

-- Offer for: zoom-zoom-pro-1m-w25d-ready-account-129
UPDATE public.offers
SET
  name_en = '1 Month (25 Days Warranty - Ready Account)',
  name_ar = 'اشتراك شهر واحد (ضمان 25 يوماً - حساب جاهز)',
  description_en = '1-month Zoom Pro ready account with 25 days replacement warranty.',
  description_ar = 'حساب زووم برو جاهز صالح لمدة شهر مع ضمان استبدال لمدة 25 يوماً.',
  duration_value = 1,
  duration_unit = 'month',
  warranty_kind = 'fixed',
  warranty_value = 25,
  warranty_unit = 'day',
  terms_source = 'manual',
  terms_review_required = false,
  updated_at = timezone('utc', now())
WHERE product_id = (SELECT id FROM public.products WHERE slug = 'zoom-zoom-pro-1m-w25d-ready-account-129');

COMMIT;
