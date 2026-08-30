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
      policyBackToShop: 'Back to shop', policyAllRightsReserved: 'All rights reserved.',

      // Homepage (index.html)
      heroTitle: 'The Art of Fine Living', heroSub: 'Curated Elegance For Every Home', heroBtn: 'SHOP NOW',
      offerEyebrow: 'LIMITED TIME OFFER', offerDesc: 'Elevate your space with pieces you’ll love for less.',
      offerBtn: 'SHOP THE OFFER', offerEnds: 'OFFER ENDS SOON',
      catsEyebrow: 'EXPLORE OUR RANGE', catsTitle: 'Shop by Category', catsSub: 'Curated pieces for every corner of your home.',
      catPaintings: 'Paintings', catAccessories: 'Accessories', catLighting: 'Lighting', catFurniture: 'Furniture',
      catWallArt: 'WallArt', catPlants: 'Artificial Plants', catSale: 'Sale',
      catCta: 'Explore Collection', catSaleNote: 'Selected pieces, limited prices.', catSaleCta: 'Shop Now',
      viewAllProducts: 'VIEW ALL PRODUCTS',
      tsTagline: 'TOP SELLERS', tsDesc: 'Handpicked favorites that bring beauty, elegance, and character to every space.',
      tsTitleHtml: 'Pieces <em>Our Community</em><br>Can’t Stop Loving',
      trustQuality: 'Premium Quality', trustQualitySub: 'Finest materials, made to last',
      trustPayment: 'Secure Payment', trustPaymentSub: '100% safe & secure checkout',
      trustDelivery: 'Fast Delivery', trustDeliverySub: 'Quick & reliable delivery',
      trustReturns: 'Easy Returns', trustReturnsSub: 'Hassle-free returns',
      trustSupport: 'Support 24/7', trustSupportSub: 'We’re here to help',
      roomsDecorLeft: 'THE PINK ROOM', roomsDecorRight: 'DESIGNED', roomsDecorRightBr: 'TO INSPIRE',
      roomsEyebrow: 'SHOP BY', roomsTitle: 'ROOM', roomsSub: 'Discover pieces, curated for every corner of your home.',
      roomsExploreBtn: 'EXPLORE ALL ROOMS', roomDiscover: 'DISCOVER',
      roomLivingRoomHtml: 'Living<br>Room', roomBedroom: 'Bedroom', roomDiningAreaHtml: 'Dining<br>Area',
      roomEntranceConsoleHtml: 'Entrance<br>Console', roomBathroom: 'Bathroom', roomOutdoorSpaceHtml: 'Outdoor<br>Space',
      journalEyebrow: 'FOLLOW OUR JOURNEY', journalTitle: 'THE PINK ROOM',
      journalSub: 'Behind the scenes, styling ideas, and timeless pieces.<br>Find daily inspiration on Instagram.',
      journalStayInspired: 'STAY INSPIRED', journalNewsSub: 'New arrivals, styling ideas & exclusive offers.',
      newsletterPlaceholder: 'Enter your email', newsletterBtn: 'JOIN THE ROOM',
      footerAbout: 'The Pink Room is an Egyptian home accessories brand founded in 2020 by Dalia Hassan and Ashraf El Sanjak, bringing together over 20 years of experience across multinational companies, event styling, and trading ventures. Built on the belief that chic doesn’t have to be expensive, The Pink Room offers stylish, carefully selected pieces that bring character and elegance to every space at accessible prices.',
      footerShop: 'SHOP', footerAllProducts: 'All Products', footerCustomerCare: 'CUSTOMER CARE',
      footerFollowUs: 'FOLLOW US', footerNeedHelp: 'NEED HELP?', footerChatWhatsapp: 'Chat with us on WhatsApp',
      footerFindMaps: 'Find us on Google Maps', footerTerms: 'Terms & Conditions', footerPrivacy: 'Privacy Policy',

      // Category page (category.html)
      freeDelivery: 'FREE DELIVERY ON ORDERS OVER EGP 5000',
      catBack: 'BACK', catEyebrow: 'THE COLLECTION', catSearchResults: 'SEARCH RESULTS',
      catCuratedCollection: 'CURATED COLLECTION', catShopByRoom: 'SHOP BY ROOM',
      catShowingSearch: 'Showing everything matching your search.',
      catLimitedOfferTitle: 'Limited Time Offer', catLimitedOfferDesc: 'Selected pieces at a special price, for a limited time.',
      catLimitedOfferEyebrow: 'LIMITED TIME OFFER',
      products: 'Products', sortBy: 'Sort by',
      sortFeatured: 'Featured', sortNewest: 'Newest', sortPriceAsc: 'Price: Low to High', sortPriceDesc: 'Price: High to Low',
      filtersLabel: 'FILTERS', sortByLabel: 'SORT BY',
      noProductsFound: 'NO PRODUCTS FOUND', noProductsSub: 'Try adjusting your filters or explore another collection.',
      clearFilters: 'CLEAR FILTERS', clearAll: 'CLEAR ALL', showResults: 'SHOW RESULTS',
      filtersHeading: 'Filters', filterCategory: 'CATEGORY', filterColor: 'COLOR', filterMaterial: 'MATERIAL',
      filterSize: 'SIZE', filterAvailability: 'AVAILABILITY', filterCollection: 'COLLECTION', filterPrice: 'PRICE',
      moreLabel: '+ More', lessLabel: '– Less',
      soldOut: 'SOLD OUT', saleTag: 'SALE', newTag: 'NEW', addToBag: 'ADD TO BAG', added: 'ADDED',
      catFooterAbout: 'Curated elegance for every home. Timeless pieces, selected with love.',
      collectionNewArrivals: 'New Arrivals', collectionSale: 'Sale', collectionSummer: 'Summer', collectionHandPainted: 'Hand-Painted',
      collectionNewArrivalsDesc: 'Fresh pieces to elevate your home, added to the collection most recently.',
      collectionSaleDesc: 'Beautiful pieces at special prices, for a limited time.',
      collectionSummerDesc: 'Light, fresh and perfect for the season.',
      collectionHandPaintedDesc: 'Artisanal pieces with unique character, painted by hand.',
      allProductsCatName: 'All Products',
      allProductsCatDesc: 'The complete collection — every piece we carry, from paintings and lighting to accessories and furniture.'
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
      policyBackToShop: 'العودة للمتجر', policyAllRightsReserved: 'جميع الحقوق محفوظة.',

      // Homepage (index.html)
      heroTitle: 'فن الحياة الراقية', heroSub: 'أناقة مختارة لكل بيت', heroBtn: 'تسوقي الآن',
      offerEyebrow: 'عرض لفترة محدودة', offerDesc: 'ارتقي بمساحتك بقطع هتحبيها بسعر أقل.',
      offerBtn: 'تسوقي العرض', offerEnds: 'العرض لفترة محدودة',
      catsEyebrow: 'اكتشفي مجموعتنا', catsTitle: 'تسوقي حسب الفئة', catsSub: 'قطع مختارة بعناية لكل ركن في بيتك.',
      catPaintings: 'لوحات', catAccessories: 'إكسسوارات', catLighting: 'إضاءة', catFurniture: 'أثاث',
      catWallArt: 'لوحات حائط', catPlants: 'نباتات صناعية', catSale: 'تخفيضات',
      catCta: 'اكتشفي المجموعة', catSaleNote: 'قطع مختارة، أسعار محدودة.', catSaleCta: 'تسوقي الآن',
      viewAllProducts: 'عرض كل المنتجات',
      tsTagline: 'الأكثر مبيعاً', tsDesc: 'مفضلات مختارة بعناية تضيف جمالاً وأناقة وطابعاً مميزاً لكل مساحة.',
      tsTitleHtml: 'قطع <em>مجتمعنا</em><br>لا يتوقف عن حبها',
      trustQuality: 'جودة عالية', trustQualitySub: 'أجود الخامات، مصنوعة لتدوم',
      trustPayment: 'دفع آمن', trustPaymentSub: 'دفع آمن ومضمون 100%',
      trustDelivery: 'توصيل سريع', trustDeliverySub: 'توصيل سريع وموثوق',
      trustReturns: 'استرجاع سهل', trustReturnsSub: 'استرجاع بدون تعقيد',
      trustSupport: 'دعم على مدار الساعة', trustSupportSub: 'إحنا هنا عشان نساعدك',
      roomsDecorLeft: 'ذا بينك روم', roomsDecorRight: 'مصمم', roomsDecorRightBr: 'ليُلهمك',
      roomsEyebrow: 'تسوقي حسب', roomsTitle: 'الغرفة', roomsSub: 'اكتشفي قطعاً مختارة بعناية لكل ركن في بيتك.',
      roomsExploreBtn: 'اكتشفي كل الغرف', roomDiscover: 'اكتشفي',
      roomLivingRoomHtml: 'غرفة<br>المعيشة', roomBedroom: 'غرفة النوم', roomDiningAreaHtml: 'منطقة<br>الطعام',
      roomEntranceConsoleHtml: 'المدخل<br>الرئيسي', roomBathroom: 'الحمام', roomOutdoorSpaceHtml: 'المساحة<br>الخارجية',
      journalEyebrow: 'تابعي رحلتنا', journalTitle: 'ذا بينك روم',
      journalSub: 'كواليس، أفكار للديكور، وقطع خالدة.<br>اكتشفي إلهاماً يومياً على إنستجرام.',
      journalStayInspired: 'ابقي ملهمة', journalNewsSub: 'وصولات جديدة، أفكار للديكور وعروض حصرية.',
      newsletterPlaceholder: 'أدخلي بريدك الإلكتروني', newsletterBtn: 'انضمي إلينا',
      footerAbout: 'ذا بينك روم هي علامة تجارية مصرية لإكسسوارات المنزل، تأسست عام 2020 على يد داليا حسن وأشرف السنجق، بخبرة تفوق 20 عاماً في الشركات متعددة الجنسيات وتنسيق الفعاليات والتجارة. مبنية على فكرة أن الأناقة لا تحتاج لتكون باهظة الثمن، تقدم ذا بينك روم قطعاً أنيقة ومختارة بعناية تضفي طابعاً وأناقة على كل مساحة بأسعار في متناول الجميع.',
      footerShop: 'تسوقي', footerAllProducts: 'كل المنتجات', footerCustomerCare: 'خدمة العملاء',
      footerFollowUs: 'تابعينا', footerNeedHelp: 'محتاجة مساعدة؟', footerChatWhatsapp: 'تواصلي معنا عبر واتساب',
      footerFindMaps: 'اعثري علينا على خرائط جوجل', footerTerms: 'الشروط والأحكام', footerPrivacy: 'سياسة الخصوصية',

      // Category page (category.html)
      freeDelivery: 'توصيل مجاني للطلبات فوق 5000 جنيه',
      catBack: 'رجوع', catEyebrow: 'المجموعة', catSearchResults: 'نتائج البحث',
      catCuratedCollection: 'مجموعة مختارة', catShopByRoom: 'تسوقي حسب الغرفة',
      catShowingSearch: 'عرض كل ما يطابق بحثك.',
      catLimitedOfferTitle: 'عرض لفترة محدودة', catLimitedOfferDesc: 'قطع مختارة بسعر خاص، لفترة محدودة.',
      catLimitedOfferEyebrow: 'عرض لفترة محدودة',
      products: 'منتج', sortBy: 'ترتيب حسب',
      sortFeatured: 'مميز', sortNewest: 'الأحدث', sortPriceAsc: 'السعر: من الأقل للأعلى', sortPriceDesc: 'السعر: من الأعلى للأقل',
      filtersLabel: 'الفلاتر', sortByLabel: 'ترتيب حسب',
      noProductsFound: 'لا توجد منتجات', noProductsSub: 'جربي تعديل الفلاتر أو اكتشفي مجموعة أخرى.',
      clearFilters: 'مسح الفلاتر', clearAll: 'مسح الكل', showResults: 'عرض النتائج',
      filtersHeading: 'الفلاتر', filterCategory: 'الفئة', filterColor: 'اللون', filterMaterial: 'الخامة',
      filterSize: 'المقاس', filterAvailability: 'التوفر', filterCollection: 'المجموعة', filterPrice: 'السعر',
      moreLabel: '+ المزيد', lessLabel: '– أقل',
      soldOut: 'نفدت الكمية', saleTag: 'تخفيض', newTag: 'جديد', addToBag: 'أضيفي للحقيبة', added: 'تمت الإضافة',
      catFooterAbout: 'أناقة مختارة لكل بيت. قطع خالدة، مُختارة بحب.',
      collectionNewArrivals: 'وصل حديثاً', collectionSale: 'تخفيضات', collectionSummer: 'الصيف', collectionHandPainted: 'مرسوم يدوياً',
      collectionNewArrivalsDesc: 'قطع جديدة ترتقي ببيتك، أُضيفت للمجموعة مؤخراً.',
      collectionSaleDesc: 'قطع جميلة بأسعار خاصة، لفترة محدودة.',
      collectionSummerDesc: 'خفيفة، منعشة ومثالية للموسم.',
      collectionHandPaintedDesc: 'قطع حرفية بطابع مميز، مرسومة يدوياً.',
      allProductsCatName: 'كل المنتجات',
      allProductsCatDesc: 'المجموعة الكاملة — كل قطعة نقدمها، من اللوحات والإضاءة إلى الإكسسوارات والأثاث.'
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

  /* Shared static-text applier — same [data-i18n] / [data-i18n-list] pattern
     refund-return-policy.html introduced, plus two additions used by pages
     added later: [data-i18n-html] for short fragments that legitimately need
     inline markup (e.g. a <br> or <em> inside a heading) and
     [data-i18n-placeholder] for input placeholders. Call once per page,
     after the DOM containing these attributes exists. */
  function applyStaticTranslations(){
    document.querySelectorAll('[data-i18n]').forEach(function(el){
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function(el){
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el){
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    document.querySelectorAll('[data-i18n-list]').forEach(function(el){
      var items = t(el.getAttribute('data-i18n-list'));
      if (Array.isArray(items)) el.innerHTML = items.map(function(s){ return '<li>' + s + '</li>'; }).join('');
    });
  }

  applyDocumentDirection(); // as early as possible — before any chrome/page markup below reads t()

  window.TPR_I18N = { t, getLang, setLang, applyStaticTranslations };
})();
