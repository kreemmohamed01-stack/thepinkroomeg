/* ============================================================
   THE PINK ROOM — shared chrome controller
   Injects the navbar, menu drawer, cart drawer, search drawer and
   bottom tabbar into any page that includes it, so every page
   behaves identically. Cart lives in localStorage and is shared
   across the whole site.
   Requires: i18n.js (window.TPR_I18N — must be loaded first),
   catalog.js, shared-ui.css
   ============================================================ */
(function(){
  const { t } = window.TPR_I18N;

  const WA = 'https://wa.me/201207803666';
  const IG = 'https://www.instagram.com/thepinkroom_eg?igsh=dnZrbW9xazV2dGp5';
  const MAP = 'https://maps.app.goo.gl/s7NcLQyFgrmkZEms6?g_st=ac';
  const CART_KEY = 'tpr_cart_v1';
  const WISH_KEY = 'tpr_wishlist_v1';

  const ICONS = {
    menu:  '<svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    search:'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    bag:   '<svg viewBox="0 0 24 24"><path d="M6.5 8h11l.9 12.1a2 2 0 0 1-2 2.15H7.6a2 2 0 0 1-2-2.15L6.5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    home:  '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>',
    grid:  '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><circle cx="8" cy="16" r="3"/><circle cx="16" cy="16" r="3"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    back:  '<svg viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    x:     '<svg viewBox="0 0 24 24"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
    mail:  '<svg viewBox="0 0 24 24"><path d="M3 6h18v12H3z"/><path d="m3 7 9 6 9-6"/></svg>',
    pin:   '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>',
    insta: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>',
    wa:    '<svg viewBox="0 0 32 32" fill="#fff" stroke="none"><path d="M16.004 3C9.06 3 3.43 8.62 3.43 15.56c0 2.45.68 4.73 1.86 6.68L3 29l6.94-2.24a12.5 12.5 0 0 0 6.06 1.55h.005c6.94 0 12.57-5.62 12.57-12.56C28.58 8.8 22.95 3 16.004 3Zm0 22.9h-.004a10.4 10.4 0 0 1-5.3-1.45l-.38-.22-4.12 1.33 1.35-4.02-.25-.41a10.35 10.35 0 0 1-1.6-5.53c0-5.75 4.68-10.42 10.44-10.42 2.79 0 5.4 1.09 7.37 3.06a10.34 10.34 0 0 1 3.05 7.36c0 5.75-4.68 10.3-10.53 10.3Zm5.72-7.72c-.31-.16-1.87-.92-2.16-1.03-.29-.1-.5-.16-.72.16-.21.31-.83 1.03-1.02 1.25-.19.21-.38.24-.7.08-.31-.16-1.32-.49-2.51-1.56-.93-.83-1.56-1.85-1.74-2.17-.18-.31-.02-.48.14-.64.14-.14.31-.37.47-.55.16-.19.21-.31.31-.52.1-.21.05-.4-.03-.55-.08-.16-.72-1.75-.99-2.39-.26-.63-.53-.54-.72-.55-.19-.01-.4-.01-.61-.01-.21 0-.55.08-.84.4-.29.31-1.1 1.08-1.1 2.63 0 1.55 1.13 3.05 1.29 3.26.16.21 2.22 3.42 5.39 4.79.75.32 1.34.52 1.8.66.76.24 1.44.21 1.99.13.61-.09 1.87-.76 2.13-1.5.26-.73.26-1.36.18-1.5-.08-.13-.28-.21-.6-.36Z"/></svg>'
  };

  const LOGO_MARK = `<img src="logo-beige.png" alt="The Pink Room">`;

  /* ---------- cart storage (shared across pages) ---------- */
  function loadCart(){
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch(e){ return []; }
  }
  function saveCart(c){
    try { localStorage.setItem(CART_KEY, JSON.stringify(c)); } catch(e){}
  }
  let cart = loadCart();

  /* ---------- wishlist storage (shared across pages) ---------- */
  function loadWish(){
    try { return JSON.parse(localStorage.getItem(WISH_KEY)) || []; }
    catch(e){ return []; }
  }
  function saveWish(w){
    try { localStorage.setItem(WISH_KEY, JSON.stringify(w)); } catch(e){}
  }
  let wishlist = loadWish();

  const money = n => 'EGP ' + Number(n).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});

  /* ---------- markup ---------- */
  function navMarkup(){
    return `
    <header class="tpr-nav">
      <div class="tpr-side">
        <button class="tpr-icon" id="tprMenuBtn" aria-label="Menu">${ICONS.menu}</button>
        <nav class="tpr-desknav">
          <a href="category.html?cat=all">${t('shopAll')}</a>
          <a href="category.html?cat=paintings">${t('paintings')}</a>
          <a href="category.html?cat=lighting">${t('lighting')}</a>
          <a href="category.html?cat=furniture">${t('furniture')}</a>
        </nav>
      </div>
      <a class="tpr-logo" href="index.html" aria-label="The Pink Room">${LOGO_MARK}</a>
      <div class="tpr-side">
        <button class="tpr-icon" id="tprSearchBtn" aria-label="Search">${ICONS.search}</button>
        <a class="tpr-icon" href="wishlist.html" aria-label="Wishlist">${ICONS.heart}<span class="tpr-badge" id="tprWishBadge">0</span></a>
        <button class="tpr-icon" id="tprCartBtn" aria-label="Cart">${ICONS.bag}<span class="tpr-badge" id="tprCartBadge">0</span></button>
      </div>
    </header>`;
  }

  function chromeMarkup(drawersOnly){
    const roomLinks = (typeof ROOMS !== 'undefined' ? Object.keys(ROOMS) : [])
      .map(k => `<a href="category.html?room=${k}">${ROOMS[k].name}</a>`).join('');

    const tabbar = drawersOnly ? '' : `
    <nav class="tpr-tabbar">
      <a href="index.html">${ICONS.home}${t('tabHome')}</a>
      <a href="category.html?cat=all" id="tprTabShop">${ICONS.grid}${t('tabShop')}</a>
      <button id="tprTabSearch">${ICONS.search}${t('tabSearch')}</button>
      <a href="wishlist.html">${ICONS.heart}${t('tabWishlist')}<span class="tpr-tab-badge" id="tprWishBadgeTab">0</span></a>
      <button id="tprTabCart">${ICONS.bag}${t('tabCart')}<span class="tpr-tab-badge" id="tprCartBadgeTab">0</span></button>
    </nav>`;

    return `
    <div class="tpr-overlay" id="tprOverlay"></div>

    <aside class="tpr-menu" id="tprMenu">
      <div class="tpr-menu-head">
        <div class="tpr-menu-logo"><img src="logo-sidebar.jpeg" alt="The Pink Room"></div>
        <button class="tpr-close" id="tprMenuClose" aria-label="Close">&times;</button>
      </div>
      <nav class="tpr-menu-nav">
        <a href="index.html">${t('home')}</a>
        <a href="category.html?cat=all">${t('shopAll')}</a>
        <a href="category.html?cat=paintings">${t('paintings')}</a>
        <a href="category.html?cat=accessories">${t('accessories')}</a>
        <a href="category.html?cat=lighting">${t('lighting')}</a>
        <a href="category.html?cat=furniture">${t('furniture')}</a>
        <a href="category.html?cat=wall-art">${t('wallArt')}</a>
        <a href="category.html?cat=plants">${t('plants')}</a>
        <a href="category.html?cat=sale-offers">${t('sale')}</a>
        <a href="${WA}" target="_blank" rel="noopener" id="tprMenuContact">${t('contact')}</a>
      </nav>
      <p class="tpr-menu-label">${t('shopByRoom')}</p>
      <div class="tpr-menu-rooms">${roomLinks}</div>

      <div class="tpr-prefs">
        <div class="tpr-pref">
          <span>${t('currency')}</span>
          <div class="tpr-dd" id="tprCurrencyDd">
            <span id="tprCurrencyLabel">EGP</span>
            <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            <ul class="tpr-dd-menu">
              <li class="selected" data-val="EGP">EGP</li>
              <li data-val="USD">USD</li>
              <li data-val="EUR">EUR</li>
            </ul>
          </div>
        </div>
        <div class="tpr-pref">
          <span>${t('language')}</span>
          <div class="tpr-dd" id="tprLangDd">
            <span id="tprLangLabel">${window.TPR_I18N.getLang() === 'ar' ? 'AR' : 'EN'}</span>
            <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            <ul class="tpr-dd-menu">
              <li class="${window.TPR_I18N.getLang() === 'en' ? 'selected' : ''}" data-val="EN">English</li>
              <li class="${window.TPR_I18N.getLang() === 'ar' ? 'selected' : ''}" data-val="AR">العربية</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="tpr-menu-foot">
        <a href="${IG}" target="_blank" rel="noopener" class="tpr-social" aria-label="Instagram" id="tprSocialIG">${ICONS.insta}</a>
        <a href="${MAP}" target="_blank" rel="noopener" class="tpr-social" aria-label="Google Maps" id="tprSocialMap">${ICONS.pin}</a>
        <a href="${WA}" target="_blank" rel="noopener" class="tpr-social" aria-label="WhatsApp" id="tprSocialWA">${ICONS.wa}</a>
      </div>
    </aside>

    <aside class="tpr-drawer" id="tprCart" aria-label="Shopping bag">
      <div class="tpr-drawer-head">
        <div>
          <p class="tpr-eyebrow">${t('yourBag')}</p>
          <h2 class="tpr-drawer-title">${t('shoppingBag')} <span class="count" id="tprCartCount">(0)</span></h2>
        </div>
        <button class="tpr-close-light" id="tprCartClose" aria-label="Close">&times;</button>
      </div>
      <div class="tpr-rule"></div>
      <div class="tpr-cart-items" id="tprCartItems"></div>
      <div class="tpr-empty" id="tprCartEmpty">
        ${ICONS.bag}
        <p class="tpr-empty-title">${t('yourBag')}</p>
        <p class="tpr-empty-sub">${t('bagEmptySub')}</p>
        <a href="category.html?cat=all" class="tpr-btn">${t('exploreProducts')} ${ICONS.arrow}</a>
      </div>
      <div class="tpr-summary" id="tprCartSummary">
        <div class="tpr-rule"></div>
        <div class="tpr-subtotal"><span>${t('subtotal')}</span><span id="tprSubtotal">EGP 0.00</span></div>
        <button class="tpr-checkout" id="tprCheckout"><span>${t('checkout')}</span> ${ICONS.arrow}</button>
        <p class="tpr-tax">${t('taxNote')}</p>
        <p class="tpr-policy">${t('policyPrefix')} <a href="#">${t('termsConditions')}</a> ${t('policyAnd')} <a href="refund-return-policy.html">${t('refundPolicy')}</a>.</p>
        <a href="category.html?cat=all" class="tpr-continue">${t('continueShopping')} ${ICONS.arrow}</a>
      </div>
    </aside>

    <aside class="tpr-drawer" id="tprSearch" aria-label="Search">
      <div class="tpr-drawer-head">
        <div>
          <p class="tpr-eyebrow">${t('search')}</p>
          <h2 class="tpr-drawer-title" style="font-style:italic">${t('findSomethingBeautiful')}</h2>
        </div>
        <button class="tpr-close-light" id="tprSearchClose" aria-label="Close">&times;</button>
      </div>
      <div class="tpr-search-input">
        ${ICONS.search}
        <input type="text" id="tprSearchInput" placeholder="${t('searchPlaceholder')}" autocomplete="off">
        <button class="tpr-search-clear" id="tprSearchClear" aria-label="Clear">&times;</button>
      </div>
      <div class="tpr-search-body">
        <div id="tprSearchDefault">
          <p class="tpr-section-label">${t('popularSearches')}</p>
          <div class="tpr-pills">
            <a href="#" data-term="Vase">${t('pillVases')}</a>
            <a href="#" data-term="Lamp">${t('pillLighting')}</a>
            <a href="#" data-term="Table">${t('pillTables')}</a>
            <a href="#" data-term="Candle">${t('pillCandles')}</a>
            <a href="#" data-term="Marble">${t('pillMarble')}</a>
            <a href="#" data-term="Sale">${t('pillSale')}</a>
          </div>
          <p class="tpr-section-label">${t('exploreTheEdit')}</p>
          <div class="tpr-edit-grid" id="tprEditGrid"></div>
        </div>
        <div id="tprSearchResults" class="tpr-hidden">
          <p class="tpr-section-label" id="tprResultsLabel">${t('results')}</p>
          <div id="tprResultsList"></div>
          <a href="category.html?cat=all" class="tpr-viewall" id="tprViewAll">${t('viewAllResults')} ${ICONS.arrow}</a>
        </div>
        <div id="tprSearchEmpty" class="tpr-empty" style="padding-top:40px">
          <p class="tpr-empty-title">${t('nothingFound')}</p>
          <p class="tpr-empty-sub">${t('nothingFoundSub')}</p>
          <p style="font-size:13px;color:var(--ink-soft);margin-bottom:24px">${t('trySearching')}</p>
          <a href="category.html?cat=all" class="tpr-btn">${t('exploreAllProducts')} ${ICONS.arrow}</a>
        </div>
      </div>
    </aside>

    ${tabbar}`;
  }

  /* ---------- mount ---------- */
  const navHost = document.querySelector('[data-tpr-nav]');
  if (navHost) navHost.outerHTML = navMarkup();

  // The homepage keeps its own hero navbar and has no bottom tabbar —
  // it opts out with <body data-tpr-chrome="drawers-only">.
  const drawersOnly = document.body.dataset.tprChrome === 'drawers-only';
  document.body.insertAdjacentHTML('beforeend', chromeMarkup(drawersOnly));
  if (!drawersOnly) document.body.classList.add('tpr-has-tabbar');

  const $ = id => document.getElementById(id);
  const overlay = $('tprOverlay');
  const menu    = $('tprMenu');
  const cartEl  = $('tprCart');
  const searchEl= $('tprSearch');

  /* ---------- open/close ---------- */
  function closeAll(){
    [menu, cartEl, searchEl].forEach(el => el.classList.remove('open'));
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
  function open(el){
    closeAll();
    el.classList.add('open');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };

  overlay.addEventListener('click', closeAll);
  // these three only exist when the shared navbar is injected (i.e. not on the homepage)
  on('tprMenuBtn',   'click', ()=> open(menu));
  on('tprCartBtn',   'click', ()=> { renderCart(); open(cartEl); });
  on('tprSearchBtn', 'click', ()=> { open(searchEl); setTimeout(()=> $('tprSearchInput').focus(), 350); });
  on('tprMenuClose',   'click', closeAll);
  on('tprCartClose',   'click', closeAll);
  on('tprSearchClose', 'click', closeAll);
  on('tprTabCart',   'click', ()=> { renderCart(); open(cartEl); });
  on('tprTabSearch', 'click', ()=> { open(searchEl); setTimeout(()=> $('tprSearchInput').focus(), 350); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

  /* ---------- currency / language ---------- */
  function setupDropdown(ddId, labelId, onSelect){
    const dd = $(ddId); if (!dd) return;
    const label = $(labelId);
    dd.addEventListener('click', e => {
      e.stopPropagation();
      document.querySelectorAll('.tpr-dd.open').forEach(o => { if (o !== dd) o.classList.remove('open'); });
      dd.classList.toggle('open');
    });
    dd.querySelectorAll('.tpr-dd-menu li').forEach(li => {
      li.addEventListener('click', e => {
        e.stopPropagation();
        dd.querySelectorAll('.tpr-dd-menu li').forEach(x => x.classList.remove('selected'));
        li.classList.add('selected');
        label.textContent = li.dataset.val;
        dd.classList.remove('open');
        if (onSelect) onSelect(li.dataset.val);
      });
    });
  }
  setupDropdown('tprCurrencyDd', 'tprCurrencyLabel');
  // language actually switches the site (reloads with the new language
  // applied) — everything else here is cosmetic-only (currency has no
  // real effect yet), this one really does something on selection
  setupDropdown('tprLangDd', 'tprLangLabel', (val) => {
    const wanted = val === 'AR' ? 'ar' : 'en';
    if (wanted !== window.TPR_I18N.getLang()) window.TPR_I18N.setLang(wanted);
  });
  document.addEventListener('click', ()=> {
    document.querySelectorAll('.tpr-dd.open').forEach(o => o.classList.remove('open'));
  });

  /* ---------- cart ---------- */
  function badge(id, n){
    const el = $(id); if(!el) return;
    el.textContent = n;
    el.classList.add('pulse');
    setTimeout(()=> el.classList.remove('pulse'), 500);
  }

  function renderCart(){
    const qty = cart.reduce((s,i)=> s + i.qty, 0);
    badge('tprCartBadge', qty);
    badge('tprCartBadgeTab', qty);
    badge('tprCartBadgeHero', qty); // homepage keeps its own hero navbar
    $('tprCartCount').textContent = '(' + qty + ')';

    const list = $('tprCartItems');
    const empty = $('tprCartEmpty');
    const summary = $('tprCartSummary');

    if (!cart.length){
      list.innerHTML = '';
      empty.classList.add('show');
      summary.style.display = 'none';
      return;
    }
    empty.classList.remove('show');
    summary.style.display = '';

    let subtotal = 0;
    list.innerHTML = cart.map((item, i) => {
      subtotal += item.price * item.qty;
      return `<div class="tpr-cart-item" data-id="${item.id}" style="animation-delay:${i*0.06}s">
        <div class="tpr-cart-img"><img src="${item.img}" alt="${item.name}"></div>
        <div class="tpr-cart-info">
          <h4 class="tpr-cart-name">${item.name}</h4>
          <p class="tpr-cart-variant">${item.variant || ''}</p>
          <div class="tpr-cart-bottom">
            <div class="tpr-qty">
              <button class="minus" aria-label="Decrease">&minus;</button>
              <span class="val">${item.qty}</span>
              <button class="plus" aria-label="Increase">+</button>
            </div>
            <span class="tpr-cart-price">${money(item.price * item.qty)}</span>
          </div>
        </div>
        <button class="tpr-cart-remove" aria-label="Remove">${ICONS.x}</button>
      </div>`;
    }).join('');

    $('tprSubtotal').textContent = money(subtotal);
    saveCart(cart);
  }

  $('tprCartItems').addEventListener('click', e => {
    const row = e.target.closest('.tpr-cart-item'); if(!row) return;
    const id = row.dataset.id;
    const item = cart.find(i => String(i.id) === String(id)); if(!item) return;

    if (e.target.closest('.plus')){
      item.qty++; renderCart();
      const v = document.querySelector(`.tpr-cart-item[data-id="${id}"] .val`);
      if (v){ v.classList.add('bump'); setTimeout(()=> v.classList.remove('bump'), 300); }
    } else if (e.target.closest('.minus')){
      item.qty = Math.max(1, item.qty - 1); renderCart();
    } else if (e.target.closest('.tpr-cart-remove')){
      cart = cart.filter(i => String(i.id) !== String(id)); renderCart();
    }
  });

  $('tprCheckout').addEventListener('click', ()=> {
    if (!cart.length) return; // button is hidden with an empty bag, but guard anyway
    location.href = 'checkout.html?step=information';
  });

  /* ---------- wishlist ---------- */
  function renderWishBadge(){
    badge('tprWishBadge', wishlist.length);
    badge('tprWishBadgeTab', wishlist.length);
  }

  /* public API so pages can add to bag / manage the wishlist */
  window.TPR = {
    addToCart(product){
      const existing = cart.find(i => String(i.id) === String(product.id));
      if (existing) existing.qty++;
      else cart.push({
        id: product.id,
        name: product.name,
        variant: product.subcategoryName || product.categoryName || '',
        price: product.salePrice || product.price,
        img: (product.images && product.images[0]) || product.img,
        qty: 1
      });
      if (window.TPRAnalytics){
        window.TPRAnalytics.trackEvent('add_to_cart', {
          productId: product.id, productName: product.name,
          category: product.category, categoryName: product.categoryName
        });
      }
      renderCart();
      open(cartEl);
    },
    openCart(){ renderCart(); open(cartEl); },
    openSearch(){ open(searchEl); setTimeout(()=> $('tprSearchInput').focus(), 350); },
    openMenu(){ open(menu); },
    closeAll,
    setWishCount(n){ badge('tprWishBadge', n); badge('tprWishBadgeTab', n); },
    /* returns the id's new liked state (true = now saved, false = now removed) */
    toggleWishlist(id){
      id = String(id);
      const i = wishlist.indexOf(id);
      const liked = i === -1;
      if (liked) wishlist.push(id); else wishlist.splice(i, 1);
      saveWish(wishlist);
      renderWishBadge();
      return liked;
    },
    isWished(id){ return wishlist.includes(String(id)); },
    getWishlist(){ return wishlist.slice(); }
  };

  /* ---------- search ----------
     `catalogue` is the same array object as PRODUCTS (never reassigned,
     only mutated in place by catalog.js's fetch), so anything below that
     reads it lazily — like runSearch() — just works once the fetch
     lands. The "Explore the Edit" picks are the exception: they're
     computed once up front, so that specific bit has to wait. */
  const catalogue = (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []);

  if (typeof PRODUCTS_READY !== 'undefined') {
    PRODUCTS_READY.then(()=>{
      const editPicks = [catalogue[0], catalogue[10], catalogue[18]].filter(Boolean);
      $('tprEditGrid').innerHTML = editPicks.map(p => `
        <a class="tpr-edit-card" href="product.html?slug=${p.slug}">
          <div class="tpr-edit-card-img"><img src="${(p.images&&p.images[0])||'logo-beige.png'}" alt="${p.name}"></div>
          <span>${p.name}</span>
        </a>`).join('');
    });
  }

  /* ---------- store contact/social links — dashboard-editable (Store
     Settings page). WA/IG/MAP above are the launch defaults; once
     SITE_STRUCTURE_READY resolves, patch the few DOM spots that were
     already built from them rather than re-injecting the whole chrome
     (avoids double-binding the click listeners wired elsewhere in this
     file). Every page gets this since shared-ui.js runs on all of them. */
  if (typeof SITE_STRUCTURE_READY !== 'undefined') {
    SITE_STRUCTURE_READY.then(()=>{
      if (typeof STORE_SETTINGS === 'undefined') return;
      const s = STORE_SETTINGS;
      const waHref = s.whatsapp ? 'https://wa.me/' + String(s.whatsapp).replace(/[^0-9]/g, '') : null;
      const igEl = $('tprSocialIG'), mapEl = $('tprSocialMap');
      const waEls = [$('tprSocialWA'), $('tprMenuContact')].filter(Boolean);
      if (igEl && s.instagramUrl) igEl.href = s.instagramUrl;
      if (mapEl && s.mapsUrl) mapEl.href = s.mapsUrl;
      if (waHref) waEls.forEach(el => el.href = waHref);
    });
  }

  const sInput = $('tprSearchInput');
  const sClear = $('tprSearchClear');
  const sDefault = $('tprSearchDefault');
  const sResults = $('tprSearchResults');
  const sEmpty   = $('tprSearchEmpty');

  function runSearch(q){
    const term = q.trim().toLowerCase();
    if (!term){
      sDefault.classList.remove('tpr-hidden');
      sResults.classList.add('tpr-hidden');
      sEmpty.classList.remove('show');
      sClear.classList.remove('show');
      return;
    }
    sClear.classList.add('show');
    sDefault.classList.add('tpr-hidden');

    const hits = catalogue.filter(p =>
      p.name.toLowerCase().includes(term) ||
      p.categoryName.toLowerCase().includes(term) ||
      (p.subcategoryName || '').toLowerCase().includes(term) ||
      (p.material || '').toLowerCase().includes(term) ||
      (p.color || '').toLowerCase().includes(term)
    ).slice(0, 8);

    if (!hits.length){
      sResults.classList.add('tpr-hidden');
      sEmpty.classList.add('show');
      return;
    }
    sEmpty.classList.remove('show');
    sResults.classList.remove('tpr-hidden');
    $('tprResultsLabel').textContent = `RESULTS FOR “${q.trim().toUpperCase()}”`;
    $('tprViewAll').href = 'category.html?cat=all&q=' + encodeURIComponent(q.trim());
    $('tprResultsList').innerHTML = hits.map((p,i) => `
      <a class="tpr-result" href="product.html?slug=${p.slug}" style="animation-delay:${i*0.05}s">
        <div class="tpr-result-img"><img src="${(p.images&&p.images[0])||'logo-beige.png'}" alt="${p.name}"></div>
        <div class="tpr-result-info">
          <div class="tpr-result-name">${p.name}</div>
          <div class="tpr-result-cat">${p.subcategoryName || p.categoryName}</div>
        </div>
        <div class="tpr-result-price">EGP ${(p.salePrice||p.price).toLocaleString()}</div>
      </a>`).join('');
  }

  sInput.addEventListener('input', ()=> runSearch(sInput.value));
  sClear.addEventListener('click', ()=> { sInput.value=''; runSearch(''); sInput.focus(); });
  document.querySelectorAll('.tpr-pills a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      sInput.value = a.dataset.term;
      runSearch(a.dataset.term);
    });
  });

  /* ---------- init ---------- */
  renderCart();
  renderWishBadge();
})();
