/* ============================================================
   THE PINK ROOM — i18n (English / Arabic)
   Standalone (no dependency on catalog.js/shared-ui.js) so any page
   can use it — the shared chrome (shared-ui.js) reads window.TPR_I18N
   from here, and pages with their own custom layout (like the policy
   page) can read it directly too, without pulling in the full nav/
   cart/search chrome they don't use.

   Choice is stored in localStorage (tpr_lang), same pattern as cart/
   wishlist. Switching language reloads the page — the simplest way to
   guarantee every already-rendered string re-renders correctly, with
   no partial-update bugs from patching dozens of independent DOM
   nodes. Nothing else about the site changes when this runs.

   Coverage so far (deliberately scoped, expanded page by page):
     - the shared chrome shared-ui.js builds (navbar, menus, drawers,
       tabbar) — reaches every page that includes shared-ui.js
     - the Refund & Return Policy page's own content (the only
       page-specific content translated so far — verbatim-faithful
       translation, no wording/conditions changed in meaning)
   Everything else on the site is still English-only until it's
   explicitly asked for, same as the chrome was before it.
   ============================================================ */
(function(){
  const LANG_KEY = 'tpr_lang';

  const DICT = {
    en: {
      shopAll: 'SHOP ALL', paintings: 'PAINTINGS', lighting: 'LIGHTING', furniture: 'FURNITURE',
      home: 'Home', accessories: 'Accessories', wallArt: 'WallArt', plants: 'Artificial Plants', sale: 'Sale', contact: 'Contact',
      shopByRoom: 'SHOP BY ROOM', currency: 'CURRENCY', language: 'LANGUAGE',
      yourBag: 'YOUR BAG', shoppingBag: 'Shopping Bag', subtotal: 'Subtotal', checkout: 'CHECKOUT',
      taxNote: 'Taxes and shipping calculated at checkout.',
      policyPrefix: 'By completing your purchase, you agree to our', policyAnd: 'and',
      termsConditions: 'Terms & Conditions', refundPolicy: 'Refund & Return Policy',
      continueShopping: 'CONTINUE SHOPPING', bagEmptySub: 'Your bag is waiting for something beautiful.',
      exploreProducts: 'EXPLORE PRODUCTS',
      search: 'SEARCH', findSomethingBeautiful: 'Find something beautiful.', searchPlaceholder: 'What are you looking for?',
      popularSearches: 'POPULAR SEARCHES', pillVases: 'Vases', pillLighting: 'Lighting', pillTables: 'Tables',
      pillCandles: 'Candles', pillMarble: 'Marble', pillSale: 'Sale', exploreTheEdit: 'EXPLORE THE EDIT',
      results: 'RESULTS', viewAllResults: 'VIEW ALL RESULTS', nothingFound: 'NOTHING FOUND',
      nothingFoundSub: "We couldn't find what you're looking for.",
      trySearching: 'Try searching for vases, lighting, tables or paintings.', exploreAllProducts: 'EXPLORE ALL PRODUCTS',
      tabHome: 'HOME', tabShop: 'SHOP', tabSearch: 'SEARCH', tabWishlist: 'WISHLIST', tabCart: 'CART',

      // Refund & Return Policy page
      policyBack: 'BACK', policyCustomerCare: 'CUSTOMER CARE', policyPageTitle: 'Refund & Return Policy',
      policyIntro: 'At The Pink Room, we are committed to ensure your optimum satisfaction with every purchase. If for any reason you are not fully satisfied, you may request a return within 14 days of receiving your order based on the below.',
      policyReturnsHeading: 'Returns',
      policyReturnsIntro: 'To be eligible for a return, the following conditions must be met:',
      policyReturnsList: [
        'The item must be in the same condition as received',
        'The item must be unused and undamaged',
        'The item must be returned in its original packaging',
        'A receipt or proof of purchase is required'
      ],
      policyReturnsContactPrefix: 'Please contact The Pink Room team',
      policyReturnsContactSuffix: 'prior to returning any item. Once your return request has been approved, you will receive detailed instructions on how to send back your order.',
      policyReturnsNote: 'Returns sent without prior authorization will not be accepted.',
      policyDamagedHeading: 'Damaged, Defective, or Incorrect Items',
      policyDamagedP1: 'We kindly ask that you inspect your order upon receipt.',
      policyDamagedP2: 'If the item arrives damaged, defective, or incorrect, please contact us immediately and include clear photos of the product and the packaging. This will allow us to assess the issue and provide an appropriate resolution as quickly as possible.',
      policyNonReturnableHeading: 'Non-Returnable Items',
      policyNonReturnableIntro: 'We will not be able to accept returns for the following items:',
      policyNonReturnableList: [
        'Custom-made or specially ordered products',
        'Personalized items',
        'Plants or other perishable goods',
        'Items that have been used, damaged, or altered after delivery',
        'Items returned without original packaging',
        'Sale or clearance items',
        'Gift cards'
      ],
      policyNonReturnableFooter: 'If you are unsure whether your item is eligible for return, please contact us before initiating a return.',
      policyExchangesHeading: 'Exchanges',
      policyExchangesP1: 'If you wish to exchange an item, please contact us ASAP.',
      policyExchangesP2: 'The original item must meet our return eligibility criteria. Once the return has been approved.',
      policyRefundsHeading: 'Refunds',
      policyRefundsP1: 'Once your returned item has been received and inspected, we will notify you of the approval status of your refund.',
      policyRefundsP2: 'If approved, the refund will be issued to your original payment method, where applicable ASAP.',
      policyRefundsP3: 'Please note that processing times may vary depending on your bank, card issuer, or payment provider.',
      policyImportantHeading: 'Important Information',
      policyImportantP1: 'Shipping and delivery fees are non-refundable as it’s a third party service.',
      policyImportantP2: 'For any questions regarding returns, exchanges, or refunds, please contact The Pink Room team.',
      policyStillQuestion: 'Still have a question about your order?',
      policyChatWhatsapp: 'CHAT ON WHATSAPP', policyEmailUs: 'EMAIL US',
      policyBackToShop: 'Back to shop', policyAllRightsReserved: 'All rights reserved.'
    },
    ar: {
      shopAll: 'تسوقي الكل', paintings: 'لوحات', lighting: 'إضاءة', furniture: 'أثاث',
      home: 'الرئيسية', accessories: 'إكسسوارات', wallArt: 'لوحات حائط', plants: 'نباتات', sale: 'تخفيضات', contact: 'تواصل معنا',
      shopByRoom: 'تسوقي حسب الغرفة', currency: 'العملة', language: 'اللغة',
      yourBag: 'حقيبتك', shoppingBag: 'حقيبة التسوق', subtotal: 'الإجمالي الفرعي', checkout: 'إتمام الشراء',
      taxNote: 'الضرائب والشحن يتم حسابهم عند إتمام الشراء.',
      policyPrefix: 'بإتمامك الشراء، فإنك توافقين على', policyAnd: 'و',
      termsConditions: 'الشروط والأحكام', refundPolicy: 'سياسة الاسترجاع والاستبدال',
      continueShopping: 'أكملي التسوق', bagEmptySub: 'حقيبتك في انتظار شيء جميل.',
      exploreProducts: 'اكتشفي المنتجات',
      search: 'بحث', findSomethingBeautiful: 'ابحثي عن شيء جميل.', searchPlaceholder: 'بتدوري على إيه؟',
      popularSearches: 'الأكثر بحثاً', pillVases: 'مزهريات', pillLighting: 'إضاءة', pillTables: 'طاولات',
      pillCandles: 'شموع', pillMarble: 'رخام', pillSale: 'تخفيضات', exploreTheEdit: 'مختارات مميزة',
      results: 'النتائج', viewAllResults: 'عرض كل النتائج', nothingFound: 'لا توجد نتائج',
      nothingFoundSub: 'لم نتمكن من إيجاد ما تبحثين عنه.',
      trySearching: 'جربي البحث عن مزهريات، إضاءة، طاولات أو لوحات.', exploreAllProducts: 'اكتشفي كل المنتجات',
      tabHome: 'الرئيسية', tabShop: 'تسوقي', tabSearch: 'بحث', tabWishlist: 'المفضلة', tabCart: 'الحقيبة',

      // Refund & Return Policy page — faithful translation, no
      // conditions/numbers changed (still 14 days, same lists, etc.)
      policyBack: 'رجوع', policyCustomerCare: 'خدمة العملاء', policyPageTitle: 'سياسة الاسترجاع والاستبدال',
      policyIntro: 'في ذا بينك روم، نحرص على تحقيق أعلى درجات الرضا مع كل عملية شراء. إذا لم تكوني راضية تمامًا لأي سبب، يمكنك طلب استرجاع خلال 14 يومًا من استلام طلبك وفقًا للشروط التالية.',
      policyReturnsHeading: 'الاسترجاع',
      policyReturnsIntro: 'لكي يكون المنتج مؤهلاً للاسترجاع، يجب توافر الشروط التالية:',
      policyReturnsList: [
        'أن يكون المنتج بنفس الحالة التي تم استلامه بها',
        'أن يكون المنتج غير مستخدم وغير تالف',
        'أن يتم إرجاع المنتج في عبوته الأصلية',
        'يجب إرفاق إيصال أو ما يثبت الشراء'
      ],
      policyReturnsContactPrefix: 'يُرجى التواصل مع فريق ذا بينك روم عبر',
      policyReturnsContactSuffix: 'قبل إرجاع أي منتج. بمجرد الموافقة على طلب الاسترجاع، سيصلك تعليمات مفصّلة عن كيفية إعادة طلبك.',
      policyReturnsNote: 'لن يتم قبول أي مرتجعات يتم إرسالها بدون تصريح مسبق.',
      policyDamagedHeading: 'المنتجات التالفة أو المعيبة أو الخاطئة',
      policyDamagedP1: 'نرجو منكِ فحص طلبك فور استلامه.',
      policyDamagedP2: 'في حال وصول المنتج تالفًا أو معيبًا أو غير مطابق للطلب، يُرجى التواصل معنا فورًا مع إرفاق صور واضحة للمنتج والتغليف. سيساعدنا ذلك في تقييم المشكلة وتقديم الحل المناسب في أسرع وقت ممكن.',
      policyNonReturnableHeading: 'المنتجات غير القابلة للاسترجاع',
      policyNonReturnableIntro: 'لا يمكننا قبول استرجاع المنتجات التالية:',
      policyNonReturnableList: [
        'المنتجات المصنوعة حسب الطلب أو المطلوبة خصيصًا',
        'المنتجات المخصصة',
        'النباتات أو أي سلع أخرى قابلة للتلف',
        'المنتجات التي تم استخدامها أو إتلافها أو تعديلها بعد التسليم',
        'المنتجات المرتجعة بدون عبوتها الأصلية',
        'منتجات التخفيضات أو التصفية',
        'بطاقات الهدايا'
      ],
      policyNonReturnableFooter: 'إذا لم تكوني متأكدة من أهلية منتجك للاسترجاع، يُرجى التواصل معنا قبل بدء عملية الاسترجاع.',
      policyExchangesHeading: 'الاستبدال',
      policyExchangesP1: 'إذا رغبتِ في استبدال منتج، يُرجى التواصل معنا في أقرب وقت ممكن.',
      policyExchangesP2: 'يجب أن يستوفي المنتج الأصلي شروط أهلية الاسترجاع الخاصة بنا. بعد الموافقة على الاسترجاع.',
      policyRefundsHeading: 'استرداد الأموال',
      policyRefundsP1: 'بمجرد استلام المنتج المرتجع وفحصه، سنُخطرك بحالة الموافقة على استرداد أموالك.',
      policyRefundsP2: 'في حال الموافقة، سيتم رد المبلغ إلى وسيلة الدفع الأصلية، حيثما أمكن، في أقرب وقت ممكن.',
      policyRefundsP3: 'يُرجى ملاحظة أن مدة معالجة الاسترداد قد تختلف حسب البنك أو جهة إصدار البطاقة أو مزود خدمة الدفع.',
      policyImportantHeading: 'معلومات هامة',
      policyImportantP1: 'رسوم الشحن والتوصيل غير قابلة للاسترداد كونها خدمة تقدمها جهة خارجية.',
      policyImportantP2: 'لأي استفسارات حول الاسترجاع أو الاستبدال أو استرداد الأموال، يُرجى التواصل مع فريق ذا بينك روم.',
      policyStillQuestion: 'لسه عندك سؤال عن طلبك؟',
      policyChatWhatsapp: 'تواصلي عبر واتساب', policyEmailUs: 'راسلينا بالإيميل',
      policyBackToShop: 'العودة للمتجر', policyAllRightsReserved: 'جميع الحقوق محفوظة.'
    }
  };

  function getLang(){
    try { return localStorage.getItem(LANG_KEY) === 'ar' ? 'ar' : 'en'; } catch(e){ return 'en'; }
  }
  function t(key){
    const lang = getLang();
    const v = (DICT[lang] && DICT[lang][key]);
    return v !== undefined ? v : (DICT.en[key] !== undefined ? DICT.en[key] : key);
  }
  function applyDocumentDirection(){
    const lang = getLang();
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }
  function setLang(lang){
    try { localStorage.setItem(LANG_KEY, lang === 'ar' ? 'ar' : 'en'); } catch(e){}
    location.reload();
  }

  applyDocumentDirection(); // as early as possible — before any chrome/page markup below reads t()

  window.TPR_I18N = { t, getLang, setLang };
})();
