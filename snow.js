/* ============================================================
   THE PINK ROOM — light seasonal snowfall
   Pure CSS, compositor-only: three fixed layers of tiled soft dots, each
   sliding down with a transform animation (near / mid / far, different
   speeds and sizes for depth), plus a gentle sideways drift. Nothing is
   redrawn per frame and no JavaScript runs after setup, so it costs the
   page almost nothing. Click-through, never above the intro video, and
   fades in only after the page has loaded (or on first interaction).
   Include with <script src="snow.js" defer></script>.
   ============================================================ */
(function(){
  if (window.__tprSnow) return; window.__tprSnow = true;

  var css =
    '.tpr-snow{position:fixed;inset:0;pointer-events:none;z-index:2147482000;overflow:hidden;opacity:0;transition:opacity 2.5s ease;contain:strict}' +
    '.tpr-snow.on{opacity:1}' +
    /* each layer is one tile height repeated; it slides down by exactly two
       tiles per loop, so the restart lines up pixel-perfectly (no jump) */
    '.tpr-snow i{position:absolute;left:-30px;right:-30px;top:-700px;bottom:0;will-change:transform;animation:linear infinite}' +
    '.tpr-snow .s1{background-image:radial-gradient(circle,rgba(255,255,255,.9) 0 2.6px,transparent 3.4px),radial-gradient(circle,rgba(255,255,255,.75) 0 2px,transparent 2.8px);' +
      'background-size:260px 300px,330px 300px;background-position:40px 60px,190px 210px;animation-name:tprSnow1;animation-duration:9s}' +
    '.tpr-snow .s2{background-image:radial-gradient(circle,rgba(255,255,255,.7) 0 1.7px,transparent 2.4px),radial-gradient(circle,rgba(255,255,255,.6) 0 1.4px,transparent 2px);' +
      'background-size:200px 230px,240px 230px;background-position:120px 20px,30px 140px;animation-name:tprSnow2;animation-duration:11s;opacity:.85}' +
    '.tpr-snow .s3{background-image:radial-gradient(circle,rgba(255,255,255,.55) 0 1.1px,transparent 1.6px),radial-gradient(circle,rgba(255,255,255,.45) 0 1px,transparent 1.5px);' +
      'background-size:150px 170px,180px 170px;background-position:70px 90px,10px 30px;animation-name:tprSnow3;animation-duration:13s;opacity:.7}' +
    '@keyframes tprSnow1{to{transform:translate3d(0,600px,0)}}' +
    '@keyframes tprSnow2{to{transform:translate3d(0,460px,0)}}' +
    '@keyframes tprSnow3{to{transform:translate3d(0,340px,0)}}' +
    /* sideways sway lives on the container so the fall stays a single transform */
    '.tpr-snow .w{position:absolute;inset:0;will-change:transform;animation:tprSnowSway 9s ease-in-out infinite alternate}' +
    '@keyframes tprSnowSway{from{transform:translate3d(-14px,0,0)}to{transform:translate3d(14px,0,0)}}' +
    '@media (max-width:640px){.tpr-snow .s3{display:none}}';

  var started = false;
  function start(){
    if (started) return;
    if (window.__tprIntroActive) { window.addEventListener('tpr-intro-done', start, { once:true }); return; }
    started = true;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var box = document.createElement('div');
    box.className = 'tpr-snow'; box.setAttribute('aria-hidden', 'true');
    // inline !important: the page pauses its own decorative loops until the
    // visitor engages (index.html, html:not(.fx)); the snow must not wait
    var run = ' style="animation-play-state:running!important"';
    box.innerHTML = '<div class="w"' + run + '><i class="s3"' + run + '></i><i class="s2"' + run + '></i><i class="s1"' + run + '></i></div>';
    document.body.appendChild(box);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ box.classList.add('on'); }); });
  }

  var ev = ['pointermove','pointerdown','touchstart','keydown','wheel','scroll'];
  function kick(){ ev.forEach(function(t){ removeEventListener(t, kick, true); }); start(); }
  ev.forEach(function(t){ addEventListener(t, kick, { capture:true, passive:true }); });
  function afterLoad(){ setTimeout(kick, 3000); }
  if (document.readyState === 'complete') afterLoad(); else addEventListener('load', afterLoad, { once:true });
})();
