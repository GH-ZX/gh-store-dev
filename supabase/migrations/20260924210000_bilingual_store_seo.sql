-- Fill dashboard SEO fields from reviewed bilingual copy; preserve non-empty owner edits.
do $seo$
declare
  defaults jsonb := $copy${
  "title_ar": "GH Store | شحن ألعاب وبطاقات واشتراكات رقمية",
  "title_en": "GH Store | Game Top-Ups, Gift Cards & Subscriptions",
  "description_ar": "تسوق شحن الألعاب والبطاقات والاشتراكات وأدوات الذكاء الاصطناعي والتصميم في GH Store. قارن العروض وراجع المدة والضمان والمنطقة قبل الشراء.",
  "description_en": "Shop game top-ups, gift cards, subscriptions, AI and design tools at GH Store. Compare offers and check duration, warranty and region before buying.",
  "og_image_url": "/storefront/gh-store-social.png",
  "pages": {
    "/products": {
      "title_ar": "جميع المنتجات الرقمية | GH Store",
      "title_en": "Digital Products & Subscriptions | GH Store",
      "description_ar": "تصفح منتجات GH Store: شحن الألعاب والبطاقات والاشتراكات وأدوات الذكاء الاصطناعي والتصميم. قارن العروض وتحقق من المدة والضمان والمنطقة قبل الشراء.",
      "description_en": "Browse game top-ups, gift cards, subscriptions, AI and design tools at GH Store. Compare offers and check duration, warranty and region before buying."
    },
    "/games": {
      "title_ar": "شحن الألعاب والمنتجات داخل الألعاب | GH Store",
      "title_en": "Game Top-Ups & In-Game Products | GH Store",
      "description_ar": "اختر منتج لعبتك في GH Store وقارن باقات الشحن المتاحة. راجع المنطقة ومتطلبات الحساب وسعر العرض قبل تأكيد الطلب.",
      "description_en": "Find game top-ups and in-game products at GH Store. Compare available packages and check the region, account requirements and price before ordering."
    },
    "/gift-cards": {
      "title_ar": "بطاقات الهدايا والأكواد الرقمية | GH Store",
      "title_en": "Gift Cards & Digital Codes | GH Store",
      "description_ar": "تصفح بطاقات الهدايا والأكواد الرقمية في GH Store. تحقق من قيمة البطاقة والمنطقة والمنصة وطريقة الاستخدام قبل شراء العرض المناسب.",
      "description_en": "Browse gift cards and digital codes at GH Store. Check the value, region, platform and redemption instructions to choose the right offer."
    },
    "/sale": {
      "title_ar": "عروض المنتجات الرقمية والتخفيضات | GH Store",
      "title_en": "Digital Product Offers & Discounts | GH Store",
      "description_ar": "اكتشف عروض المنتجات الرقمية المخفضة المتاحة في GH Store. قارن السعر الحالي وتفاصيل كل عرض، بما فيها المدة والضمان والمنطقة.",
      "description_en": "Explore available discounts on digital products at GH Store. Compare current prices and review each offer’s duration, warranty and region."
    },
    "/best-sellers": {
      "title_ar": "المنتجات الأكثر طلباً | GH Store",
      "title_en": "Popular Digital Product Offers | GH Store",
      "description_ar": "تصفح عروض المنتجات الأكثر طلباً حسب مشتريات GH Store، وراجع تفاصيل الباقات والأسعار المتاحة قبل اختيار عرضك.",
      "description_en": "Browse popular digital product offers based on GH Store purchases. Review available packages, prices and product details before choosing."
    },
    "/search": {
      "title_ar": "البحث عن المنتجات والعروض | GH Store",
      "title_en": "Search Products & Offers | GH Store",
      "description_ar": "ابحث في GH Store عن المنتجات والعروض بالعربية أو الإنجليزية، من شحن الألعاب والبطاقات إلى الاشتراكات والأدوات الرقمية.",
      "description_en": "Search GH Store in Arabic or English for game top-ups, gift cards, subscriptions and digital tools, then compare available offers."
    },
    "/faq": {
      "title_ar": "الأسئلة الشائعة: الطلبات والدفع والتسليم | GH Store",
      "title_en": "Orders, Payments & Delivery FAQ | GH Store",
      "description_ar": "إجابات عن شراء المنتجات وشحن المحفظة وحالة الطلب والتسليم في GH Store. تعرف على المعلومات التي تحتاجها قبل الشراء وكيف تتواصل مع الدعم.",
      "description_en": "Find answers about buying products, recharging your wallet, order status and delivery at GH Store. Learn what to check before buying and how to get help."
    },
    "/how": {
      "title_ar": "كيفية الشراء وشحن المحفظة | GH Store",
      "title_en": "How to Buy & Recharge Your Wallet | GH Store",
      "description_ar": "تعرف على خطوات الشراء من GH Store: إنشاء الحساب وشحن المحفظة واختيار العرض ومراجعة بياناته ومتابعة الطلب حتى التسليم.",
      "description_en": "Learn how to shop at GH Store: create an account, recharge your wallet, choose an offer, review its details and track your order through delivery."
    },
    "/about": {
      "title_ar": "عن متجر GH Store للمنتجات الرقمية",
      "title_en": "About GH Store | Digital Products Store",
      "description_ar": "تعرف على GH Store، متجر للمنتجات الرقمية يشمل شحن الألعاب والبطاقات والاشتراكات وأدوات الذكاء الاصطناعي والتصميم والإنتاجية.",
      "description_en": "Meet GH Store, a digital products store offering game top-ups, gift cards, subscriptions and tools for AI, design and productivity."
    },
    "/contact": {
      "title_ar": "تواصل معنا ودعم الطلبات | GH Store",
      "title_en": "Contact & Order Support | GH Store",
      "description_ar": "تواصل مع دعم GH Store للاستفسار عن المنتجات والطلبات والمدفوعات. أرفق رقم الطلب أو طلب التعبئة لمساعدتنا على متابعة استفسارك.",
      "description_en": "Contact GH Store support about products, orders or payments. Include your order or recharge reference so we can investigate your request."
    },
    "/refunds": {
      "title_ar": "سياسة الاسترجاع والاسترداد | GH Store",
      "title_en": "Refund Policy | GH Store",
      "description_ar": "اطلع على سياسة الاسترجاع في GH Store، بما يشمل حالات تعذر التسليم والأكواد الرقمية وخطوات التواصل مع الدعم بشأن طلبك.",
      "description_en": "Read the GH Store refund policy, including failed delivery, digital codes and how to contact support about an order."
    },
    "/privacy": {
      "title_ar": "سياسة الخصوصية والبيانات | GH Store",
      "title_en": "Privacy & Data Policy | GH Store",
      "description_ar": "تعرف على البيانات المستخدمة لإدارة حسابك وطلباتك ومدفوعاتك في GH Store، وكيفية التواصل بشأن الخصوصية وخيارات التحليلات الاختيارية.",
      "description_en": "Learn how GH Store uses account, order and payment data, how to contact us about privacy and how optional analytics preferences work."
    },
    "/terms": {
      "title_ar": "شروط استخدام المتجر والشراء | GH Store",
      "title_en": "Store Terms & Purchase Conditions | GH Store",
      "description_ar": "راجع شروط استخدام GH Store والشراء من المتجر، بما يشمل مسؤولية بيانات الحساب وتفاصيل المنتجات والمدفوعات ومتابعة الطلبات.",
      "description_en": "Review GH Store’s terms for using the store and buying digital products, including account details, product conditions, payments and orders."
    },
    "/links": {
      "title_ar": "روابط المتجر وقنوات التواصل | GH Store",
      "title_en": "Store Links & Contact Channels | GH Store",
      "description_ar": "اعثر على روابط GH Store وقنوات التواصل المنشورة في المتجر، وانتقل إلى المنتجات أو الدعم من مكان واحد.",
      "description_en": "Find GH Store links and published contact channels, with routes to products and support in one place."
    }
  }
}$copy$::jsonb;
  current_seo jsonb;
  next_seo jsonb;
  page record;
  field record;
  page_value jsonb;
begin
  select coalesce(seo,'{}'::jsonb) into current_seo from public.store_settings where id='global' for update;
  if current_seo is null then raise exception 'Store settings missing'; end if;
  next_seo := current_seo;
  for field in select * from jsonb_each(defaults - 'pages') loop
    if nullif(btrim(current_seo->>field.key),'') is null then next_seo := jsonb_set(next_seo,array[field.key],field.value); end if;
  end loop;
  if jsonb_typeof(next_seo->'pages') is distinct from 'object' then next_seo := jsonb_set(next_seo,'{pages}','{}'); end if;
  for page in select * from jsonb_each(defaults->'pages') loop
    page_value := coalesce(next_seo->'pages'->page.key,'{}'::jsonb);
    for field in select * from jsonb_each(page.value) loop
      if nullif(btrim(page_value->>field.key),'') is null then page_value := jsonb_set(page_value,array[field.key],field.value); end if;
    end loop;
    next_seo := jsonb_set(next_seo,array['pages',page.key],page_value);
  end loop;
  update public.store_settings set seo=next_seo where id='global';
end $seo$;
