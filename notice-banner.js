/* ============================================================
   THE PINK ROOM — site-wide maintenance notice banner
   A small, dismissible strip at the very top of the page, telling
   customers some product photos may be missing while we fix a
   storage issue. Dismissal is remembered per-browser (localStorage)
   so it doesn't nag once someone's closed it. Self-contained —
   no dependency on shared-ui.js, so it works on every page.
   ============================================================ */
(function(){
  const DISMISS_KEY = 'tpr_notice_maintenance_2026_08_dismissed';
  if (localStorage.getItem(DISMISS_KEY) === '1') return;

  const IG = 'https://www.instagram.com/thepinkroom_eg?igsh=dnZrbW9xazV2dGp5';

  const style = document.createElement('style');
  style.textContent = `
    #tprNoticeBanner{
      position:relative;
      z-index:10000;
      display:flex;
      align-items:center;
      justify-content:center;
      gap:12px;
      flex-wrap:wrap;
      padding:10px 44px 10px 16px;
      background:#f6e4ea;
      color:#5c3140;
      font-family:inherit;
      font-size:13.5px;
      line-height:1.5;
      text-align:center;
      border-bottom:1px solid #e9c3d1;
    }
    #tprNoticeBanner strong{ font-weight:600; }
    #tprNoticeBanner a{
      color:#a3345a;
      font-weight:600;
      text-decoration:underline;
      white-space:nowrap;
    }
    #tprNoticeBanner .tpr-notice-close{
      position:absolute;
      top:50%;
      right:10px;
      transform:translateY(-50%);
      width:26px;
      height:26px;
      border:none;
      background:transparent;
      color:#5c3140;
      font-size:18px;
      line-height:1;
      cursor:pointer;
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
    }
    #tprNoticeBanner .tpr-notice-close:hover{ background:rgba(92,49,64,.1); }
    @media (max-width:520px){
      #tprNoticeBanner{ font-size:12.5px; padding:10px 40px 10px 12px; }
    }
  `;
  document.head.appendChild(style);

  const banner = document.createElement('div');
  banner.id = 'tprNoticeBanner';
  banner.innerHTML = `
    <span>We're sorry — the site is undergoing some fixes right now, so <strong>a few product photos may not display</strong> at the moment. We're working to have this resolved as soon as possible. Thank you for your patience! Want to order in the meantime? <a href="${IG}" target="_blank" rel="noopener">Message us on Instagram</a>.</span>
    <button type="button" class="tpr-notice-close" aria-label="Dismiss">&times;</button>
  `;

  document.body.insertBefore(banner, document.body.firstChild);

  banner.querySelector('.tpr-notice-close').addEventListener('click', () => {
    banner.remove();
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch(e){}
  });
})();
