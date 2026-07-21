// i18n.js — the localization layer (Phase 1: infrastructure only).
//
// One centralized place for every UI string, in English (the default) and
// Arabic. Nothing else in the app hard-codes user-facing copy: modules import
// `t` (and `tn` for count-sensitive strings) and pull their labels from here,
// so adding a language — or fixing a wording — happens in this file alone.
//
// PHASE 1 SCOPE — this is the SAFE infrastructure phase:
//   • The layout is NOT mirrored. `document.dir` stays "ltr" for BOTH languages
//     (RTL / visual mirroring is Phase 2). Only `document.documentElement.lang`
//     and the page <title> follow the active language.
//   • ONLY the app's own chrome is translated — buttons, menus, dialogs,
//     alerts, empty states, errors, labels, navigation, tooltips, settings,
//     page titles. Content that comes from the retailers (product names, store
//     names, prices, units, brochure/OCR text, search results) is left EXACTLY
//     as the source returns it.
//
// Switching language persists the choice in localStorage and reloads: every
// view is then rendered once, from scratch, through this layer — which makes
// the active language effectively constant for a page's lifetime, so `t()` is
// safe to call anywhere (even at module top level) with no stale-DOM risk.

const STORAGE_KEY = 'lsa.lang';
const DEFAULT_LANG = 'en';
const SUPPORTED = ['en', 'ar'];

// --- dictionaries --------------------------------------------------------------
// Keys are namespaced by area. `{name}` style placeholders are filled by t()'s
// second argument. Count-sensitive strings expose `.one` / `.other` variants
// picked by tn(); English needs the split, Arabic keeps a single natural form.
const STRINGS = {
  en: {
    // Language switch
    'lang.toArabic': 'العربية — switch to Arabic',
    'lang.toEnglish': 'Switch to English',

    // App shell / navigation
    'app.skipToContent': 'Skip to content',
    'app.brandHome': 'Super Search home',
    'nav.primary': 'Primary',
    'nav.search': 'Search',
    'nav.browse': 'Browse',
    'nav.brochures': 'Brochures',
    'nav.alerts': 'Alerts',
    'nav.cart': 'Cart',

    // Document titles (per route)
    'title.search': 'Super Search — Live shopping search',
    'title.browse': 'Super Search — Browse the market',
    'title.brochures': 'Super Search — Weekly brochures',
    'title.alerts': 'Super Search — Price alerts',
    'title.cart': 'Super Search — Cart',

    // Search page
    'search.placeholder': 'Search a product…  (e.g. milk, حليب, iphone)',
    'search.inputLabel': 'Product name',
    'search.submit': 'Search',
    'search.storesGroupLabel': 'Sources to search',
    'search.allStores': 'All sources',
    'search.source.brochures': 'Brochures',
    'search.needOneSource': 'Select at least one source to search.',
    'search.searching.one': 'Searching {count} source…',
    'search.searching.other': 'Searching {count} sources…',
    'search.results.one': '{total} result across {sources} for “{q}”',
    'search.results.other': '{total} results across {sources} for “{q}”',
    'search.sourcesInline.one': '{count} source',
    'search.sourcesInline.other': '{count} sources',

    // Home / empty landing
    'home.heroTitle': 'What are you shopping for?',
    'home.heroLead':
      'Live prices across <strong>7 Saudi stores</strong> plus this week’s flyers — searched in one place, in Arabic or English.',
    'home.recentTitle': 'Recent searches',
    'home.historyTitle': 'Price history',
    'home.historyLead':
      'Every flyer product builds price history automatically — search anything to see its lowest recorded price.',

    // Brochures page
    'brochures.title': 'Weekly brochures',
    'brochures.lead': 'Current flyers from Riyadh stores — viewed right here, page by page.',
    'brochures.storeSection': '{store} brochures',
    'brochures.searchStore': 'Search this store',
    'brochures.currentFlyer': 'Current flyer',
    'brochures.currentFlyers': '{count} current flyers',
    'brochures.noCurrent': 'No current flyer',
    'brochures.noneNow': 'No current brochure right now — check back after the weekly refresh.',
    'brochures.noneHeld': 'No brochures held for this store yet.',
    'brochures.badge.expired': 'Expired',
    'brochures.badge.endsToday': 'Ends today',
    'brochures.badge.endsTomorrow': 'Ends tomorrow',
    'brochures.badge.current': 'Current',
    'brochures.weeklyFlyer': '{store} weekly flyer',
    'brochures.officialPage': 'Official offers page ↗',
    'brochures.pdfBrochure': 'PDF brochure',
    'brochures.pages': '{count} pages',

    // Browse (the market floor + listings)
    'browse.title': 'This week’s market',
    'browse.lead': 'Every offer from Riyadh’s supermarkets — browse by department, deal, or craving.',
    'browse.totals': '{offers} offers across {stores} stores this week',
    'browse.loading': 'Walking the market…',
    'browse.unavailable': 'Browse is unavailable right now — try again in a minute.',
    'browse.empty': 'No offers here this week — check another aisle.',
    'browse.departments': 'Departments',
    'browse.brands': 'Brands',
    'browse.allBrands': 'All {count} brands',
    'browse.seeAll': 'See all',
    'browse.back': 'Browse',
    'browse.allAisle': 'All',
    'browse.allStores': 'All stores',
    'browse.loadMore': 'Show more',
    'browse.flyerProduct': 'Flyer product',
    'browse.rail.drops': 'Biggest drops',
    'browse.rail.lowest-ever': 'Lowest ever',
    'browse.sort.discount': 'Biggest discount',
    'browse.sort.price': 'Lowest price',
    'browse.brandStats': '{offers} offers · {stores} stores this week',
    'browse.brandFamilies': 'Inside the brand',
    'browse.badge.lowestEver': 'Lowest in {weeks} wks',
    'browse.badge.rare': 'Rarely discounted',
    'browse.badge.multibuy': 'Multi-buy',
    'browse.badge.endsToday': 'Ends today',
    'browse.badge.endsTomorrow': 'Ends tomorrow',

    // Alerts page + watch dialog
    'alerts.title': 'Price alerts',
    'alerts.lead': 'Set a target price on anything — checked daily across every store and this week’s flyers.',
    'alerts.loading': 'Loading your watches…',
    'alerts.unreachable': 'The alerts service is unreachable right now — try again in a minute.',
    'alerts.watchedTitle': 'Watched prices',
    'alerts.watchCount': '{count} / {max}',
    'alerts.noneWatched': 'Nothing watched yet.',
    'alerts.noneWatchedHint':
      'Search for a product, then use “🔔 Watch price” in the summary — or the bell on any result — to set a target price. The engine checks every store and flyer daily.',
    'alerts.alertsTitle': 'Alerts',
    'alerts.noAlerts': 'No alerts yet — you’ll see one here (and on the badge) the moment a watched price is reached.',
    'alerts.dealFound': '✓ Deal found!',
    'alerts.stillWatching': '● Still watching…',
    'alerts.checkingDaily': 'Checking every store daily…',
    'alerts.atStore': 'at {store}',
    'alerts.flyerSuffix': ' (flyer)',
    'alerts.scopeProduct': '{store} · this product',
    'alerts.scopeAll': 'All stores + flyers',
    'alerts.target': 'target {price}',
    'alerts.checkedAt': 'checked {date}',
    'alerts.firstCheck': 'first check tonight',
    'alerts.stopWatching': 'Stop watching',
    'alerts.stopWatchingItem': 'Stop watching {label}',
    'alerts.deleteAlert': 'Delete alert',
    'alerts.deleteAlertItem': 'Delete alert for {label}',
    'alerts.watchedProduct': 'Watched product',
    'alerts.hit': '{label} hit {price}',
    'alerts.targetWas': 'target was {price}',
    'alerts.flyerVerify': 'Flyer price — verify on the flyer before you go.',
    'alerts.view': 'View ↗',
    'alerts.source.online': 'online store',
    'alerts.source.flyer': 'this week’s flyer',

    // Watch dialog
    'watch.title': 'Watch this price',
    'watch.hintProduct':
      'Checked daily at {store}. You’ll get an alert when this exact product drops to your target.',
    'watch.hintGrocery':
      'Checked daily across every online store and this week’s flyers. You’ll get an alert when a matching product reaches your target.',
    'watch.rowLabel': 'Alert me at or below (SAR)',
    'watch.currentBest': 'Current best: {price}',
    'watch.cancel': 'Cancel',
    'watch.start': 'Start watching',
    'watch.saving': 'Saving…',
    'watch.createError': 'The alerts service is unreachable right now.',

    // Cart page
    'cart.title': 'Cart',
    'cart.lead': 'Products you picked from this week’s brochures — grouped by store, totalled for the till.',
    'cart.empty': 'Your cart is empty',
    'cart.emptyHint': 'Open a brochure and tap any product to add it here.',
    'cart.browse': 'Browse brochures',
    'cart.total': 'Total',
    'cart.toBuy': 'To buy',
    'cart.inTrolley.one': '{count} in the trolley',
    'cart.inTrolley.other': '{count} in the trolley',
    'cart.clear': 'Clear cart',
    'cart.note': 'Flyer prices are machine-extracted from this week’s brochures — the printed flyer prevails at the till.',
    'cart.confirmClear': 'Remove everything from the cart?',
    'cart.flyerProduct': 'Flyer product',
    'cart.viewFlyer': 'View flyer',
    'cart.remove': 'Remove',
    'cart.quantity': 'Quantity',
    'cart.decrease': 'Decrease quantity',
    'cart.increase': 'Increase quantity',
    'cart.flyerExpired': 'Flyer expired',

    // Marketplace (unified results grid + sources strip)
    'market.tapForPrice': 'Tap to see price',
    'market.watchExact': 'Watch this product’s price',
    'market.watchCross': 'Watch this — across every store',
    'market.watchAria': 'Watch the price of {name}',
    'market.flyerUntil': 'flyer · until {date}',
    'market.flyerTag': 'flyer',
    'market.flyerCardTitle': '{name} — flyer price, tap to verify on the flyer',
    'market.weeklyFlyers': 'This week’s flyers',
    'market.allOffers': 'All offers',
    'market.rankBy': 'Rank results by',
    'market.lowestPrice': 'Lowest price',
    'market.bestValue': 'Best value',
    'market.featured': 'Featured',
    'market.sortedValue': 'Best matches • sorted by best value',
    'market.sortedPrice': 'Best matches • cheapest first',
    'market.sortedFeatured': 'Best matches • featured picks first',
    'market.addCart': 'Add to cart',
    'market.addCartAria': 'Add {name} to the cart',
    'market.noneFromStore': 'No matching offers from this store.',
    'market.noneAnywhere': 'No matching offers found in any source.',
    'market.nonePrimary': 'No primary matches. Related products are available below.',
    'market.showFewer': 'Show fewer',
    'market.showAll': 'Show all {count} offers',
    'market.relatedResults': 'Related products ({count})',
    'market.relatedNote': 'These match only part of your query or belong to a different product family.',
    'market.relatedSource': '{count} related products',
    'market.badge.best': 'Best match',
    'market.badge.close': 'Close match',
    'market.badge.related': 'Related',
    'market.state.noMatches': 'no matches',
    'market.state.offers': '{count} offers',
    'market.state.unavailable': 'unavailable',
    'market.state.tempUnavailable': 'temporarily unavailable',
    'market.state.unreachable': 'unreachable',
    'market.hidden.one': '{count} unrelated result hidden',
    'market.hidden.other': '{count} unrelated results hidden',

    // Flyer chip on search results (per store)
    'flyer.chip': '📖 Flyer',
    'flyer.until': '· until {date}',
    'flyer.thisWeek': '· this week',
    'flyer.expired': '· expired {date}',
    'flyer.mayBeOutdated': '· may be outdated',
    'flyer.officialTitle': 'View this store’s official offers page',
    'flyer.viewTitled': '{title} — view this flyer',
    'flyer.view': 'View this flyer',

    // Shopping summary
    'summary.conf.high': 'High confidence · same product compared',
    'summary.conf.medium': 'Medium confidence · compared by unit value',
    'summary.conf.low': 'Low confidence · different sizes/variants',
    'summary.kicker.bestBuy': 'Best buy',
    'summary.kicker.bestValue': 'Best buy · best value per unit',
    'summary.kicker.cheapest': 'Cheapest option',
    'summary.title': 'Shopping summary',
    'summary.atStores': 'at {stores}',
    'summary.flyerBadge': 'this week’s flyer',
    'summary.watch': '🔔 Watch price',
    'summary.watchTitle': 'Get an alert when this drops to your target price',
    'summary.overview.one': '{offers} offer across {stores}',
    'summary.overview.other': '{offers} offers across {stores}',
    'summary.overviewStores.one': '{count} store',
    'summary.overviewStores.other': '{count} stores',
    'summary.fromFlyers': '{count} from this week’s flyers',
    'summary.sharedBy': 'Best price shared by {count} stores',
    'summary.flyerNote': 'Flyer price — read automatically from the flyer image; tap the name to verify on the flyer.',
    'summary.sameElsewhere': 'Same product elsewhere: {others}',
    'summary.lowConfNote': 'Results are different sizes or variants — compare carefully below.',
    'summary.excluded.one': '{count} look-alike set aside',
    'summary.excluded.other': '{count} look-alikes set aside',
    'summary.excl.short.stage': 'weaker match',
    'summary.excl.short.family': 'different category',
    'summary.excl.short.type': 'different type',
    'summary.excl.short.fresh': 'not the fresh product',
    'summary.excl.short.identity': 'different brand/variant',
    'summary.rangeLabel': 'from {range}',
    'summary.addCart': '🛒 Add to cart',
    'summary.addedCart': '✓ Added',
    'summary.addCartTitle': 'Put this pick on your shopping list',
    'summary.secondaryTag': 'Lowest price · if you need less',
    'summary.sameProductTag': 'Same product · {stores} stores',
    'summary.sameProductShow': 'Show every store and price',
    'summary.cheapestTag': 'cheapest',
    'summary.history.badge': 'Price history',
    'summary.history.building': 'History is still building — not enough weeks recorded yet',
    'summary.history.atLow': 'Today’s best matches the lowest ever recorded',
    'summary.history.nearLow': 'Close to the record low (+{delta})',
    'summary.history.aboveLow': 'Above the record low (+{delta})',
    'summary.history.trendDown': '↓ trending down',
    'summary.history.trendUp': '↑ trending up',
    'summary.history.trendSteady': '→ steady',
    'summary.history.lowestSoFar': 'Lowest so far',
    'summary.history.lowestRecorded': 'Lowest recorded',
    'summary.history.recordLow': 'record low',
    'summary.history.lowestSoFarTag': 'lowest so far',
    'summary.history.recordingSince': 'recording since {date}',
    'summary.history.otherSizes': 'Other sizes: ',

    // Brochure viewer + product sheet
    'viewer.loading': 'Loading brochure…',
    'viewer.dialogLabel': '{store} brochure',
    'viewer.close': 'Close brochure',
    'viewer.prev': '‹ Prev',
    'viewer.prevAria': 'Previous page',
    'viewer.next': 'Next ›',
    'viewer.nextAria': 'Next page',
    'viewer.zoomOut': 'Zoom out',
    'viewer.zoomIn': 'Zoom in',
    'viewer.loadFailed': 'Sorry — this brochure could not be loaded.',
    'viewer.pdfTitle': '{store} brochure PDF',
    'viewer.openPdf': 'Open PDF ↗',
    'viewer.pageAlt': '{store} brochure page',
    'viewer.hotspotAria': '{label} — {price}',
    'viewer.flyerProduct': 'flyer product',
    'viewer.stageLabel': 'Brochure pages',
    'viewer.spotsHint.one': '1 product on this page — tap it for price & cart',
    'viewer.spotsHint.other': '{count} products on this page — tap one for price & cart',
    'viewer.navPages': 'Pages',
    'viewer.navPage': 'Page {n}',
    'viewer.navOpenOverview': 'Open page overview',
    'viewer.navAllPages': 'All pages',
    'viewer.navPageCount.one': '{count} page',
    'viewer.navPageCount.other': '{count} pages',
    'viewer.navCloseOverview': 'Close overview',
    'viewer.navGoToPage': 'Go to page {n}',
    'sheet.dialogLabel': 'Product details',
    'sheet.back': 'Back to previous product',
    'sheet.until': 'until {date}',
    'sheet.ended': 'ended {date}',
    'sheet.close': 'Back to brochure',
    'sheet.product': 'Flyer product',
    'sheet.addAgain': 'Add again',
    'sheet.addToCart': 'Add to Cart',
    'sheet.added': 'Added ✓',
    'sheet.note': 'Flyer price, machine-extracted — the printed flyer prevails.',
    'sheet.verify': 'Verify ↗',
    'sheet.similar': 'Similar offers this week',
    'sheet.noSimilar': 'No similar products',
    'sheet.addToList': 'Add to list',
    'sheet.watch': 'Watch',
    'sheet.watchAria': 'Watch this price',
    'sheet.similarBtn': 'Similar',
    'sheet.similarAria': 'Similar products',
    'sheet.brand': 'Brand',
    'sheet.size': 'Size',
    'sheet.priceHistory': 'Price history',
    'sheet.availableElsewhere': 'Available elsewhere',
    'sheet.samePrice': 'same',
    'sheet.fullComparison': 'Full comparison in Search — online + flyers ↗',
    'sheet.cheaperAt': 'This product is cheaper at {store} — {price} this week.',
    'sheet.lowestRecorded': 'Lowest recorded',
    'sheet.atStore': 'at {store}',
    'sheet.thisOffer': 'This offer',
    'sheet.atHistoricalLow': 'at the historical low',
    'sheet.vsLow': '{pct} vs low',
    'sheet.recordedOver': 'Recorded over',
    'sheet.weeks.one': '{count} week',
    'sheet.weeks.other': '{count} weeks',
    'sheet.trendDown': 'down',
    'sheet.trendUp': 'up',
    'sheet.trendSteady': 'steady',
    'insights.lowestPrice': 'This is the lowest recorded price.',
    'insights.trendingDown': 'This price has been trending down.',
    'insights.endsToday': 'This offer ends today.',
    'insights.endsTomorrow': 'This offer ends tomorrow.',
    'insights.bigDrop': 'Big drop — {off}% off the was-price.',
    'insights.historicalLow': 'Historical low: {price}{at}{ago} — current is {pct}% above.',
    'insights.atStore': ' at {store}',
    'insights.weeksAgo.one': ', {count} week ago',
    'insights.weeksAgo.other': ', {count} weeks ago',
  },

  ar: {
    // Language switch
    'lang.toArabic': 'التبديل إلى العربية',
    'lang.toEnglish': 'English — switch to English',

    // App shell / navigation
    'app.skipToContent': 'تخطَّ إلى المحتوى',
    'app.brandHome': 'الصفحة الرئيسية لـ Super Search',
    'nav.primary': 'التنقل الرئيسي',
    'nav.search': 'بحث',
    'nav.browse': 'تصفح',
    'nav.brochures': 'النشرات',
    'nav.alerts': 'التنبيهات',
    'nav.cart': 'السلة',

    // Document titles (per route)
    'title.search': 'Super Search — البحث المباشر عن التسوق',
    'title.browse': 'Super Search — تصفح السوق',
    'title.brochures': 'Super Search — النشرات الأسبوعية',
    'title.alerts': 'Super Search — تنبيهات الأسعار',
    'title.cart': 'Super Search — السلة',

    // Search page
    'search.placeholder': 'ابحث عن منتج…  (مثال: حليب، milk، iphone)',
    'search.inputLabel': 'اسم المنتج',
    'search.submit': 'بحث',
    'search.storesGroupLabel': 'مصادر البحث',
    'search.allStores': 'كل المصادر',
    'search.source.brochures': 'النشرات',
    'search.needOneSource': 'اختر مصدرًا واحدًا على الأقل للبحث.',
    'search.searching.one': 'جارٍ البحث في مصدر واحد…',
    'search.searching.other': 'جارٍ البحث في {count} مصادر…',
    'search.results.one': '{total} نتيجة في {sources} عن «{q}»',
    'search.results.other': '{total} نتيجة في {sources} عن «{q}»',
    'search.sourcesInline.one': 'مصدر واحد',
    'search.sourcesInline.other': '{count} مصادر',

    // Home / empty landing
    'home.heroTitle': 'عن ماذا تبحث؟',
    'home.heroLead':
      'أسعار مباشرة من <strong>7 متاجر سعودية</strong> إضافةً إلى نشرات هذا الأسبوع — في مكان واحد، بالعربية أو الإنجليزية.',
    'home.recentTitle': 'عمليات البحث الأخيرة',
    'home.historyTitle': 'سجل الأسعار',
    'home.historyLead':
      'كل منتج في النشرات يبني سجل أسعاره تلقائيًا — ابحث عن أي شيء لترى أدنى سعر مسجَّل له.',

    // Brochures page
    'brochures.title': 'النشرات الأسبوعية',
    'brochures.lead': 'أحدث نشرات متاجر الرياض — تُعرض هنا مباشرةً، صفحةً صفحة.',
    'brochures.storeSection': 'نشرات {store}',
    'brochures.searchStore': 'ابحث في هذا المتجر',
    'brochures.currentFlyer': 'نشرة حالية',
    'brochures.currentFlyers': '{count} نشرات حالية',
    'brochures.noCurrent': 'لا توجد نشرة حالية',
    'brochures.noneNow': 'لا توجد نشرة حالية الآن — عُد بعد التحديث الأسبوعي.',
    'brochures.noneHeld': 'لا توجد نشرات محفوظة لهذا المتجر بعد.',
    'brochures.badge.expired': 'منتهية',
    'brochures.badge.endsToday': 'تنتهي اليوم',
    'brochures.badge.endsTomorrow': 'تنتهي غدًا',
    'brochures.badge.current': 'حالية',
    'brochures.weeklyFlyer': 'النشرة الأسبوعية لـ {store}',
    'brochures.officialPage': 'صفحة العروض الرسمية ↗',
    'brochures.pdfBrochure': 'نشرة PDF',
    'brochures.pages': '{count} صفحات',

    // Browse (the market floor + listings)
    'browse.title': 'سوق هذا الأسبوع',
    'browse.lead': 'كل عروض سوبرماركتات الرياض — تصفح حسب القسم أو العرض أو ما يخطر ببالك.',
    'browse.totals': '{offers} عرضًا في {stores} متجرًا هذا الأسبوع',
    'browse.loading': 'نتجول في السوق…',
    'browse.unavailable': 'التصفح غير متاح حاليًا — حاول بعد دقيقة.',
    'browse.empty': 'لا عروض هنا هذا الأسبوع — جرّب قسمًا آخر.',
    'browse.departments': 'الأقسام',
    'browse.brands': 'الماركات',
    'browse.allBrands': 'كل الماركات ({count})',
    'browse.seeAll': 'عرض الكل',
    'browse.back': 'تصفح',
    'browse.allAisle': 'الكل',
    'browse.allStores': 'كل المتاجر',
    'browse.loadMore': 'عرض المزيد',
    'browse.flyerProduct': 'منتج من النشرة',
    'browse.rail.drops': 'أكبر التخفيضات',
    'browse.rail.lowest-ever': 'أدنى سعر مسجَّل',
    'browse.sort.discount': 'أكبر خصم',
    'browse.sort.price': 'الأرخص',
    'browse.brandStats': '{offers} عرضًا · {stores} متاجر هذا الأسبوع',
    'browse.brandFamilies': 'داخل الماركة',
    'browse.badge.lowestEver': 'الأدنى خلال {weeks} أسبوعًا',
    'browse.badge.rare': 'نادرًا ما يُخفَّض',
    'browse.badge.multibuy': 'عرض متعدد',
    'browse.badge.endsToday': 'ينتهي اليوم',
    'browse.badge.endsTomorrow': 'ينتهي غدًا',

    // Alerts page + watch dialog
    'alerts.title': 'تنبيهات الأسعار',
    'alerts.lead': 'حدِّد سعرًا مستهدفًا لأي منتج — يُفحص يوميًا عبر كل المتاجر ونشرات هذا الأسبوع.',
    'alerts.loading': 'جارٍ تحميل متابعاتك…',
    'alerts.unreachable': 'خدمة التنبيهات غير متاحة الآن — أعد المحاولة بعد دقيقة.',
    'alerts.watchedTitle': 'الأسعار المتابَعة',
    'alerts.watchCount': '{count} / {max}',
    'alerts.noneWatched': 'لا توجد متابعات بعد.',
    'alerts.noneWatchedHint':
      'ابحث عن منتج، ثم استخدم «🔔 متابعة السعر» في الملخص — أو الجرس على أي نتيجة — لتحديد سعر مستهدف. يفحص المحرك كل متجر ونشرة يوميًا.',
    'alerts.alertsTitle': 'التنبيهات',
    'alerts.noAlerts': 'لا توجد تنبيهات بعد — سيظهر تنبيه هنا (وعلى الشارة) لحظة بلوغ سعر متابَع.',
    'alerts.dealFound': '✓ عثرنا على عرض!',
    'alerts.stillWatching': '● ما زالت المتابعة جارية…',
    'alerts.checkingDaily': 'نفحص كل متجر يوميًا…',
    'alerts.atStore': 'في {store}',
    'alerts.flyerSuffix': ' (نشرة)',
    'alerts.scopeProduct': '{store} · هذا المنتج',
    'alerts.scopeAll': 'كل المتاجر + النشرات',
    'alerts.target': 'المستهدف {price}',
    'alerts.checkedAt': 'فُحص {date}',
    'alerts.firstCheck': 'أول فحص الليلة',
    'alerts.stopWatching': 'إيقاف المتابعة',
    'alerts.stopWatchingItem': 'إيقاف متابعة {label}',
    'alerts.deleteAlert': 'حذف التنبيه',
    'alerts.deleteAlertItem': 'حذف تنبيه {label}',
    'alerts.watchedProduct': 'منتج متابَع',
    'alerts.hit': '{label} بلغ {price}',
    'alerts.targetWas': 'كان المستهدف {price}',
    'alerts.flyerVerify': 'سعر النشرة — تحقق منه على النشرة قبل الذهاب.',
    'alerts.view': 'عرض ↗',
    'alerts.source.online': 'متجر إلكتروني',
    'alerts.source.flyer': 'نشرة هذا الأسبوع',

    // Watch dialog
    'watch.title': 'متابعة هذا السعر',
    'watch.hintProduct':
      'يُفحص يوميًا في {store}. ستصلك تنبيه عندما ينخفض هذا المنتج بالتحديد إلى سعرك المستهدف.',
    'watch.hintGrocery':
      'يُفحص يوميًا عبر كل متجر إلكتروني ونشرات هذا الأسبوع. ستصلك تنبيه عندما يبلغ منتج مطابق سعرك المستهدف.',
    'watch.rowLabel': 'نبّهني عند هذا السعر أو أقل (ريال)',
    'watch.currentBest': 'أفضل سعر حالي: {price}',
    'watch.cancel': 'إلغاء',
    'watch.start': 'ابدأ المتابعة',
    'watch.saving': 'جارٍ الحفظ…',
    'watch.createError': 'خدمة التنبيهات غير متاحة الآن.',

    // Cart page
    'cart.title': 'السلة',
    'cart.lead': 'المنتجات التي اخترتها من نشرات هذا الأسبوع — مجمَّعة حسب المتجر، ومحسوبة الإجمالي للدفع.',
    'cart.empty': 'سلتك فارغة',
    'cart.emptyHint': 'افتح نشرة واضغط أي منتج لإضافته هنا.',
    'cart.browse': 'تصفّح النشرات',
    'cart.total': 'الإجمالي',
    'cart.toBuy': 'للشراء',
    'cart.inTrolley.one': '{count} في العربة',
    'cart.inTrolley.other': '{count} في العربة',
    'cart.clear': 'إفراغ السلة',
    'cart.note': 'أسعار النشرات مُستخرجة آليًا من نشرات هذا الأسبوع — النشرة المطبوعة هي المعتمدة عند الدفع.',
    'cart.confirmClear': 'إزالة كل شيء من السلة؟',
    'cart.flyerProduct': 'منتج من نشرة',
    'cart.viewFlyer': 'عرض النشرة',
    'cart.remove': 'إزالة',
    'cart.quantity': 'الكمية',
    'cart.decrease': 'إنقاص الكمية',
    'cart.increase': 'زيادة الكمية',
    'cart.flyerExpired': 'انتهت النشرة',

    // Marketplace (unified results grid + sources strip)
    'market.tapForPrice': 'اضغط لعرض السعر',
    'market.watchExact': 'متابعة سعر هذا المنتج',
    'market.watchCross': 'تابِع هذا — عبر كل المتاجر',
    'market.watchAria': 'متابعة سعر {name}',
    'market.flyerUntil': 'نشرة · حتى {date}',
    'market.flyerTag': 'نشرة',
    'market.flyerCardTitle': '{name} — سعر النشرة، اضغط للتحقق على النشرة',
    'market.weeklyFlyers': 'نشرات هذا الأسبوع',
    'market.allOffers': 'كل العروض',
    'market.rankBy': 'ترتيب النتائج حسب',
    'market.lowestPrice': 'الأقل سعرًا',
    'market.bestValue': 'الأفضل قيمةً',
    'market.featured': 'المختارة',
    'market.sortedValue': 'أفضل المطابقات • مرتبة حسب أفضل قيمة',
    'market.sortedPrice': 'أفضل المطابقات • الأرخص أولًا',
    'market.sortedFeatured': 'أفضل المطابقات • المختارة أولًا',
    'market.addCart': 'أضف إلى السلة',
    'market.addCartAria': 'أضف {name} إلى السلة',
    'market.noneFromStore': 'لا توجد عروض مطابقة من هذا المتجر.',
    'market.noneAnywhere': 'لا توجد عروض مطابقة في أي مصدر.',
    'market.nonePrimary': 'لا توجد مطابقات أساسية. المنتجات ذات الصلة متاحة أدناه.',
    'market.showFewer': 'عرض أقل',
    'market.showAll': 'عرض كل العروض ({count})',
    'market.relatedResults': 'منتجات ذات صلة ({count})',
    'market.relatedNote': 'هذه المنتجات تطابق جزءًا فقط من البحث أو تنتمي إلى فئة منتج مختلفة.',
    'market.relatedSource': '{count} منتجات ذات صلة',
    'market.badge.best': 'أفضل مطابقة',
    'market.badge.close': 'مطابقة قريبة',
    'market.badge.related': 'ذات صلة',
    'market.state.noMatches': 'لا مطابقات',
    'market.state.offers': '{count} عروض',
    'market.state.unavailable': 'غير متاح',
    'market.state.tempUnavailable': 'غير متاح مؤقتًا',
    'market.state.unreachable': 'تعذّر الوصول',
    'market.hidden.one': 'إخفاء نتيجة غير ذات صلة',
    'market.hidden.other': 'إخفاء {count} نتائج غير ذات صلة',

    // Flyer chip on search results (per store)
    'flyer.chip': '📖 نشرة',
    'flyer.until': '· حتى {date}',
    'flyer.thisWeek': '· هذا الأسبوع',
    'flyer.expired': '· انتهت {date}',
    'flyer.mayBeOutdated': '· قد تكون قديمة',
    'flyer.officialTitle': 'عرض صفحة العروض الرسمية لهذا المتجر',
    'flyer.viewTitled': '{title} — عرض هذه النشرة',
    'flyer.view': 'عرض هذه النشرة',

    // Shopping summary
    'summary.conf.high': 'ثقة عالية · قورن المنتج نفسه',
    'summary.conf.medium': 'ثقة متوسطة · قورن حسب قيمة الوحدة',
    'summary.conf.low': 'ثقة منخفضة · أحجام/أصناف مختلفة',
    'summary.kicker.bestBuy': 'أفضل شراء',
    'summary.kicker.bestValue': 'أفضل شراء · أفضل قيمة للوحدة',
    'summary.kicker.cheapest': 'الخيار الأرخص',
    'summary.title': 'ملخص التسوق',
    'summary.atStores': 'في {stores}',
    'summary.flyerBadge': 'نشرة هذا الأسبوع',
    'summary.watch': '🔔 متابعة السعر',
    'summary.watchTitle': 'احصل على تنبيه عندما ينخفض هذا إلى سعرك المستهدف',
    'summary.overview.one': '{offers} عرض في {stores}',
    'summary.overview.other': '{offers} عروض في {stores}',
    'summary.overviewStores.one': 'متجر واحد',
    'summary.overviewStores.other': '{count} متاجر',
    'summary.fromFlyers': '{count} من نشرات هذا الأسبوع',
    'summary.sharedBy': 'أفضل سعر مشترك بين {count} متاجر',
    'summary.flyerNote': 'سعر النشرة — قُرئ آليًا من صورة النشرة؛ اضغط الاسم للتحقق على النشرة.',
    'summary.sameElsewhere': 'المنتج نفسه في أماكن أخرى: {others}',
    'summary.lowConfNote': 'النتائج بأحجام أو أصناف مختلفة — قارن بعناية أدناه.',
    'summary.excluded.one': 'استُبعد منتج شبيه واحد',
    'summary.excluded.other': 'استُبعدت {count} منتجات شبيهة',
    'summary.excl.short.stage': 'مطابقة أضعف',
    'summary.excl.short.family': 'فئة مختلفة',
    'summary.excl.short.type': 'نوع مختلف',
    'summary.excl.short.fresh': 'ليس المنتج الطازج',
    'summary.excl.short.identity': 'علامة/صنف مختلف',
    'summary.rangeLabel': 'من {range}',
    'summary.addCart': '🛒 أضف إلى السلة',
    'summary.addedCart': '✓ أُضيف',
    'summary.addCartTitle': 'أضف هذا الاختيار إلى قائمة تسوقك',
    'summary.secondaryTag': 'الأقل سعرًا · إذا احتجت كميةً أقل',
    'summary.sameProductTag': 'المنتج نفسه · {stores} متاجر',
    'summary.sameProductShow': 'عرض كل المتاجر والأسعار',
    'summary.cheapestTag': 'الأرخص',
    'summary.history.badge': 'سجل الأسعار',
    'summary.history.building': 'السجل ما زال يُبنى — لم تُسجَّل أسابيع كافية بعد',
    'summary.history.atLow': 'أفضل سعر اليوم يطابق أدنى سعر مسجَّل على الإطلاق',
    'summary.history.nearLow': 'قريب من أدنى سعر قياسي (+{delta})',
    'summary.history.aboveLow': 'أعلى من أدنى سعر قياسي (+{delta})',
    'summary.history.trendDown': '↓ في انخفاض',
    'summary.history.trendUp': '↑ في ارتفاع',
    'summary.history.trendSteady': '→ مستقر',
    'summary.history.lowestSoFar': 'الأدنى حتى الآن',
    'summary.history.lowestRecorded': 'الأدنى المسجَّل',
    'summary.history.recordLow': 'سعر قياسي',
    'summary.history.lowestSoFarTag': 'الأدنى حتى الآن',
    'summary.history.recordingSince': 'التسجيل منذ {date}',
    'summary.history.otherSizes': 'أحجام أخرى: ',

    // Brochure viewer + product sheet
    'viewer.loading': 'جارٍ تحميل النشرة…',
    'viewer.dialogLabel': 'نشرة {store}',
    'viewer.close': 'إغلاق النشرة',
    'viewer.prev': '‹ السابق',
    'viewer.prevAria': 'الصفحة السابقة',
    'viewer.next': 'التالي ›',
    'viewer.nextAria': 'الصفحة التالية',
    'viewer.zoomOut': 'تصغير',
    'viewer.zoomIn': 'تكبير',
    'viewer.loadFailed': 'عذرًا — تعذّر تحميل هذه النشرة.',
    'viewer.pdfTitle': 'نشرة {store} بصيغة PDF',
    'viewer.openPdf': 'فتح PDF ↗',
    'viewer.pageAlt': 'صفحة نشرة {store}',
    'viewer.hotspotAria': '{label} — {price}',
    'viewer.flyerProduct': 'منتج من نشرة',
    'viewer.stageLabel': 'صفحات النشرة',
    'viewer.spotsHint.one': 'منتج واحد في هذه الصفحة — اضغط عليه للسعر والسلة',
    'viewer.spotsHint.other': '{count} منتجات في هذه الصفحة — اضغط أحدها للسعر والسلة',
    'viewer.navPages': 'الصفحات',
    'viewer.navPage': 'صفحة {n}',
    'viewer.navOpenOverview': 'فتح نظرة عامة على الصفحات',
    'viewer.navAllPages': 'كل الصفحات',
    'viewer.navPageCount.one': 'صفحة واحدة',
    'viewer.navPageCount.other': '{count} صفحات',
    'viewer.navCloseOverview': 'إغلاق النظرة العامة',
    'viewer.navGoToPage': 'الذهاب إلى صفحة {n}',
    'sheet.dialogLabel': 'تفاصيل المنتج',
    'sheet.back': 'العودة إلى المنتج السابق',
    'sheet.until': 'حتى {date}',
    'sheet.ended': 'انتهى {date}',
    'sheet.close': 'العودة إلى النشرة',
    'sheet.product': 'منتج من نشرة',
    'sheet.addAgain': 'أضف مرة أخرى',
    'sheet.addToCart': 'أضف إلى السلة',
    'sheet.added': 'أُضيف ✓',
    'sheet.note': 'سعر النشرة، مُستخرج آليًا — النشرة المطبوعة هي المعتمدة.',
    'sheet.verify': 'تحقّق ↗',
    'sheet.similar': 'عروض مشابهة هذا الأسبوع',
    'sheet.noSimilar': 'لا توجد منتجات مشابهة',
    'sheet.addToList': 'أضف إلى القائمة',
    'sheet.watch': 'متابعة',
    'sheet.watchAria': 'متابعة هذا السعر',
    'sheet.similarBtn': 'مشابهة',
    'sheet.similarAria': 'منتجات مشابهة',
    'sheet.brand': 'الماركة',
    'sheet.size': 'الحجم',
    'sheet.priceHistory': 'سجل الأسعار',
    'sheet.availableElsewhere': 'متوفر في مكان آخر',
    'sheet.samePrice': 'نفسه',
    'sheet.fullComparison': 'المقارنة الكاملة في البحث — الإنترنت + النشرات ↗',
    'sheet.cheaperAt': 'هذا المنتج أرخص في {store} — {price} هذا الأسبوع.',
    'sheet.lowestRecorded': 'أدنى سعر مسجّل',
    'sheet.atStore': 'في {store}',
    'sheet.thisOffer': 'هذا العرض',
    'sheet.atHistoricalLow': 'عند أدنى مستوى تاريخي',
    'sheet.vsLow': '{pct} مقارنةً بالأدنى',
    'sheet.recordedOver': 'مُسجّل على مدى',
    'sheet.weeks.one': 'أسبوع واحد',
    'sheet.weeks.other': '{count} أسابيع',
    'sheet.trendDown': 'هابط',
    'sheet.trendUp': 'صاعد',
    'sheet.trendSteady': 'مستقر',
    'insights.lowestPrice': 'هذا أدنى سعر مسجّل.',
    'insights.trendingDown': 'هذا السعر في اتجاه هابط.',
    'insights.endsToday': 'ينتهي هذا العرض اليوم.',
    'insights.endsTomorrow': 'ينتهي هذا العرض غدًا.',
    'insights.bigDrop': 'انخفاض كبير — {off}% عن السعر السابق.',
    'insights.historicalLow': 'أدنى سعر تاريخي: {price}{at}{ago} — الحالي أعلى بنسبة {pct}%.',
    'insights.atStore': ' في {store}',
    'insights.weeksAgo.one': '، قبل أسبوع واحد',
    'insights.weeksAgo.other': '، قبل {count} أسابيع',
  },
};

// --- active language -----------------------------------------------------------
function readLang() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED.includes(v) ? v : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

// Resolved once at module load. Changing language persists + reloads, so this
// stays correct for the whole lifetime of the page.
let current = readLang();

export function getLang() {
  return current;
}

// Fill `{placeholder}` tokens from `params`.
function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
}

// Translate `key`. Missing translations fall back to English, then to the key
// itself — a missing string never blanks the UI or throws.
export function t(key, params) {
  const table = STRINGS[current] || STRINGS.en;
  let str = table[key];
  if (str == null) str = STRINGS.en[key];
  if (str == null) str = key;
  return interpolate(str, params);
}

// Count-sensitive translate: picks `${key}.one` when count === 1, else
// `${key}.other`, and always exposes `count` to the template. Falls back to the
// bare key if no variant exists.
export function tn(key, count, params = {}) {
  const merged = { ...params, count };
  const variant = count === 1 ? `${key}.one` : `${key}.other`;
  const table = STRINGS[current] || STRINGS.en;
  if (table[variant] != null || STRINGS.en[variant] != null) return t(variant, merged);
  return t(key, merged);
}

// Persist the choice and reload so every view re-renders through this layer.
export function setLang(lang) {
  if (!SUPPORTED.includes(lang) || lang === current) return;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage blocked — the reload below still applies the in-memory choice */
  }
  current = lang;
  location.reload();
}

export function toggleLang() {
  setLang(current === 'ar' ? 'en' : 'ar');
}

// --- boot-time DOM wiring ------------------------------------------------------
// Apply language metadata and translate the static shell markup. PHASE 1: dir
// stays "ltr" for both languages — no mirroring yet.
export function applyI18n() {
  const html = document.documentElement;
  html.lang = current;
  html.dir = 'ltr';

  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.getAttribute('data-i18n'));
  }
  // Strings that legitimately carry inline markup (e.g. a <strong> emphasis).
  for (const el of document.querySelectorAll('[data-i18n-html]')) {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  }
  // Attribute translations: data-i18n-attr="placeholder:key; aria-label:key2".
  for (const el of document.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.getAttribute('data-i18n-attr').split(';')) {
      const [attr, key] = pair.split(':').map((s) => s && s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
}

// Wire the premium language-switch chip beside the logo. It shows the OTHER
// language's short code (AR while the UI is English, EN while Arabic) so one
// tap is an obvious swap.
export function initLangSwitch() {
  const btn = document.getElementById('lang-switch');
  if (!btn) return;
  btn.textContent = current === 'ar' ? 'EN' : 'AR';
  const label = t(current === 'ar' ? 'lang.toEnglish' : 'lang.toArabic');
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.addEventListener('click', () => toggleLang());
}
