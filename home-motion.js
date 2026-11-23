/* =====================================================================
   HOME MOTION — homepage scroll choreography (no libraries except Lenis,
   which is loaded lazily on desktop only).
     1. Smooth inertial scroll (desktop, after load)
     2. Hero scroll-out: frame tightens, film zooms, title lifts away
     3. Reveals: fade-rise, image unveils, split headings (staggered)
     4. Before / After: drag to place the piece in the room, 4 rooms
     5. Brand statement: the About text lights up word by word
   ===================================================================== */
(function () {
  'use strict';
  var doc = document.documentElement;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var AR = (doc.lang || '').toLowerCase() === 'ar';
  var $ = function (id) { return document.getElementById(id); };
  var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };

  doc.classList.add('hm-on');

  /* ------------------------------------------------------------------
     Before / After rooms. "slug" = the product shown in the After photo.
     Images live in before-after/ (square webp). Each Before is the product's own photo with the piece removed (LaMa inpainting), so both halves match pixel for pixel.
     ------------------------------------------------------------------ */
  var ROOMS = [
    { slug: 'modern-colorful-abstract-painting-with-gold-frame-110-90-cm', room: { en: 'Entrance console', ar: 'كونسول المدخل' } },
    { slug: 'golden-teal-bloom-metal-wall-art-120-70-cm-the-pink-room', room: { en: 'Console wall', ar: 'حائط الكونسول' } },
    { slug: 'sculptural-glass-sphere-floor-lamp-size-h-180-cm', room: { en: 'Living room', ar: 'غرفة المعيشة' } },
    { slug: 'royal-reindeer-christmas-statue-white-gold-40-cm', room: { en: 'Christmas mantel', ar: 'ركن الكريسماس' } }
  ];
  var T = AR ? {
    eyebrow: 'قبل &nbsp;/&nbsp; بعد', title: 'قطعة واحدة.<br><em>غرفة مختلفة.</em>',
    lede: 'اسحب على الغرفة وشوف إزاي قطعة واحدة من The Pink Room بتغيّر المكان كله.',
    piece: 'القطعة', shop: 'تسوّق القطعة', before: 'قبل', after: 'بعد',
    stateEyebrow: 'The Pink Room &nbsp;·&nbsp; منذ 2020', range: 'شريط المقارنة قبل وبعد'
  } : {
    eyebrow: 'Before &nbsp;/&nbsp; After', title: 'One piece.<br><em>A different room.</em>',
    lede: 'Drag across the room and watch a single Pink Room piece change the whole space.',
    piece: 'The piece', shop: 'Shop the piece', before: 'Before', after: 'After',
    stateEyebrow: 'The Pink Room &nbsp;·&nbsp; Since 2020', range: 'Before and after slider'
  };

  /* ================= 3. split headings (own markup only) ================= */
  function splitLines(el) {
    if (!el || el.dataset.hmSplit) return;
    el.dataset.hmSplit = '1';
    var parts = el.innerHTML.split(/<br\s*\/?>/i);
    el.innerHTML = parts.map(function (h, i) {
      return '<span class="hm-line"><span style="--hm-i:' + i + '">' + h.trim() + '</span></span>';
    }).join('');
  }

  /* ================= 4. BEFORE / AFTER ================= */
  function initBA() {
    var stage = $('baStage'); if (!stage) return;
    $('baEyebrow').innerHTML = T.eyebrow; $('baTitle').innerHTML = T.title; $('baLede').textContent = T.lede;
    $('baPieceLabel').textContent = T.piece; $('baShopTxt').textContent = T.shop;
    $('baTagB').textContent = T.before; $('baTagA').textContent = T.after;
    $('baRange').setAttribute('aria-label', T.range);
    splitLines($('baTitle'));

    var before = $('baBefore'), after = $('baAfter'), range = $('baRange'), thumbs = $('baThumbs');
    var tagB = $('baTagB'), tagA = $('baTagA'), piece = document.querySelector('.ba-piece');
    var cur = -1, pos = 50, target = 50, anim = false, introDone = false;

    function src(i, kind) { return 'before-after/room-' + (i + 1) + '-' + kind + '.webp?v=2'; }

    // smooth follow: the handle eases toward the pointer instead of snapping
    function loop() {
      var d = target - pos;
      pos += d * 0.18;
      if (Math.abs(d) < 0.05) { pos = target; anim = false; }
      stage.style.setProperty('--pos', pos.toFixed(2) + '%');
      tagB.style.opacity = pos < 14 ? 0 : 1;
      tagA.style.opacity = pos > 86 ? 0 : 1;
      if (anim) raf(loop);
    }
    function go(p, instant) {
      target = Math.max(0, Math.min(100, p));
      if (instant || reduce) { pos = target; anim = false; loop(); return; }
      if (!anim) { anim = true; raf(loop); }
    }

    function product(slug) {
      var list = (typeof PRODUCTS !== 'undefined' && PRODUCTS) || [];
      for (var i = 0; i < list.length; i++) if (list[i].slug === slug) return list[i];
      return null;
    }
    function money(n) { return 'EGP ' + Math.round(Number(n) || 0).toLocaleString('en-US'); }
    function fillPiece(i) {
      var r = ROOMS[i], p = product(r.slug), url = 'product.html?slug=' + encodeURIComponent(r.slug);
      var name = p ? String(p.name || '').split(/\s+[–|-]\s+/)[0] : '';
      $('baPieceName').textContent = name || (AR ? r.room.ar : r.room.en);
      $('baPieceName').href = $('baShop').href = url;
      var price = '';
      if (p) {
        price = (p.salePrice != null && p.price != null && p.salePrice < p.price)
          ? money(p.salePrice) + '<s>' + money(p.price) + '</s>'
          : money(p.salePrice != null ? p.salePrice : p.price);
      }
      $('baPiecePrice').innerHTML = price;
      after.alt = name ? name + (AR ? ' في ' : ' in the ') + (AR ? r.room.ar : r.room.en.toLowerCase()) : '';
    }

    function show(i, first) {
      if (i === cur) return;
      var prev = cur; cur = i;
      $('baNow').textContent = '0' + (i + 1);
      $('baLine').style.transform = 'scaleX(' + ((i + 1) / ROOMS.length) + ')';
      [].forEach.call(thumbs.children, function (b, k) { b.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
      function swap() {
        before.src = src(i, 'before'); after.src = src(i, 'after');
        fillPiece(i);
        piece.classList.remove('swap');
      }
      if (first || reduce) { swap(); return; }
      // preload, then run the curtain: swap happens while the panel covers the stage
      piece.classList.add('swap');
      var a = new Image(), b = new Image(), n = 0;
      function ready() {
        if (++n < 2) return;
        stage.classList.remove('changing'); void stage.offsetWidth; stage.classList.add('changing');
        setTimeout(function () { swap(); go(50, true); go(100, true); setTimeout(function () { go(50); }, 260); }, 520);
        setTimeout(function () { stage.classList.remove('changing'); }, 1450);
      }
      a.onload = a.onerror = b.onload = b.onerror = ready;
      a.src = src(i, 'before'); b.src = src(i, 'after');
    }

    // thumbnails (the "after" photo, so each one shows what you'll get)
    thumbs.innerHTML = ROOMS.map(function (r, i) {
      return '<button type="button" class="ba-thumb" role="tab" aria-selected="false" aria-label="' + (AR ? r.room.ar : r.room.en) + '">' +
        '<img src="' + src(i, 'after') + '" alt="" loading="lazy" decoding="async" width="900" height="900"><span>0' + (i + 1) + '</span></button>';
    }).join('');
    [].forEach.call(thumbs.children, function (b, i) { b.addEventListener('click', function () { show(i); }); });

    // drag: pointer position → handle (works for mouse, pen and touch)
    var dragging = false;
    function fromEvent(e) {
      var r = stage.getBoundingClientRect();
      var x = ((e.clientX - r.left) / r.width) * 100;
      return doc.dir === 'rtl' ? 100 - x : x;
    }
    stage.addEventListener('pointerdown', function (e) {
      dragging = true; stage.classList.add('dragging');
      try { stage.setPointerCapture(e.pointerId); } catch (x) {}
      go(fromEvent(e));
    });
    stage.addEventListener('pointermove', function (e) {
      if (dragging) { go(fromEvent(e)); return; }
      if (e.pointerType === 'mouse' && introDone) go(fromEvent(e));   // desktop: the handle follows the cursor
    });
    function end() { dragging = false; stage.classList.remove('dragging'); }
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    // keyboard / screen readers via the invisible range input
    range.addEventListener('input', function () { go(parseFloat(range.value)); });
    range.addEventListener('keydown', function (e) {
      if (e.key === 'PageDown') show((cur + 1) % ROOMS.length);
      if (e.key === 'PageUp') show((cur + ROOMS.length - 1) % ROOMS.length);
    });

    // swipe-free mobile hint + desktop intro: when the stage first enters view,
    // the handle sweeps across so the piece "appears" in the room
    function intro() {
      if (introDone) return; introDone = true;
      if (reduce) { go(50, true); return; }
      go(100, true);
      setTimeout(function () { go(8); }, 350);
      setTimeout(function () { go(50); }, 1500);
    }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { intro(); io.disconnect(); }
      }, { threshold: 0.45 });
      io.observe(stage);
    } else intro();

    show(0, true); go(100, true);
    if (typeof PRODUCTS_READY !== 'undefined') PRODUCTS_READY.then(function () { fillPiece(cur); });
  }

  /* ================= 5. statement: words light up as you scroll ================= */
  var words = [];
  function initStatement() {
    var el = $('hmStatement'); if (!el) return;
    var e2 = $('hmStateEyebrow'); if (e2) e2.innerHTML = T.stateEyebrow;
    function build() {
      var I = window.TPR_I18N, key = el.getAttribute('data-key');
      var t = (I && I.t && I.t(key)); if (!t || t === key) t = el.textContent;
      t = t.replace(/\s+/g, ' ').trim();
      el.setAttribute('aria-label', t);
      var gold = /^(chic|elegance|character|الأناقة|أنيقة|شيك|طابع)/i;
      el.innerHTML = t.split(' ').map(function (w) {
        return '<span class="w' + (gold.test(w) ? ' gold' : '') + '" aria-hidden="true">' + w.replace(/</g, '&lt;') + '</span>';
      }).join(' ');
      words = [].slice.call(el.querySelectorAll('.w'));
    }
    build();
    setTimeout(build, 0);          // i18n swaps text in after load
    window.addEventListener('load', function () { build(); onScroll(); });
  }
  function paintStatement(vh) {
    if (!words.length) return;
    var el = $('hmStatement'), r = el.getBoundingClientRect();
    // progress: 0 when the paragraph's top is at 85% of the screen, 1 when its bottom reaches 45%
    var start = vh * 0.85, end = vh * 0.45;
    var p = (start - r.top) / ((start - end) + r.height);
    p = Math.max(0, Math.min(1, p));
    var lit = Math.round(p * words.length * 1.05);
    for (var i = 0; i < words.length; i++) {
      var on = i < lit;
      if (on !== words[i]._on) { words[i]._on = on; words[i].classList.toggle('on', on); }
    }
  }

  /* ================= 2. hero: it stays in place while the page slides up over it ================= */
  var hero = document.querySelector('.video-hero');
  var heroMedia = hero && hero.querySelector('.video-hero-media');
  var heroContent = hero && hero.querySelector('.video-hero-content');
  var heroNext = hero && hero.nextElementSibling;
  while (heroNext && (heroNext.offsetHeight === 0 || heroNext.tagName === 'SCRIPT')) heroNext = heroNext.nextElementSibling;
  var heroShade = null, heroLast = -1;
  function initHero() {
    if (!hero || reduce || !heroNext) return;
    doc.classList.add('hm-stack');
    heroShade = document.createElement('div'); heroShade.className = 'hm-hero-shade'; heroShade.setAttribute('aria-hidden', 'true');
    hero.appendChild(heroShade);
    sizeHero();
  }
  function sizeHero() {
    if (!heroShade) return;
    // a hero taller than the screen pins by its bottom edge so none of it is hidden
    hero.style.top = Math.min(0, window.innerHeight - hero.offsetHeight) + 'px';
    heroLast = -1;
  }
  function paintHero(vh) {
    if (!heroShade) return;
    var h = hero.offsetHeight || vh;
    var nextTop = heroNext.getBoundingClientRect().top;
    var p = Math.max(0, Math.min(1, (h + hero.getBoundingClientRect().top - nextTop) / h));
    if (nextTop > vh + 50 && p === 0 && heroLast === 0) return;
    if (Math.abs(p - heroLast) < 0.002) return;
    heroLast = p;
    var e = p * p * (3 - 2 * p);                           // smoothstep
    heroMedia.style.transform = p ? 'scale(' + (1 + e * 0.08).toFixed(4) + ')' : '';
    heroContent.style.transform = p ? 'translate3d(-50%,' + (-e * h * 0.18).toFixed(1) + 'px,0) scale(' + (1 - e * 0.06).toFixed(4) + ')' : '';
    heroContent.style.opacity = p ? Math.max(0, 1 - p * 1.6).toFixed(3) : '';
    heroShade.style.opacity = (e * 0.72).toFixed(3);
  }

  /* ================= 3. reveals ================= */
  function tag(sel, cls, step, base) {
    [].forEach.call(document.querySelectorAll(sel), function (el, i) {
      if (el.classList.contains(cls)) return;
      el.classList.add(cls);
      el.style.setProperty('--hm-d', ((base || 0) + (step ? (i % 6) * step : 0)).toFixed(2) + 's');
      revealIO && revealIO.observe(el);
    });
  }
  var revealIO = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
    es.forEach(function (en) {
      if (!en.isIntersecting) return;
      var el = en.target; revealIO.unobserve(el);
      el.classList.add('hm-in');
      // hand the element back to its own hover styles once the entrance is over
      if (!el.classList.contains('hm-split')) {
        setTimeout(function () {
          el.classList.remove('hm-rv', 'hm-img', 'hm-in');
          el.style.removeProperty('--hm-d');
        }, 2400);
      }
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }) : null;

  function initReveals() {
    if (!revealIO || reduce) { doc.classList.remove('hm-on'); return; }
    tag('.cats-title, .rooms-title, .journal-title, .journal-eyebrow', 'hm-rv');
    tag('.ba-stage-wrap', 'hm-rv', 0, 0.1);
    tag('.ba-thumb', 'hm-rv', 0.07, 0.35);
    [].forEach.call(document.querySelectorAll('.hm-rv, .hm-split'), function (el) { revealIO.observe(el); });
  }


  /* ================= category cards: curtain entrance, one by one ================= */
  var catCards = [];
  function initCats() {
    if (!('IntersectionObserver' in window) || reduce) return;
    catCards = [].slice.call(document.querySelectorAll('.cats .cat-card'));
    catCards.forEach(function (c) { c.classList.add('hm-cat'); });
    // cards that enter together are released one after another, in reading order
    var queue = [], timer = null, lastRelease = 0;
    function flush() {
      timer = null;
      queue.sort(function (a, b) { return catCards.indexOf(a) - catCards.indexOf(b); });
      var now = performance.now(), wait = Math.max(0, lastRelease - now) / 1000;
      queue.forEach(function (c, i) {
        var d = wait + i * 0.16;
        c.style.setProperty('--cd', d.toFixed(2) + 's');
        c.classList.add('hm-cat-in');
        setTimeout(function () { c.classList.add('hm-cat-done'); c.style.removeProperty('--cd'); }, (d + 2.6) * 1000);
        lastRelease = now + (d + 0.2) * 1000;
      });
      queue = [];
    }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target); queue.push(en.target);
      });
      if (queue.length && !timer) timer = setTimeout(flush, 40);
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.15 });
    catCards.forEach(function (c) { io.observe(c); });

  }
  function paintCats(vh) {
    for (var i = 0; i < catCards.length; i++) {
      var r = catCards[i].getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) continue;
      var k = ((r.top + r.height / 2) - vh / 2) / vh;          // -0.5 .. 0.5 across the screen
      catCards[i].style.setProperty('--py', (k * -5).toFixed(2) + '%');
    }
  }

  /* ================= staggered release helper: things entering together go one after another ================= */
  function stagger(els, step, onIn, opts) {
    if (!('IntersectionObserver' in window) || reduce) { els.forEach(function (el) { onIn(el, 0); }); return; }
    var queue = [], timer = null, last = 0;
    function flush() {
      timer = null;
      queue.sort(function (a, b) { return els.indexOf(a) - els.indexOf(b); });
      var now = performance.now(), wait = Math.max(0, last - now) / 1000;
      queue.forEach(function (el, i) { var d = wait + i * step; onIn(el, d); last = now + (d + step) * 1000; });
      queue = [];
    }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); queue.push(en.target); } });
      if (queue.length && !timer) timer = setTimeout(flush, 40);
    }, opts || { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ================= TOP SELLERS: editorial gallery ================= */
  function initTopSellers() {
    var sec = $('tsx'), rail = $('tsxRail'); if (!sec || !rail) return;
    var I = window.TPR_I18N, t = I && I.t && I.t('tsTitleHtml');
    if (t && t !== 'tsTitleHtml') $('tsxTitle').innerHTML = t;
    splitLines($('tsxTitle'));
    function money(n) { return 'EGP ' + Math.round(Number(n) || 0).toLocaleString('en-US'); }
    function thumb(src, w) { return window.tprThumb ? window.tprThumb(src, w) : src; }
    function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
    function render() {
      var ids = (typeof TOP_SELLER_IDS !== 'undefined' && TOP_SELLER_IDS.length) ? TOP_SELLER_IDS : [];
      var list = (typeof PRODUCTS !== 'undefined' && PRODUCTS) || [];
      var picks = ids.map(function (id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; }).filter(Boolean);
      if (!picks.length) { sec.style.display = 'none'; return; }
      var view = AR ? 'شوف القطعة' : 'View<br>piece', sale = (I && I.t && I.t('saleTag')) || 'SALE';
      rail.innerHTML = picks.map(function (p, i) {
        var imgs = p.images || [], a = imgs[0] || 'logo-beige.png', b = imgs[1];
        var focus = p.imageFocus && p.imageFocus[a] ? ' style="object-position:' + esc(p.imageFocus[a]) + '"' : '';
        var onSale = p.salePrice != null && p.price != null && p.salePrice < p.price;
        var price = onSale ? money(p.salePrice) + '<s>' + money(p.price) + '</s>' : money(p.salePrice != null ? p.salePrice : p.price);
        var name = String(p.name || '').split(/\s+-\s+size\b|\s+\|\s+|\s+–\s+/i)[0].trim();
        return '<a class="tsx-card" href="product.html?slug=' + encodeURIComponent(p.slug) + '" draggable="false">' +
          '<div class="tsx-media">' +
            '<img class="a" src="' + esc(thumb(a, 700)) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async" draggable="false"' + focus + '>' +
            (b ? '<img class="b" src="' + esc(thumb(b, 700)) + '" alt="" loading="lazy" decoding="async" draggable="false">' : '') +
            '<span class="tsx-num">' + (i < 9 ? '0' : '') + (i + 1) + '</span>' +
            (onSale ? '<span class="tsx-tag">' + esc(sale) + '</span>' : '') +
            '<button type="button" class="tsx-wish" aria-label="Add to wishlist" data-id="' + esc(p.id) + '"><svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg></button>' +
            '<span class="tsx-view" aria-hidden="true">' + view + '</span>' +
          '</div>' +
          '<div class="tsx-info"><div><h3 class="tsx-name">' + esc(name) + '</h3><p class="tsx-cat">' + esc(p.categoryName || '') + '</p></div><p class="tsx-price">' + price + '</p></div>' +
        '</a>';
      }).join('');
      $('tsxTotal').textContent = (picks.length < 10 ? '0' : '') + picks.length;

      [].forEach.call(rail.querySelectorAll('.tsx-wish'), function (btn) {
        if (window.TPR && window.TPR.isWished && window.TPR.isWished(btn.dataset.id)) btn.classList.add('liked');
        btn.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          var liked = window.TPR ? window.TPR.toggleWishlist(btn.dataset.id) : !btn.classList.contains('liked');
          btn.classList.toggle('liked', !!liked);
        });
      });

      var cards = [].slice.call(rail.children);
      stagger(cards, 0.12, function (c, d) {
        c.style.setProperty('--cd', d.toFixed(2) + 's'); c.classList.add('in');
        setTimeout(function () { c.classList.add('done'); }, (d + 2.3) * 1000);
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
      update();
    }

    // progress line + counter + arrows (one rAF per scroll burst)
    var bar = $('tsxBar'), now = $('tsxNow'), prev = $('tsxPrev'), next = $('tsxNext'), pend = false;
    function update() {
      pend = false;
      var max = rail.scrollWidth - rail.clientWidth, x = Math.abs(rail.scrollLeft);
      var p = max > 0 ? x / max : 1;
      bar.style.transform = 'scaleX(' + Math.max(0.06, p).toFixed(3) + ')';
      var cards = rail.children, n = cards.length, w = n ? cards[0].offsetWidth : 1;
      var gap = n > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : w;
      var i = Math.min(n - 1, Math.round(x / (gap || 1)));
      if (p > 0.985) i = n - 1;
      now.textContent = (i < 9 ? '0' : '') + (i + 1);
      prev.disabled = x < 4; next.disabled = x > max - 4;
    }
    rail.addEventListener('scroll', function () { if (!pend) { pend = true; raf(update); } }, { passive: true });
    window.addEventListener('resize', function () { raf(update); });
    function step(dir) {
      var c = rail.children[0]; if (!c) return;
      var gap = rail.children[1] ? rail.children[1].offsetLeft - c.offsetLeft : c.offsetWidth;
      var sign = doc.dir === 'rtl' ? -1 : 1;
      rail.scrollBy({ left: dir * sign * gap, behavior: 'smooth' });
    }
    prev.addEventListener('click', function () { step(-1); });
    next.addEventListener('click', function () { step(1); });

    // desktop: drag the rail with the mouse, with a little momentum on release
    if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
      var down = false, moved = 0, sx = 0, sl = 0, lastX = 0, v = 0, lastT = 0;
      rail.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('.tsx-wish')) return;
        down = true; moved = 0; sx = lastX = e.clientX; sl = rail.scrollLeft; v = 0; lastT = performance.now();
      });
      window.addEventListener('pointermove', function (e) {
        if (!down) return;
        var dx = e.clientX - sx; moved = Math.max(moved, Math.abs(dx));
        if (moved > 6 && !rail.classList.contains('drag')) rail.classList.add('drag');
        if (moved > 6) {
          rail.scrollLeft = sl - dx;
          var t = performance.now(); v = (e.clientX - lastX) / Math.max(1, t - lastT); lastX = e.clientX; lastT = t;
        }
      });
      window.addEventListener('pointerup', function () {
        if (!down) return; down = false;
        if (!rail.classList.contains('drag')) return;
        var vel = v * 16;
        (function glide() {
          if (Math.abs(vel) < 0.5) { rail.classList.remove('drag'); return; }
          rail.scrollLeft -= vel; vel *= 0.92; raf(glide);
        })();
      });
    }

    if (typeof PRODUCTS_READY !== 'undefined') {
      Promise.all([PRODUCTS_READY, typeof SITE_STRUCTURE_READY !== 'undefined' ? SITE_STRUCTURE_READY : Promise.resolve()]).then(render);
    }
  }

  /* ================= TRUST BAND: dividers draw, icons draw themselves ================= */
  function initTrust() {
    var band = document.querySelector('.tx'); if (!band) return;
    [].forEach.call(band.querySelectorAll('.tx-icon *'), function (el) { el.setAttribute('pathLength', '1'); });
    if (!('IntersectionObserver' in window) || reduce) { band.classList.add('in'); return; }
    var io = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { band.classList.add('in'); io.disconnect(); }
    }, { threshold: 0.3 });
    io.observe(band);
  }

  /* ================= SHOP BY ROOM: tiles unveil one by one ================= */
  function initRooms() {
    if (reduce || !('IntersectionObserver' in window)) return;
    var cards = [].slice.call(document.querySelectorAll('.rooms .room-card'));
    cards.forEach(function (c) { c.classList.add('hm-room'); });
    stagger(cards, 0.14, function (c, d) {
      c.style.setProperty('--cd', d.toFixed(2) + 's'); c.classList.add('in');
      // hand the card back to its own hover styles once the entrance is over
      setTimeout(function () { c.classList.remove('hm-room', 'in'); c.style.removeProperty('--cd'); }, (d + 2.6) * 1000);
    });
  }

  /* ================= scroll loop (one rAF per frame) ================= */
  var ticking = false;
  function frame() {
    ticking = false;
    var vh = window.innerHeight;
    paintHero(vh);
    paintStatement(vh);
  }
  function onScroll() { if (!ticking) { ticking = true; raf(frame); } }

  /* ================= 1. smooth scroll (Lenis, desktop pointer only) ================= */
  function initLenis() {
    if (reduce || !matchMedia('(pointer:fine)').matches) return;
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js';
    s.async = true;
    s.onload = function () {
      if (!window.Lenis) return;
      var lenis = new window.Lenis({
        duration: 1.15,
        easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
        smoothWheel: true,
        // drawers, menus, search and anything scrollable inside keep native scrolling
        prevent: function (node) {
          return !!(node && node.closest && node.closest('[data-lenis-prevent], .tpr-menu, .tpr-drawer, #tprCart, .tpr-search, .ts-grid-wrap, dialog, [role="dialog"]'));
        }
      });
      window.__tprLenis = lenis;
      lenis.on('scroll', onScroll);
      (function tick(t) { lenis.raf(t); raf(tick); })(0);
      // pause while the page is scroll-locked (intro, open drawers)
      function sync() {
        var locked = doc.classList.contains('tpr-intro-lock') ||
          getComputedStyle(document.body).overflow === 'hidden' || getComputedStyle(doc).overflow === 'hidden';
        locked ? lenis.stop() : lenis.start();
      }
      new MutationObserver(sync).observe(doc, { attributes: true, attributeFilter: ['class', 'style'] });
      new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
      sync();
      // in-page anchors glide too
      document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[href^="#"]');
        if (!a || a.getAttribute('href').length < 2) return;
        var t = document.querySelector(a.getAttribute('href'));
        if (t) { e.preventDefault(); lenis.scrollTo(t, { offset: -20 }); }
      });
    };
    document.head.appendChild(s);
  }

  /* ================= boot ================= */
  function boot() {
    initBA();
    initStatement();
    initReveals();
    initCats();
    initTopSellers();
    initTrust();
    initRooms();
    initHero();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () { sizeHero(); onScroll(); });
    onScroll();
    // smooth scroll waits for the page to settle so it never touches load speed
    // native scrolling: Lenis removed — it made scrolling feel heavy over the hero video
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
