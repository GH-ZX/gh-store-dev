-- Migration: Normalize Catalog Names, Descriptions, and Offer Terms
-- Cleans clutter from product titles and extracts subscription duration & warranty into structured offer columns.

BEGIN;

-- Product: adobe-express-premium-12-months-93
UPDATE public.products
SET
  name_en = 'Adobe Express Premium',
  name_ar = 'أدوبي إكسبريس بريميوم | Adobe Express Premium',
  description_en = 'Create stunning social graphics, flyers, logos, and videos with Adobe Express Premium templates, royalty-free assets, and premium generative AI tools.',
  description_ar = 'صمم منشورات ومقاطع فيديو وشعارات مذهلة باستخدام قوالب وأدوات الذكاء الاصطناعي الاحترافية من أدوبي إكسبريس بريميوم.',
  updated_at = timezone('utc', now())
WHERE slug = 'adobe-express-premium-12-months-93';

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
WHERE id = 'c8c0fcf9-d75a-4eb3-817e-ddc74f51eebc';

-- Product: amboss-full-subscription-9-months-109
UPDATE public.products
SET
  name_en = 'AMBOSS',
  name_ar = 'أمبوس الطبي | AMBOSS Medical',
  description_en = 'Comprehensive medical learning and clinical decision support platform for medical students and clinicians worldwide.',
  description_ar = 'المنصة الطبية الشاملة للتعليم والبحث السريري للطلاب والأطباء مع بنك أسئلة متكامل ومكتبة طبية.',
  updated_at = timezone('utc', now())
WHERE slug = 'amboss-full-subscription-9-months-109';

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
WHERE id = 'ec5ea0bb-b67f-47dc-9865-983196f7c9e0';

-- Product: apple-tv-official-subscriptions-12m-fw-145
UPDATE public.products
SET
  name_en = 'Apple TV+ Official (12 Months)',
  name_ar = 'آبل تي في بلس رسمي (12 شهراً)',
  description_en = 'Stream critically acclaimed Apple Original shows and blockbuster movies in 4K HDR with spatial audio.',
  description_ar = 'استمتع بأعمال آبل الأصلية الحائزة على جوائز وأحدث الأفلام بجودة 4K HDR وصوت مكاني ثلاثي الأبعاد.',
  updated_at = timezone('utc', now())
WHERE slug = 'apple-tv-official-subscriptions-12m-fw-145';

-- Product: apple-tv-official-subscriptions-6m-fw-146
UPDATE public.products
SET
  name_en = 'Apple TV+ Official',
  name_ar = 'آبل تي في بلس رسمي | Apple TV+',
  description_en = 'Stream critically acclaimed Apple Original shows and movies in 4K HDR with spatial audio across all devices.',
  description_ar = 'استمتع بأعمال آبل الأصلية الحائزة على جوائز وأحدث الأفلام بجودة 4K HDR وصوت مكاني ثلاثي الأبعاد على جميع أجهزتك.',
  updated_at = timezone('utc', now())
WHERE slug = 'apple-tv-official-subscriptions-6m-fw-146';

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
WHERE id = '04ea4f9c-70fc-46a0-a9fe-e0573be9859f';

-- Product: autodesk-admin-dashboard-access-3000-invitation-150
UPDATE public.products
SET
  name_en = 'Autodesk Admin Dashboard',
  name_ar = 'لوحة تحكم أوتوديسك أدمن | Autodesk Admin',
  description_en = 'Administrator portal access for Autodesk product suite management, license provisioning, and user invitations.',
  description_ar = 'لوحة تحكم إدارية لإدارة منتجات وتراخيص أوتوديسك وتوزيع الدعوات للمستخدمين والفرق.',
  updated_at = timezone('utc', now())
WHERE slug = 'autodesk-admin-dashboard-access-3000-invitation-150';

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
WHERE id = '680b5ab8-aeb1-4ce8-be64-67253503a4c0';

-- Product: brain-fm-1-year-174
UPDATE public.products
SET
  name_en = 'Brain.fm',
  name_ar = 'برين إف إم | Brain.fm',
  description_en = 'Science-backed functional music designed to optimize focus, productivity, deep work, relaxation, and sleep.',
  description_ar = 'موسيقى وظيفية مصممة علمياً لتحسين التركيز وزيادة الإنتاجية والاسترخاء والنوم العميق.',
  updated_at = timezone('utc', now())
WHERE slug = 'brain-fm-1-year-174';

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
WHERE id = 'df7b51b3-c15c-4ddf-99e2-ca9606d9a0d8';

-- Product: capcut-6month-fw-individual-26
UPDATE public.products
SET
  name_en = 'CapCut Pro (6 Months)',
  name_ar = 'كاب كات برو (6 أشهر)',
  description_en = 'All-in-one professional video editing suite with AI effects, auto-captions, cloud space, and 4K export.',
  description_ar = 'تطبيق المونتاج الاحترافي الشامل بميزات الذكاء الاصطناعي والتأثيرات الحصرية والتصدير بجودة 4K.',
  updated_at = timezone('utc', now())
WHERE slug = 'capcut-6month-fw-individual-26';

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
WHERE id = '84931a28-ee2a-4db5-b3a5-da9e4726e643';

-- Product: capcut-pro-1-month-fw-18
UPDATE public.products
SET
  name_en = 'CapCut Pro',
  name_ar = 'كاب كات برو | CapCut Pro',
  description_en = 'Unlock VIP effects, transitions, auto-captions, background removal, and premium cloud templates in CapCut Pro.',
  description_ar = 'افتح جميع التأثيرات الاحترافية والانتقالات وإزالة الخلفية بالذكاء الاصطناعي في كاب كات برو.',
  updated_at = timezone('utc', now())
WHERE slug = 'capcut-pro-1-month-fw-18';

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
WHERE id = '6290076a-6091-4cf1-84fc-95b28db0b769';

-- Product: capcut-pro-7-days-97
UPDATE public.products
SET
  name_en = 'CapCut Pro (7 Days)',
  name_ar = 'كاب كات برو (7 أيام)',
  description_en = 'Weekly pass for CapCut Pro video editing with premium AI features, transitions, and 4K exports.',
  description_ar = 'اشتراك أسبوعي في كاب كات برو يتيح ميزات الذكاء الاصطناعي والتأثيرات والتصدير بدقة 4K.',
  updated_at = timezone('utc', now())
WHERE slug = 'capcut-pro-7-days-97';

-- Product: chatgpt-plus-1m-momo-pay-gmail-nw-89
UPDATE public.products
SET
  name_en = 'ChatGPT Plus',
  name_ar = 'شات جي بي تي بلس | ChatGPT Plus',
  description_en = 'Access OpenAI advanced reasoning models, GPT-4o, DALL-E image generation, Code Interpreter, and Custom GPTs.',
  description_ar = 'استمتع بأحدث نماذج الذكاء الاصطناعي من OpenAI مثل GPT-4o وتوليد الصور والتحليل المتقدم وتخصيص النماذج.',
  updated_at = timezone('utc', now())
WHERE slug = 'chatgpt-plus-1m-momo-pay-gmail-nw-89';

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
WHERE id = '471d87e2-0aa0-449e-876e-2144fae9f506';

-- Product: cousera-bussiness-6m-ready-account-161
UPDATE public.products
SET
  name_en = 'Coursera Business',
  name_ar = 'كورسيرا للأعمال | Coursera Business',
  description_en = 'Unlimited access to 7,000+ world-class courses, professional certificates, and degrees from top universities and tech companies.',
  description_ar = 'وصول غير محدود لأكثر من 7,000 دورة وشهادة مهنية معتمدة من أرقى الجامعات والشركات العالمية مثل Google وIBM.',
  updated_at = timezone('utc', now())
WHERE slug = 'cousera-bussiness-6m-ready-account-161';

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
WHERE id = '070d65b1-12c8-47fb-9fa9-76cecb4914c6';

-- Product: cursor-pro-12m-166
UPDATE public.products
SET
  name_en = 'Cursor Pro',
  name_ar = 'كيرسور برو | Cursor Pro AI',
  description_en = 'The AI-first code editor built for lightning-fast pair programming, whole-codebase indexing, and intelligent tab completion.',
  description_ar = 'محرر البرمجة الذكي المعتمد على الذكاء الاصطناعي لفهم وفهرسة كامل المشروع وكتابة الكود والدردشة التفاعلية.',
  updated_at = timezone('utc', now())
WHERE slug = 'cursor-pro-12m-166';

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
WHERE id = '9560f4e3-388f-4ba9-b7b2-7b19685ca1bb';

-- Product: descript-creator-1-year-175
UPDATE public.products
SET
  name_en = 'Descript Creator',
  name_ar = 'ديسكريبت كريتور | Descript Creator',
  description_en = 'Video and audio editing as easy as editing a text doc. Features automated AI transcription, Studio Sound, and screen recording.',
  description_ar = 'تعديل الفيديو والصوت بسهولة عبر تحرير النص مباشرة مع ميزات تحسين الصوت وتفريغ النصوص بالذكاء الاصطناعي.',
  updated_at = timezone('utc', now())
WHERE slug = 'descript-creator-1-year-175';

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
WHERE id = 'c10d32bb-9e90-482a-a92c-fbefc78e1fd7';

-- Product: duolingo-super-slot-12-months-156
UPDATE public.products
SET
  name_en = 'Duolingo Super',
  name_ar = 'دولينجو سوبر | Duolingo Super',
  description_en = 'Learn languages fast with zero ads, unlimited hearts, personalized practice, and unlimited legendary test attempts.',
  description_ar = 'تعلم اللغات بدون إعلانات مع قلوب غير محدودة ومراجعة مخصصة للأخطاء واختبارات لا نهائية في دولينجو سوبر.',
  updated_at = timezone('utc', now())
WHERE slug = 'duolingo-super-slot-12-months-156';

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
WHERE id = '509e530b-04f7-4148-9da4-9a3b2b489c67';

-- Product: elevenlabs-elevenlabs-free-10k-credits-w24h-75
UPDATE public.products
SET
  name_en = 'ElevenLabs 10K Credits',
  name_ar = 'إليفن لابس (10 آلاف نقطة) | ElevenLabs',
  description_en = 'Industry-leading natural AI voice generation, voice cloning, and audio synthesis in dozens of languages.',
  description_ar = 'توليد أصوات بشرية فائقة الواقعية واستنساخ الأصوات بالذكاء الاصطناعي بأكثر من 29 لغة.',
  updated_at = timezone('utc', now())
WHERE slug = 'elevenlabs-elevenlabs-free-10k-credits-w24h-75';

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
WHERE id = 'b6a83fd8-971c-43df-b4d0-4d4cb3176df2';

-- Product: elevenlabs-creator-12m-167
UPDATE public.products
SET
  name_en = 'ElevenLabs Creator',
  name_ar = 'إليفن لابس كريتور | ElevenLabs Creator',
  description_en = 'Professional AI voice generation plan for creators, including commercial audio rights and custom instant voice cloning.',
  description_ar = 'خطة إليفن لابس الاحترافية لصناع المحتوى مع حقوق النشر والاستخدام التجاري واستنساخ الأصوات الفوري.',
  updated_at = timezone('utc', now())
WHERE slug = 'elevenlabs-creator-12m-167';

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
WHERE id = '96bc8e4f-2d93-455b-80a9-25f0e9b986e6';

-- Product: expressvpn-private-5-devices-30d-27
UPDATE public.products
SET
  name_en = 'ExpressVPN Private',
  name_ar = 'إكسبريس في بي إن خاص | ExpressVPN',
  description_en = 'High-speed encrypted VPN across 105 countries with Lightway protocol, strict no-logs policy, and multi-device support.',
  description_ar = 'شبكة VPN فائقة السرعة والتشفير عبر 105 دولة مع بروتوكول Lightway وحماية كاملة للخصوصية بدون سجلات.',
  updated_at = timezone('utc', now())
WHERE slug = 'expressvpn-private-5-devices-30d-27';

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
WHERE id = 'fae98621-e8d1-41ee-a34f-967b57bfbe80';

-- Product: factory-pro-1-year-176
UPDATE public.products
SET
  name_en = 'Factory AI Pro',
  name_ar = 'فاكتوري إي آي برو | Factory AI Pro',
  description_en = 'Autonomous AI coding software engineering agents that automate code reviews, issue resolution, and system migrations.',
  description_ar = 'وكلاء برمجة أذكياء لأتمتة مراجعة الكود وحل المشاكل التقنية وتسريع هندسة البرمجيات.',
  updated_at = timezone('utc', now())
WHERE slug = 'factory-pro-1-year-176';

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
WHERE id = '9c3d42bb-cf30-4e3a-ba62-a42e7bb0e9b9';

-- Product: figma-pro-edu-2yrs-107
UPDATE public.products
SET
  name_en = 'Figma Pro Education',
  name_ar = 'فيجما برو التعليمي | Figma Pro Edu',
  description_en = 'Collaborative UI/UX design and prototyping tool with unlimited projects, shared component libraries, and version history.',
  description_ar = 'الأداة الرائدة عالمياً لتصميم واجهات وتجارب المستخدم والمشاريع التفاعلية مع مكتبات مكونات مشتركة وسجل إصدارات كامل.',
  updated_at = timezone('utc', now())
WHERE slug = 'figma-pro-edu-2yrs-107';

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
WHERE id = '38fbb2eb-157d-411a-8bb7-c62d1645bc89';

-- Product: framer-pro-1-year-178
UPDATE public.products
SET
  name_en = 'Framer Pro (Annual)',
  name_ar = 'فرايمر برو سنوي | Framer Pro',
  description_en = 'Ship production-ready marketing websites at lightning speed with custom domains, CMS, responsive design, and smooth animations.',
  description_ar = 'صمم وانشر مواقع الويب الترويجية والاحترافية بسرعة فائقة مع دومين مخصص ونظام إدارة محتوى وتأثيرات حركية مذهلة.',
  updated_at = timezone('utc', now())
WHERE slug = 'framer-pro-1-year-178';

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
WHERE id = 'df36e147-38ae-4fcf-8472-3e28490e82c5';

-- Product: framer-pro-12m-122
UPDATE public.products
SET
  name_en = 'Framer Pro',
  name_ar = 'فرايمر برو | Framer Pro',
  description_en = 'Design, build, and publish modern responsive sites with interactive layouts, custom code, and seamless integrations.',
  description_ar = 'تصميم وبناء ونشر مواقع الإنترنت التفاعلية الحديثة بتجاوب كامل مع الجوال وتأثيرات احترافية.',
  updated_at = timezone('utc', now())
WHERE slug = 'framer-pro-12m-122';

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
WHERE id = '2a8ff9b1-ec59-47fe-a720-332e1858e7bb';

-- Product: gamma-ai-plus-1m-w25d-163
UPDATE public.products
SET
  name_en = 'Gamma AI Plus',
  name_ar = 'جاما بلس | Gamma AI Plus',
  description_en = 'Generate polished presentations, documents, and web pages from text prompts in seconds with AI formatting and styling.',
  description_ar = 'أنشئ عروضاً تقديمية ومستندات وصفحات ويب احترافية في ثوانٍ معدودة عبر أوامر الذكاء الاصطناعي والتنسيق التلقائي.',
  updated_at = timezone('utc', now())
WHERE slug = 'gamma-ai-plus-1m-w25d-163';

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
WHERE id = '287f94bb-18fc-4c28-971c-ea0e1b3d6f14';

-- Product: gamma-pro-12m-123
UPDATE public.products
SET
  name_en = 'Gamma AI Pro',
  name_ar = 'جاما برو | Gamma AI Pro',
  description_en = 'Unlimited AI generation, custom fonts, advanced analytics, and custom domain publishing for presentations and sites.',
  description_ar = 'توليد غير محدود بالذكاء الاصطناعي وخطوط مخصصة وإحصائيات متقدمة ونشر المواقع والعروض على دومين خاص.',
  updated_at = timezone('utc', now())
WHERE slug = 'gamma-pro-12m-123';

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
WHERE id = 'a78a6350-bbcb-4467-932b-344c207d57ff';

-- Product: gemini-18-months-16
UPDATE public.products
SET
  name_en = 'Google Gemini Advanced',
  name_ar = 'جوجل جيميني أدفانسد | Gemini Advanced',
  description_en = 'Access Google next-gen 1.5 Pro AI models with 1M context window, Workspace integration, and cloud drive storage.',
  description_ar = 'احصل على أقوى نماذج الذكاء الاصطناعي من جوجل (Gemini 1.5 Pro) مع نافذة سياق ضخمة وتكامل مع تطبيقات Google.',
  updated_at = timezone('utc', now())
WHERE slug = 'gemini-18-months-16';

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
WHERE id = '8493a1ee-d0eb-48ff-98ab-8c9039efc862';

-- Product: gmail-4-9-month-old-nw-60
UPDATE public.products
SET
  name_en = 'Gmail Aged Accounts',
  name_ar = 'حسابات جيميل قديمة ومؤكدة | Gmail Ready',
  description_en = 'Aged and verified Google Gmail accounts ideal for developer setups, verification, and API registrations.',
  description_ar = 'حسابات جوجل جيميل قديمة ومؤكدة بعمر من 4 إلى 9 أشهر ومناسبة للمطورين وتفعيل الخدمات المختلفة.',
  updated_at = timezone('utc', now())
WHERE slug = 'gmail-4-9-month-old-nw-60';

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
WHERE id = '57368cfb-6fbb-4e92-93e5-ca3beba0bc5a';

-- Product: hma-key-hma-android-pc-20-30d-143
UPDATE public.products
SET
  name_en = 'HMA VPN License Key',
  name_ar = 'مفتاح تفعيل HMA VPN (أندرويد / كمبيوتر)',
  description_en = 'HideMyAss (HMA) VPN digital activation key supporting fast global servers, military-grade encryption, and IP scrambling.',
  description_ar = 'مفتاح ترخيص رقمي لتفعيل خدمة HMA VPN على الكمبيوتر وهواتف الأندرويد لتصفح آمن وسريع عبر خوادم عالمية.',
  updated_at = timezone('utc', now())
WHERE slug = 'hma-key-hma-android-pc-20-30d-143';

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
WHERE id = 'e1215bb4-c917-4831-a080-d293f2fef799';

-- Product: ilovepdf-premium-1yr-105
UPDATE public.products
SET
  name_en = 'iLovePDF Premium',
  name_ar = 'آي لوف بي دي إف بريميوم | iLovePDF',
  description_en = 'All-in-one PDF productivity tools: merge, split, compress, convert, edit, and OCR PDF files with unlimited batch processing.',
  description_ar = 'مجموعة أدوات تحرير ملفات PDF الشاملة: دمج وتقسيم وضغط وتحويل والتعرف الضوئي على النصوص بدون قيود حجم الملفات.',
  updated_at = timezone('utc', now())
WHERE slug = 'ilovepdf-premium-1yr-105';

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
WHERE id = '79a2bfb7-3c58-450a-9d04-c36da8b9fcb4';

-- Product: key-windows-10-pro-retail-98
UPDATE public.products
SET
  name_en = 'Windows 10 Pro Retail Key',
  name_ar = 'مفتاح ويندوز 10 برو الأصلي (Retail)',
  description_en = 'Genuine Microsoft Windows 10 Professional digital license key with lifetime validity and full official updates.',
  description_ar = 'مفتاح رقمي أصلي لتفعيل نظام مايكروسوفت ويندوز 10 برو مدى الحياة مع التحديثات الرسمية وربطه بالجهاز.',
  updated_at = timezone('utc', now())
WHERE slug = 'key-windows-10-pro-retail-98';

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
WHERE id = '3176df9c-9f6b-4e08-98e9-ab4fe4e542cc';

-- Product: linear-business-1-year-173
UPDATE public.products
SET
  name_en = 'Linear Business',
  name_ar = 'لينيار للأعمال | Linear Business',
  description_en = 'Purpose-built project management, issue tracking, and roadmap planning tool tailored for high-performing engineering teams.',
  description_ar = 'أداة إدارة المشاريع البرمجية وتتبع المهام وخطط العمل المصممة لفرق التطوير عالية الأداء.',
  updated_at = timezone('utc', now())
WHERE slug = 'linear-business-1-year-173';

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
WHERE id = '3e96cfba-d636-419b-a010-8bfa0c04f98e';

-- Product: lovable-pro-12m-171
UPDATE public.products
SET
  name_en = 'Lovable Pro',
  name_ar = 'لوفابل برو | Lovable Pro AI',
  description_en = 'Full-stack AI app generator: go from natural language prompt to deployed web app with backend, database, and auth in minutes.',
  description_ar = 'منصة بناء وتطوير تطبيقات الويب الكاملة بالذكاء الاصطناعي مع قاعدة بيانات وتوثيق مستخدمين ونشر فوري.',
  updated_at = timezone('utc', now())
WHERE slug = 'lovable-pro-12m-171';

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
WHERE id = '011afb63-c7e6-42bb-85e3-a60d5bfa7107';

-- Product: lovalbe-pro-lite-1-year-link-20
UPDATE public.products
SET
  name_en = 'Lovable Pro Lite (1 Year)',
  name_ar = 'لوفابل برو لايت (سنة كاملة)',
  description_en = 'Full-stack AI web application builder with instant prototype publishing, styling controls, and direct code export.',
  description_ar = 'أداة بناء تطبيقات الويب بالذكاء الاصطناعي مع نشر فوري للنماذج وتصدير الأكواد.',
  updated_at = timezone('utc', now())
WHERE slug = 'lovalbe-pro-lite-1-year-link-20';

-- Product: magic-patterns-starter-12m-170
UPDATE public.products
SET
  name_en = 'Magic Patterns Starter',
  name_ar = 'ماجيك باترنز | Magic Patterns Starter',
  description_en = 'AI UI prototyping and component generation that transforms wireframes and ideas into production React and Tailwind code.',
  description_ar = 'منصة تصميم واجهات المستخدم بالذكاء الاصطناعي لتحويل الأفكار إلى أكواد React وTailwind جاهزة للإنتاج.',
  updated_at = timezone('utc', now())
WHERE slug = 'magic-patterns-starter-12m-170';

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
WHERE id = '5736ea24-9b2f-4889-8d54-15c0e7b856ad';

-- Product: manus-pro-1-year-non-warranty-177
UPDATE public.products
SET
  name_en = 'Manus Pro (Annual)',
  name_ar = 'مانوس برو سنوي | Manus Pro',
  description_en = 'General-purpose autonomous AI agent that performs deep web research, executes complex workflows, and produces multi-step outputs.',
  description_ar = 'وكيل الذكاء الاصطناعي المستقل القادر على البحث العميق على الويب وتنفيذ المهام المعقدة وتحليل البيانات.',
  updated_at = timezone('utc', now())
WHERE slug = 'manus-pro-1-year-non-warranty-177';

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
WHERE id = 'e843bb74-0549-4158-b807-74beff5092eb';

-- Product: manus-pro-12m-114
UPDATE public.products
SET
  name_en = 'Manus Pro',
  name_ar = 'مانوس برو | Manus Pro',
  description_en = 'Next-generation AI agent with computer use, web search, document generation, and workflow automation.',
  description_ar = 'الجيل الجديد من وكلاء الذكاء الاصطناعي مع إمكانية تصفح الويب وتحليل المستندات وأتمتة المهام المعقدة.',
  updated_at = timezone('utc', now())
WHERE slug = 'manus-pro-12m-114';

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
WHERE id = 'c850bbcf-3a72-4682-8c08-0ea150c266a1';

-- Product: meitu-svip-meitu-svip-1m-w25d-153
UPDATE public.products
SET
  name_en = 'Meitu SVIP',
  name_ar = 'ميتو كبار الشخصيات | Meitu SVIP',
  description_en = 'Premier mobile photo and video beauty editor featuring AI portraits, facial retouching, HD filters, and body sculpting.',
  description_ar = 'تطبيق تعديل الصور والفيديو الرائد مع ميزات التجميل بالذكاء الاصطناعي وفلاتر الدقة العالية وإزالة الشوائب.',
  updated_at = timezone('utc', now())
WHERE slug = 'meitu-svip-meitu-svip-1m-w25d-153';

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
WHERE id = 'd7b69c4f-9e7c-47ea-8d19-e5a0e9fcb154';

-- Product: microsoft-office-365-plus-1-year-35
UPDATE public.products
SET
  name_en = 'Microsoft 365 Plus',
  name_ar = 'مايكروسوفت أوفيس 365 بلس | Microsoft 365',
  description_en = 'Essential productivity apps including Word, Excel, PowerPoint, Outlook, and OneDrive cloud storage across PC, Mac, and mobile.',
  description_ar = 'حزمة تطبيقات مايكروسوفت المكتبية الأساسية (وورد، إكسل، باوربوينت، أوتلوك) ومساحة سحابية على OneDrive لجميع أجهزتك.',
  updated_at = timezone('utc', now())
WHERE slug = 'microsoft-office-365-plus-1-year-35';

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
WHERE id = '30cf149c-f91b-4d43-8515-5cb9543e06ae';

-- Product: miro-edu-lifetime-access-100-members-151
UPDATE public.products
SET
  name_en = 'Miro EDU',
  name_ar = 'ميرو التعليمي | Miro EDU',
  description_en = 'Visual collaboration whiteboard platform for brainstorming, mind mapping, diagramming, and agile workflows with teams.',
  description_ar = 'لوحة بيضاء رقمية تفاعلية للعصف الذهني ورسم المخططات وإدارة المشاريع التعاونية للفرق والمؤسسات التعليمية.',
  updated_at = timezone('utc', now())
WHERE slug = 'miro-edu-lifetime-access-100-members-151';

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
WHERE id = '96f1ea14-41b9-4d6c-8438-bb4e7fb4a94c';

-- Product: mobbin-10x-seat-12m-169
UPDATE public.products
SET
  name_en = 'Mobbin Pro',
  name_ar = 'موبين برو | Mobbin Pro',
  description_en = 'The world largest mobile and web design pattern reference library with thousands of searchable real-world screenshots and UX flows.',
  description_ar = 'المكتبة الأضخم عالمياً لمرجعيات وتدفقات تصميم تطبيقات الجوال والمواقع مع آلاف الشاشات القابلة للبحث والتحليل.',
  updated_at = timezone('utc', now())
WHERE slug = 'mobbin-10x-seat-12m-169';

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
WHERE id = '5736fcbb-b12e-43a9-963a-bb2a4a9c67fe';

-- Product: n8n-starter-12m-168
UPDATE public.products
SET
  name_en = 'n8n Cloud Starter',
  name_ar = 'إن إيت إن كلاود | n8n Cloud',
  description_en = 'Fair-code workflow automation and AI agent builder: connect 400+ apps, databases, and custom APIs with visual node logic.',
  description_ar = 'منصة أتمتة سير العمل وبناء وكلاء الذكاء الاصطناعي وربط أكثر من 400 تطبيق وقاعدة بيانات بمنطق مرئي وسهل.',
  updated_at = timezone('utc', now())
WHERE slug = 'n8n-starter-12m-168';

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
WHERE id = 'bb53a479-05ea-44a6-896f-47ba322eb9f0';

-- Product: notion-business-3-months-83
UPDATE public.products
SET
  name_en = 'Notion Business (Quarterly)',
  name_ar = 'نوشن للأعمال (3 أشهر) | Notion Business',
  description_en = 'Connected collaborative workspace for notes, wiki documentation, project management, and automated databases.',
  description_ar = 'مساحة العمل المتكاملة للملاحظات وإدارة المشاريع وقواعد البيانات والويكي المؤسسي مع ميزات الذكاء الاصطناعي.',
  updated_at = timezone('utc', now())
WHERE slug = 'notion-business-3-months-83';

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
WHERE id = 'ec5871f3-d0ea-44f6-8ef3-7033501a4e1e';

-- Product: notion-business-1-year-non-warranty-179
UPDATE public.products
SET
  name_en = 'Notion Business (Annual)',
  name_ar = 'نوشن للأعمال سنوي | Notion Business',
  description_en = 'Enterprise-grade documentation, workspace permissions, SAML SSO, and unlimited page history in Notion Business.',
  description_ar = 'خطة نوشن للأعمال السنوية مع سجل إصدارات غير محدود وصلاحيات متقدمة وتكاملات للمؤسسات.',
  updated_at = timezone('utc', now())
WHERE slug = 'notion-business-1-year-non-warranty-179';

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
WHERE id = 'bb58a471-55ea-48cb-996b-58bb5cb471ef';

-- Product: peacock-official-subscriptions-1year-152
UPDATE public.products
SET
  name_en = 'Peacock TV Official',
  name_ar = 'بيكوك تي في رسمي | Peacock TV',
  description_en = 'Stream NBCUniversal movies, exclusive original shows, live sports, Premier League games, and WWE events in HD.',
  description_ar = 'شاهد أحدث الأفلام والمسلسلات الحصرية من NBCUniversal مع البث المباشر لأقوى المباريات ومنافسات المصارعة والرياضات العالمية.',
  updated_at = timezone('utc', now())
WHERE slug = 'peacock-official-subscriptions-1year-152';

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
WHERE id = '9c5b20bb-48ef-417c-a49e-b83ba79efb50';

-- Product: proton-vpn-plus-1-month-10-devices-94
UPDATE public.products
SET
  name_en = 'Proton VPN Plus (10 Devices)',
  name_ar = 'بروتون في بي إن بلس (10 أجهزة)',
  description_en = 'Swiss-based secure and encrypted VPN with NetShield ad-blocker, Tor over VPN, and fast 10 Gbps servers.',
  description_ar = 'شبكة VPN سويسرية فائقة الأمان والتشفير مع حجب الإعلانات وخوادم بسرعة 10 جيجابت ودعم 10 أجهزة.',
  updated_at = timezone('utc', now())
WHERE slug = 'proton-vpn-plus-1-month-10-devices-94';

-- Product: quillbot-1-month-183
UPDATE public.products
SET
  name_en = 'QuillBot Premium',
  name_ar = 'كويك بوت بريميوم | QuillBot Premium',
  description_en = 'AI paraphrasing tool, grammar checker, plagiarism detector, summarizer, and translator for academic and professional writing.',
  description_ar = 'أداة إعادة الصياغة الذكية وفحص القواعد والسرقة الأدبية وتلخيص النصوص للطلاب والباحثين والكتاب.',
  updated_at = timezone('utc', now())
WHERE slug = 'quillbot-1-month-183';

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
WHERE id = 'ee75b630-d467-4eb7-a841-f67c3bb1d9fe';

-- Product: quizlet-plus-12m-fw-137
UPDATE public.products
SET
  name_en = 'Quizlet Plus',
  name_ar = 'كويزلت بلس | Quizlet Plus',
  description_en = 'Master any subject with AI study guides, flashcards, expert solutions, practice tests, and offline studying.',
  description_ar = 'تعلم واحفظ أي مادة دراسية بذكاء باستخدام البطاقات التعليمية التفاعلية واختبارات الممارسة والحلول النموذجية بدون إنترنت.',
  updated_at = timezone('utc', now())
WHERE slug = 'quizlet-plus-12m-fw-137';

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
WHERE id = '5736ba24-8bcf-46c9-a9fe-3715c0aefb50';

-- Product: quizlet-plus-ultimate-12m-fw-138
UPDATE public.products
SET
  name_en = 'Quizlet Plus Ultimate',
  name_ar = 'كويزلت بلس ألتيميت | Quizlet Plus Ultimate',
  description_en = 'Top-tier Quizlet access with unlimited AI mock tests, audio study modes, and advanced question explanations.',
  description_ar = 'أعلى باقة في كويزلت بلس تشمل اختبارات محاكاة بالذكاء الاصطناعي وميزات صوتية وشرحاً تفصيلياً للحلول.',
  updated_at = timezone('utc', now())
WHERE slug = 'quizlet-plus-ultimate-12m-fw-138';

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
WHERE id = '5736dbcf-1cf7-4f7c-9b14-87a0c64efb60';

-- Product: railway-hobby-12m-182
UPDATE public.products
SET
  name_en = 'Railway Hobby',
  name_ar = 'ريلواي هوبي | Railway Hobby',
  description_en = 'Frictionless cloud deployment platform for full-stack apps, databases, and cron jobs with instant GitHub integrations.',
  description_ar = 'منصة استضافة سحابية فائقة السرعة للمطورين لنشر التطبيقات وقواعد البيانات والخدمات مباشرة من GitHub.',
  updated_at = timezone('utc', now())
WHERE slug = 'railway-hobby-12m-182';

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
WHERE id = '5736ecdf-6ff7-44bc-87bc-da9efb3601fa';

-- Product: replit-core-12m-121
UPDATE public.products
SET
  name_en = 'Replit Core',
  name_ar = 'ريبليت كور | Replit Core',
  description_en = 'Cloud collaborative IDE with AI agent code completions, persistent hosting, Git sync, and instant web app deployment.',
  description_ar = 'بيئة تطوير برمجية سحابية متكاملة مدعومة بالذكاء الاصطناعي لكتابة وتشغيل واستضافة التطبيقات في ثوانٍ.',
  updated_at = timezone('utc', now())
WHERE slug = 'replit-core-12m-121';

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
WHERE id = '8493cfba-0e12-4fb8-8547-bbef819340cd';

-- Product: scribd-scribd-premium-1m-fw-134
UPDATE public.products
SET
  name_en = 'Scribd Premium',
  name_ar = 'سكريبيد بريميوم | Scribd Premium',
  description_en = 'Unlimited digital library of bestsellers, audiobooks, academic papers, sheet music, and magazine articles.',
  description_ar = 'مكتبة رقمية ضخمة تتيح قراءة واستماع غير محدود لملايين الكتب والروايات والكتب الصوتية والبحوث العلمية.',
  updated_at = timezone('utc', now())
WHERE slug = 'scribd-scribd-premium-1m-fw-134';

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
WHERE id = 'ce64715c-00f8-4654-93fd-b7a61e986908';

-- Product: shahid-vip-subscription-features-3-months-111
UPDATE public.products
SET
  name_en = 'Shahid VIP',
  name_ar = 'شاهد VIP | Shahid VIP',
  description_en = 'Leading Arabic streaming platform featuring exclusive original series, premiers, live HD TV channels, and sports.',
  description_ar = 'منصة البث الرائدة في العالم العربي لمشاهدة أقوى الأعمال الأصلية الحصرية والمسلسلات العربية والقنوات التلفزيونية بجودة فائقة.',
  updated_at = timezone('utc', now())
WHERE slug = 'shahid-vip-subscription-features-3-months-111';

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
WHERE id = '29252c63-1948-4b39-a1c5-690ae7fdc49e';

-- Product: slot-canva-pro-team-edu-invite-5month-warranty-29
UPDATE public.products
SET
  name_en = 'Canva Pro Team Invite',
  name_ar = 'كانفا برو (دعوة فريق) | Canva Pro',
  description_en = 'Create stunning graphics with millions of premium stock photos, fonts, brand kits, background remover, and magic resize tools.',
  description_ar = 'صمم منشورات وإعلانات احترافية مع ملايين الصور والخطوط الحصرية وأداة إزالة الخلفية والتنسيق السحري في كانفا برو.',
  updated_at = timezone('utc', now())
WHERE slug = 'slot-canva-pro-team-edu-invite-5month-warranty-29';

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
WHERE id = '8accd839-63c1-4a61-8a5c-f5c814a9fcf6';

-- Product: spotify-3m-redeem-link-164
UPDATE public.products
SET
  name_en = 'Spotify Premium',
  name_ar = 'سبوتيفاي بريميوم | Spotify Premium',
  description_en = 'Ad-free high-fidelity music streaming, offline downloads, unlimited song skips, and personalized playlists.',
  description_ar = 'استمع إلى ملايين الأغاني والبودكاست بدون إعلانات وبأعلى دقة صوتية مع إمكانية التحميل والاستماع دون إنترنت.',
  updated_at = timezone('utc', now())
WHERE slug = 'spotify-3m-redeem-link-164';

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
WHERE id = '646c437f-fdb7-4036-a61c-22ef7224af9c';

-- Product: zoom-12-months-100-people-131
UPDATE public.products
SET
  name_en = 'Zoom Pro (12 Months - 100 Seats)',
  name_ar = 'زووم برو (12 شهراً - 100 مشارك)',
  description_en = 'Professional cloud video meetings, team chat, screen sharing, and recording for up to 100 concurrent participants.',
  description_ar = 'اجتماعات فيديو احترافية ومحادثات ومشاركة شاشة عالية الدقة تتسع حتى 100 مشارك مع تسجيل سحابي بدون قيود الوقت.',
  updated_at = timezone('utc', now())
WHERE slug = 'zoom-12-months-100-people-131';

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
WHERE id = '772bf305-d7a2-4457-9c92-7e0bea79f812';

-- Product: zoom-3-months-100-people-130
UPDATE public.products
SET
  name_en = 'Zoom Pro (3 Months - 100 Seats)',
  name_ar = 'زووم برو (3 أشهر - 100 مشارك)',
  description_en = 'Reliable video conferencing for business meetings, webinars, and team collaboration with 100 participants.',
  description_ar = 'اجتماعات فيديو احترافية عالية الدقة تتسع حتى 100 مشارك مع تسجيل الاجتماعات بدون قيود الوقت.',
  updated_at = timezone('utc', now())
WHERE slug = 'zoom-3-months-100-people-130';

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
WHERE id = '359ef9d0-3c7e-4596-b152-ad9dd0a5aac7';

-- Product: zoom-6-months-100-people-132
UPDATE public.products
SET
  name_en = 'Zoom Pro (6 Months - 100 Seats)',
  name_ar = 'زووم برو (6 أشهر - 100 مشارك)',
  description_en = 'Host seamless video conferences and online workshops with cloud recording and meeting transcripts.',
  description_ar = 'إقامة اجتماعات وورش عمل عبر الفيديو بدقة عالية مع تسجيل الاجتماعات بدون قيود الـ 40 دقيقة.',
  updated_at = timezone('utc', now())
WHERE slug = 'zoom-6-months-100-people-132';

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
WHERE id = 'c9336608-22da-4a5c-a9b1-ac1244f59d4b';

-- Product: zoom-zoom-pro-1m-w25d-ready-account-129
UPDATE public.products
SET
  name_en = 'Zoom Pro',
  name_ar = 'زووم برو | Zoom Pro',
  description_en = 'High-quality video conferencing and team chat platform for seamless online communication without meeting time limits.',
  description_ar = 'منصة الاجتماعات والمحادثات المرئية الرائدة لإجراء اللقاءات الجماعية بدقة ووضوح بدون قيود زمنية.',
  updated_at = timezone('utc', now())
WHERE slug = 'zoom-zoom-pro-1m-w25d-ready-account-129';

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
WHERE id = '981ad7ce-021b-4791-ade0-b09a449ca100';

-- Product: 1-mtn-14
UPDATE public.products
SET
  name_en = 'MTN Syria Credit',
  name_ar = 'رصيد سيريتل و MTN سوريا',
  description_en = 'Direct mobile balance recharge and bundles for MTN Syria telecom networks.',
  description_ar = 'شحن رصيد وباقات خطوط سيريتل و MTN سوريا للدفع المسبق والمسبق الدفع بسرعة وموثوقية.',
  updated_at = timezone('utc', now())
WHERE slug = '1-mtn-14';

-- Product: nord-vpn
UPDATE public.products
SET
  name_en = 'NordVPN',
  name_ar = 'نورد في بي إن | NordVPN',
  description_en = 'Next-generation VPN protection with NordLynx protocol, Threat Protection anti-malware, and 6,000+ global servers.',
  description_ar = 'حماية متطورة وتصفح مشفر فائق السرعة عبر أكثر من 6000 خادم عالمي مع ميزة حجب البرمجيات الضارة.',
  updated_at = timezone('utc', now())
WHERE slug = 'nord-vpn';

COMMIT;
