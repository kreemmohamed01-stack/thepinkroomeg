/* ============================================================
   THE PINK ROOM — light seasonal snowfall
   One fixed, click-through <canvas> drawing ~45 soft flakes. Kept cheap on
   purpose: starts only after the page has loaded and gone quiet (or on the
   first interaction), caps the pixel ratio, sleeps while the tab is hidden,
   and never runs underneath the intro video.
   Include with <script src="snow.js" defer></script>.
   ============================================================ */
(function(){
  if (window.__tprSnow) return; window.__tprSnow = true;

  var started = false;
  function start(){
    if (started) return;
    if (window.__tprIntroActive) { window.addEventListener('tpr-intro-done', start, { once:true }); return; }
    started = true;

    var cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147482000;opacity:0;transition:opacity 2s ease';
    document.body.appendChild(cv);
    var ctx = cv.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var W = 0, H = 0, flakes = [];
    var COUNT = window.innerWidth < 640 ? 32 : 48;

    function size(){
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function flake(top){
      var r = 1 + Math.random() * 2.6;              // bigger flakes fall faster and look closer
      return {
        x: Math.random() * W,
        y: top ? -10 - Math.random() * H * .3 : Math.random() * H,
        r: r,
        vy: .25 + r * .22,
        sway: .4 + Math.random() * .9,
        ph: Math.random() * Math.PI * 2,
        a: .35 + Math.random() * .5
      };
    }
    size();
    for (var i = 0; i < COUNT; i++) flakes.push(flake(false));
    window.addEventListener('resize', size, { passive:true });

    var last = 0, raf = 0;
    function frame(t){
      raf = requestAnimationFrame(frame);
      var dt = last ? Math.min((t - last) / 16.7, 3) : 1; last = t;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < flakes.length; i++){
        var f = flakes[i];
        f.ph += .012 * dt;
        f.y += f.vy * dt;
        f.x += Math.sin(f.ph) * f.sway * .35 * dt;
        if (f.y > H + 10) { flakes[i] = flake(true); continue; }
        ctx.globalAlpha = f.a;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.2832); ctx.fill();
      }
    }
    raf = requestAnimationFrame(frame);
    requestAnimationFrame(function(){ cv.style.opacity = '1'; });

    document.addEventListener('visibilitychange', function(){
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
      else if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
    });
  }

  var ev = ['pointermove','pointerdown','touchstart','keydown','wheel','scroll'];
  function kick(){ ev.forEach(function(t){ removeEventListener(t, kick, true); }); start(); }
  ev.forEach(function(t){ addEventListener(t, kick, { capture:true, passive:true }); });
  function afterLoad(){ setTimeout(kick, 3000); }
  if (document.readyState === 'complete') afterLoad(); else addEventListener('load', afterLoad, { once:true });
})();
