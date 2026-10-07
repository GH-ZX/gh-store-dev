-- Item 9 — regional variants of the same product must be distinguishable.
--
-- Owner's words: "those MLBB are different regions, keep them, not compatible
-- with each other — help me with that."
--
-- This migration keeps every product, offer, price and provider mapping exactly
-- as it is. It only adds the region facts a shopper needs, taken from the
-- supplier's own published notes in `provider_game_mappings.metadata->>'notes'`
-- (synced 2026-09-10/24), plus region words a shopper actually types in Arabic.
--
-- What is deliberately NOT done:
--   * No product is merged, retired or redirected.
--   * No region name is invented. G2Bulk's notes for `mlbb_special` and
--     `mlbb_exclusive` state only which countries are excluded, not which
--     region the package serves, so `region.label_*` stays absent for those two
--     and the page says the supplier has not published a region. The owner must
--     supply those two labels, or confirm them with the supplier.
--   * No price, mapping, offer, or administrator override is touched.
--
-- `products.metadata.region` is the machine-readable record:
--   { "label_en": …, "label_ar": …, "excluded": [...], "note_en": …,
--     "note_ar": …, "region_status": …, "source": … }
-- `label_en`/`label_ar` are absent when the supplier published no region;
-- `region_status` is 'not_recorded' in that case.

begin;

-- 1. Mobile Legends, three separate regional packages.
--    `mlbb` is the global package; G2Bulk excludes ID/SG/MY/PH/RU/VN from it.
update public.products set
  description_en = 'Mobile Legends: Bang Bang diamond top-up delivered straight to your game account. This is the global Mobile Legends package, not the Special or Exclusive package, and the three are not interchangeable: the package is only valid for the region the supplier allocated to it. The supplier publishes this package as available everywhere except Indonesia, Singapore, Malaysia, the Philippines, Russia and Vietnam — players inside those countries must order the Mobile Legends Special package instead. Check which package your account can accept before you pay — a top-up sent to the wrong regional package cannot be moved or refunded. Enter your player ID and server ID exactly as they appear in the game, because those two values are what the supplier uses to find your account. Diamond credit is delivered to the account you name, not a code you redeem yourself.',
  description_ar = 'شحن جواهر Mobile Legends: Bang Bang مباشرة إلى حسابك في اللعبة. هذه هي باقة Mobile Legends العالمية، وليست باقة Special ولا باقة Exclusive، والباقات الثلاث غير متبادلة: كل باقة صالحة فقط للمنطقة التي خُصّصت لها عند المورّد. ينشر المورّد هذه الباقة كمتاحة في كل المناطق باستثناء إندونيسيا وسنغافورة وماليزيا والفلبين وروسيا وفيتنام، وعلى اللاعبين داخل هذه الدول طلب باقة Mobile Legends Special بدلًا منها. تأكد من الباقة التي يقبلها حسابك قبل الدفع؛ فالشحن المرسل إلى باقة منطقة غير مطابقة لا يمكن نقله ولا استرجاعه. أدخل معرّف اللاعب ومعرّف السيرفر كما يظهران في اللعبة تمامًا، فهاتان القيمتان هما ما يستخدمه المورّد للوصول إلى حسابك. تُسلَّم الجواهر إلى الحساب الذي تحدده، وليست كودًا تستبدله بنفسك.',
  search_aliases = search_aliases || array['mobile legends global', 'mlbb global', 'موبايل ليجند العالميه', 'موبايل ليجند العالمية'],
  metadata = metadata || jsonb_build_object('region', jsonb_build_object(
    'label_en', 'Global (supplier excludes Indonesia, Singapore, Malaysia, the Philippines, Russia and Vietnam)',
    'label_ar', 'عالمية (يستثني المورّد إندونيسيا وسنغافورة وماليزيا والفلبين وروسيا وفيتنام)',
    'excluded', jsonb_build_array('ID', 'SG', 'MY', 'PH', 'RU', 'VN'),
    'note_en', 'Not available for Indonesia users, Indonesian users can use mlbb_global. Not available for SG/MY/PH/RU/VN',
    'note_ar', 'غير متاحة للمستخدمين في إندونيسيا؛ على مستخدمي إندونيسيا استخدام باقة mlbb_global. وغير متاحة في سنغافورة وماليزيا والفلبين وروسيا وفيتنام.',
    'region_status', 'published',
    'source', 'provider_game_mappings.metadata.notes'
  ))
where slug = 'mlbb';

update public.products set
  description_en = 'Mobile Legends: Bang Bang diamond top-up for the supplier''s Special regional package, delivered straight to your game account. This is a different regional package from the global Mobile Legends package and from Mobile Legends Exclusive — the three are not interchangeable, and a top-up sent to the wrong one cannot be moved or refunded. The supplier has not published which region this package serves — it states only that Indonesia is excluded and that Indonesian players must use the global or Indonesia package. If you are unsure which package your account accepts, ask our support team before paying and include your player ID and server ID so the correct package can be confirmed. Enter your player ID and server ID exactly as they appear in the game. Diamond credit is delivered to the account you name, not a code you redeem yourself.',
  description_ar = 'شحن جواهر Mobile Legends: Bang Bang عبر باقة Special الإقليمية لدى المورّد، ويُسلَّم مباشرة إلى حسابك في اللعبة. هذه باقة إقليمية مختلفة عن باقة Mobile Legends العالمية وعن باقة Mobile Legends Exclusive، والباقات الثلاث غير متبادلة، والشحن المرسل إلى باقة غير مطابقة لا يمكن نقله ولا استرجاعه. لم ينشر المورّد المنطقة التي تخدمها هذه الباقة؛ فهو يذكر فقط أن إندونيسيا مستثناة وأن على لاعبي إندونيسيا استخدام الباقة العالمية أو باقة إندونيسيا. إن لم تكن متأكدًا من الباقة التي يقبلها حسابك فاسأل فريق الدعم قبل الدفع واذكر معرّف اللاعب ومعرّف السيرفر للتأكد من الباقة الصحيحة. أدخل معرّف اللاعب ومعرّف السيرفر كما يظهران في اللعبة تمامًا. تُسلَّم الجواهر إلى الحساب الذي تحدده، وليست كودًا تستبدله بنفسك.',
  search_aliases = search_aliases || array['mobile legends special', 'mlbb special', 'موبايل ليجند باقة خاصه', 'موبايل ليجند باقة خاصة', 'موبايل ليجند سبيشال'],
  metadata = metadata || jsonb_build_object('region', jsonb_build_object(
    'excluded', jsonb_build_array('ID'),
    'note_en', 'Not available for Indonesia users, Indonesian users can use mlbb_global/mlbb_indo',
    'note_ar', 'غير متاحة لمستخدمي إندونيسيا؛ على مستخدمي إندونيسيا استخدام mlbb_global أو mlbb_indo.',
    'region_status', 'not_recorded',
    'source', 'provider_game_mappings.metadata.notes'
  ))
where slug = 'mlbb-special';

update public.products set
  description_en = 'Mobile Legends: Bang Bang diamond top-up for the supplier''s Exclusive regional package, delivered straight to your game account. This is a different regional package from the global Mobile Legends package and from Mobile Legends Special — the three are not interchangeable, and a top-up sent to the wrong one cannot be moved or refunded. The supplier has not published which region this package serves — it states only that Indonesia, Singapore, Malaysia, Russia and Vietnam are excluded. If you are unsure which package your account accepts, ask our support team before paying and include your player ID and server ID so the correct package can be confirmed. Enter your player ID and server ID exactly as they appear in the game. Diamond credit is delivered to the account you name, not a code you redeem yourself.',
  description_ar = 'شحن جواهر Mobile Legends: Bang Bang عبر باقة Exclusive الإقليمية لدى المورّد، ويُسلَّم مباشرة إلى حسابك في اللعبة. هذه باقة إقليمية مختلفة عن باقة Mobile Legends العالمية وعن باقة Mobile Legends Special، والباقات الثلاث غير متبادلة، والشحن المرسل إلى باقة غير مطابقة لا يمكن نقله ولا استرجاعه. لم ينشر المورّد المنطقة التي تخدمها هذه الباقة؛ فهو يذكر فقط أن إندونيسيا وسنغافورة وماليزيا وروسيا وفيتنام مستثناة. إن لم تكن متأكدًا من الباقة التي يقبلها حسابك فاسأل فريق الدعم قبل الدفع واذكر معرّف اللاعب ومعرّف السيرفر للتأكد من الباقة الصحيحة. أدخل معرّف اللاعب ومعرّف السيرفر كما يظهران في اللعبة تمامًا. تُسلَّم الجواهر إلى الحساب الذي تحدده، وليست كودًا تستبدله بنفسك.',
  search_aliases = search_aliases || array['mobile legends exclusive', 'mlbb exclusive', 'موبايل ليجند باقة حصريه', 'موبايل ليجند باقة حصرية', 'موبايل ليجند اكسلوسيف'],
  metadata = metadata || jsonb_build_object('region', jsonb_build_object(
    'excluded', jsonb_build_array('ID', 'SG', 'MY', 'RU', 'VN'),
    'note_en', 'Not available for ID/SG/MY/RU/VN',
    'note_ar', 'غير متاحة في إندونيسيا وسنغافورة وماليزيا وروسيا وفيتنام.',
    'region_status', 'not_recorded',
    'source', 'provider_game_mappings.metadata.notes'
  ))
where slug = 'mlbb-exclusive';

-- 2. Free Fire, three separate regional packages. The supplier names the region
--    for the Middle East and Europe packages; the global package carries
--    exclusions instead.
update public.products set
  metadata = metadata || jsonb_build_object('region', jsonb_build_object(
    'label_en', 'Middle East',
    'label_ar', 'الشرق الأوسط',
    'excluded', jsonb_build_array(),
    'note_en', 'Available for Middle East Users',
    'note_ar', 'متاحة لمستخدمي الشرق الأوسط.',
    'region_status', 'published',
    'source', 'provider_game_mappings.metadata.notes'
  )),
  search_aliases = search_aliases || array['freefire middle east', 'free fire middle east', 'فري فاير الشرق الاوسط', 'فري فاير الشرق الأوسط', 'فري فاير ميدل ايست']
where slug = 'freefire-me';

update public.products set
  metadata = metadata || jsonb_build_object('region', jsonb_build_object(
    'label_en', 'Europe',
    'label_ar', 'أوروبا',
    'excluded', jsonb_build_array(),
    'note_en', 'Available for Europe Users',
    'note_ar', 'متاحة لمستخدمي أوروبا.',
    'region_status', 'published',
    'source', 'provider_game_mappings.metadata.notes'
  )),
  search_aliases = search_aliases || array['freefire europe', 'free fire europe', 'فري فاير اوروبا', 'فري فاير أوروبا']
where slug = 'freefire-eu';

update public.products set
  metadata = metadata || jsonb_build_object('region', jsonb_build_object(
    'label_en', 'Global (supplier excludes Vietnam, Thailand, Indonesia and the Middle East)',
    'label_ar', 'عالمية (يستثني المورّد فيتنام وتايلاند وإندونيسيا والشرق الأوسط)',
    'excluded', jsonb_build_array('VN', 'TH', 'ID', 'ME'),
    'note_en', 'Not available for Vietnam, Thailand and Indonesia users, not available for Middle East Users',
    'note_ar', 'غير متاحة لمستخدمي فيتنام وتايلاند وإندونيسيا، وغير متاحة لمستخدمي الشرق الأوسط.',
    'region_status', 'published',
    'source', 'provider_game_mappings.metadata.notes'
  )),
  search_aliases = search_aliases || array['freefire global', 'free fire global', 'فري فاير العالميه', 'فري فاير العالمية']
where slug = 'freefire-global';

-- 3. Arena Breakout: the supplier marks both packages as available everywhere,
--    so the honest distinction is the title, not a region. Recording that as an
--    explicit "no regional restriction" fact stops a later reader from guessing
--    one, and the aliases keep both titles findable.
update public.products set
  metadata = metadata || jsonb_build_object('region', jsonb_build_object(
    'label_en', 'No regional restriction stated by the supplier',
    'label_ar', 'لا يوجد قيد إقليمي معلن من المورّد',
    'excluded', jsonb_build_array(),
    'note_en', 'Available for all users',
    'note_ar', 'متاحة لجميع المستخدمين.',
    'region_status', 'published',
    'source', 'provider_game_mappings.metadata.notes'
  )),
  search_aliases = search_aliases || array['arena breakout global']
where slug = 'arena-breakout';

update public.products set
  metadata = metadata || jsonb_build_object('region', jsonb_build_object(
    'label_en', 'No regional restriction stated by the supplier',
    'label_ar', 'لا يوجد قيد إقليمي معلن من المورّد',
    'excluded', jsonb_build_array(),
    'note_en', 'Available for all users',
    'note_ar', 'متاحة لجميع المستخدمين.',
    'region_status', 'published',
    'source', 'provider_game_mappings.metadata.notes'
  )),
  search_aliases = search_aliases || array['arena breakout infinite', 'arena breakout انفينيت', 'ارينا بريك اوت انفينيت']
where slug = 'arena-breakout-infinite';

-- 4. Turkey-locked cards. The region is already in the title; these aliases are
--    what an Arabic shopper types when they mean the Turkish card specifically,
--    and the copy states plainly that the code is region-locked. `coalesce`
--    keeps any description an administrator already wrote.
update public.products set
  description_ar = coalesce(nullif(description_ar, ''), 'بطاقة PlayStation Network (PSN) بفئة بالليرة التركية. هذه البطاقة مقيّدة بمنطقة تركيا: لا تعمل إلا على حساب PSN مسجَّل في تركيا، ولا يمكن استخدامها على حساب منطقة أخرى. تأكد من منطقة حسابك قبل الشراء، فالبطاقات المقيّدة إقليميًا لا تُستبدل ولا تُسترجع بعد التسليم. يُسلَّم الكود رقميًا بعد الدفع ويظهر في صفحة الطلب.'),
  description_en = coalesce(nullif(description_en, ''), 'PlayStation Network (PSN) card denominated in Turkish lira. The card is region-locked to Turkey: it only works on a PSN account registered in Turkey and cannot be used on an account from another region. Check your account region before paying — region-locked codes are not exchanged or refunded once delivered. The code is delivered digitally after payment and appears on your order page.'),
  search_aliases = search_aliases || array['psn turkey card', 'playstation turkey', 'بطاقة بلايستيشن تركيا', 'بلايستيشن تركيا', 'psn تركيا']
where slug = 'psn-turkey';

update public.products set
  description_ar = coalesce(nullif(description_ar, ''), 'بطاقة هدية Xbox بفئة بالليرة التركية. هذه البطاقة مقيّدة بمنطقة تركيا: لا يمكن استبدالها إلا على حساب Microsoft/Xbox مسجَّل في تركيا، ولا تعمل على حساب منطقة أخرى. تأكد من منطقة حسابك قبل الشراء، فالبطاقات المقيّدة إقليميًا لا تُستبدل ولا تُسترجع بعد التسليم. يُسلَّم الكود رقميًا بعد الدفع ويظهر في صفحة الطلب.'),
  description_en = coalesce(nullif(description_en, ''), 'Xbox gift card denominated in Turkish lira. The card is region-locked to Turkey: it can only be redeemed on a Microsoft/Xbox account registered in Turkey and will not work on an account from another region. Check your account region before paying — region-locked codes are not exchanged or refunded once delivered. The code is delivered digitally after payment and appears on your order page.'),
  search_aliases = search_aliases || array['xbox turkey', 'xbox gift card turkey', 'بطاقة اكس بوكس تركيا', 'اكس بوكس تركيا']
where slug = 'xbox-gift-card-turkey';

update public.products set
  description_ar = coalesce(nullif(description_ar, ''), 'شحن Riot Cash بفئة بالليرة التركية لحسابات Valorant في تركيا. هذا المنتج مقيّد بمنطقة تركيا: لا يعمل إلا على حساب Riot مسجَّل في تركيا، ولا يمكن استخدامه على حساب منطقة أخرى. تأكد من منطقة حسابك قبل الشراء، فالرصيد المرسل إلى منطقة غير مطابقة لا يمكن نقله ولا استرجاعه. أدخل معرّف حساب Riot كما يظهر في اللعبة.'),
  description_en = coalesce(nullif(description_en, ''), 'Riot Cash top-up denominated in Turkish lira for Valorant accounts in Turkey. The product is region-locked to Turkey: it only works on a Riot account registered in Turkey and cannot be used on an account from another region. Check your account region before paying — credit sent to a mismatched region cannot be moved or refunded. Enter your Riot account ID exactly as it appears in the game.'),
  search_aliases = search_aliases || array['valorant turkey', 'riot cash turkey', 'فالورانت تركيا', 'ريوت كاش تركيا']
where slug = 'valorant-riot-cash-turkey';

-- 5. Every remaining active game/currency product gets an explicit
--    "region not recorded" marker, so the page says the region is unverified
--    instead of leaving the shopper to guess, and a later pass can query the
--    products that still need a real region. Non-regional products (software,
--    AI subscriptions, gift cards with no region split) are left alone: a region
--    field on those would be noise, not a fact.
update public.products set
  metadata = metadata || jsonb_build_object('region', jsonb_build_object(
    'region_status', 'not_recorded',
    'source', 'no provider region note recorded'
  ))
where is_active = true
  and product_kind in ('game', 'virtual_currency')
  and (metadata -> 'region') is null;

commit;
