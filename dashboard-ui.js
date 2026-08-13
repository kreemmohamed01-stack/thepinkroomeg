/* ============================================================
   THE PINK ROOM — shared admin dashboard shell
   Injects the sidebar (grouped nav, highlights the current page) and
   mobile topbar into every dashboard-*.html page, the same injection
   pattern shared-ui.js already uses for the storefront. Also centralizes
   auth-checking and the small utilities every module needs, so adding a
   new dashboard page never means re-copying this boilerplate.

   Expected page structure (see any dashboard-*.html for reference):
     <div class="db-shell">
       <div data-dash-sidebar></div>
       <main class="db-main">
         <div data-dash-mobile-topbar></div>
         <div class="db-wrap"> ...page content... </div>
       </main>
     </div>
     <div class="db-toast-wrap" id="dbToastWrap"></div>
   ============================================================ */
(function(){

  const NAV = [
    { group: 'DASHBOARD', items: [
      { href: 'dashboard.html', label: 'Overview', icon: 'home' },
      { href: 'dashboard-analytics.html', label: 'Analytics', icon: 'chart' }
    ]},
    { group: 'STORE', items: [
      { href: 'dashboard-orders.html', label: 'Orders', icon: 'bag' },
      { href: 'dashboard-customers.html', label: 'Customers', icon: 'users' },
      { href: 'dashboard-products.html', label: 'Products', icon: 'box' },
      { href: 'dashboard-catalog.html', label: 'Catalog Structure', icon: 'grid' },
      { href: 'dashboard-inventory.html', label: 'Inventory', icon: 'inventory' },
      { href: 'dashboard-coupons.html', label: 'Coupons', icon: 'tag' },
      { href: 'dashboard-payments.html', label: 'Payments', icon: 'card' },
      { href: 'dashboard-reviews.html', label: 'Reviews', icon: 'star' }
    ]},
    { group: 'SETTINGS', items: [
      { href: 'dashboard-shipping.html', label: 'Shipping', icon: 'truck' },
      { href: 'dashboard-notifications.html', label: 'Notifications', icon: 'bell' },
      { href: 'dashboard-content.html', label: 'Content', icon: 'edit' },
      { href: 'dashboard-store-settings.html', label: 'Store Settings', icon: 'settings' }
    ]}
  ];

  const ICONS = {
    home:  '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>',
    bag:   '<svg viewBox="0 0 24 24"><path d="M6.5 8h11l.9 12.1a2 2 0 0 1-2 2.15H7.6a2 2 0 0 1-2-2.15L6.5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    users: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    box:   '<svg viewBox="0 0 24 24"><path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>',
    inventory: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    tag: '<svg viewBox="0 0 24 24"><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
    truck: '<svg viewBox="0 0 24 24"><rect x="1" y="7" width="13" height="10" rx="1"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="6" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/></svg>',
    card: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 2.5l3 6.5 7 1-5 5 1.2 7-6.2-3.5-6.2 3.5 1.2-7-5-5 7-1z"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
  };

  function sidebarHtml(){
    const current = location.pathname.split('/').pop() || 'dashboard.html';
    return `
    <div class="db-sidebar-overlay" id="dbSidebarOverlay"></div>
    <aside class="db-sidebar" id="dbSidebar">
      <a class="db-sidebar-brand" href="dashboard.html">
        <img src="logo-beige.png" alt="The Pink Room">
        <span>Dashboard</span>
      </a>
      <nav class="db-sidebar-nav">
        ${NAV.map(g => `
          <div class="db-sidebar-group">
            <p class="db-sidebar-group-label">${g.group}</p>
            ${g.items.map(it => `<a class="db-sidebar-link ${it.href === current ? 'active' : ''}" href="${it.href}">${ICONS[it.icon] || ''}<span>${it.label}</span></a>`).join('')}
          </div>`).join('')}
      </nav>
      <div class="db-sidebar-foot">
        <p class="db-sidebar-user" id="dbUsername"></p>
        <button class="db-logout" id="btnLogout">
          <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          SIGN OUT
        </button>
      </div>
    </aside>`;
  }

  function mobileTopbarHtml(){
    return `
    <header class="db-mobile-topbar">
      <button class="db-mobile-menu-btn" id="dbMobileMenuBtn" aria-label="Menu">
        <svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <img src="logo-beige.png" alt="The Pink Room" style="height:22px">
      <span style="width:34px"></span>
    </header>`;
  }

  const sidebarHost = document.querySelector('[data-dash-sidebar]');
  if (sidebarHost) sidebarHost.outerHTML = sidebarHtml();
  const topbarHost = document.querySelector('[data-dash-mobile-topbar]');
  if (topbarHost) topbarHost.outerHTML = mobileTopbarHtml();

  const $ = id => document.getElementById(id);
  const sidebar = $('dbSidebar');
  const sidebarOverlay = $('dbSidebarOverlay');

  function openSidebar(){ sidebar.classList.add('open'); sidebarOverlay.classList.add('open'); }
  function closeSidebar(){ sidebar.classList.remove('open'); sidebarOverlay.classList.remove('open'); }
  const menuBtn = $('dbMobileMenuBtn');
  if (menuBtn) menuBtn.addEventListener('click', openSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

  const logoutBtn = $('btnLogout');
  if (logoutBtn) logoutBtn.addEventListener('click', async ()=>{
    try { await fetch('/api/admin/auth?action=logout', { method: 'POST' }); } catch(e){}
    location.href = 'dashboard-login.html';
  });

  /* ---------- shared utils ---------- */
  const money = n => 'EGP ' + Math.round(Number(n) || 0).toLocaleString('en-US');
  const fmtDate = ts => new Date(ts).toLocaleDateString('en-US', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const fmtDateShort = ts => new Date(ts).toLocaleDateString('en-US', { day:'numeric', month:'short', year:'numeric' });
  function escHtml(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  const escAttr = escHtml;

  /* ---------- toasts (success/error feedback, used across every module) ---------- */
  function toast(message, type){
    let wrap = $('dbToastWrap');
    if (!wrap){
      wrap = document.createElement('div');
      wrap.className = 'db-toast-wrap';
      wrap.id = 'dbToastWrap';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = 'db-toast' + (type ? ' ' + type : '');
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(()=>{ el.style.opacity = '0'; el.style.transition = 'opacity .3s ease'; setTimeout(()=> el.remove(), 300); }, 3200);
  }

  /* ---------- auth guard ----------
     Every dashboard page calls DashUI.requireAuth(username => { ...init the page... }).
     Redirects to login if not signed in; never resolves in that case. */
  async function requireAuth(onReady){
    try {
      const r = await fetch('/api/admin/auth?action=session');
      const d = await r.json();
      if (!d.signedIn){ location.href = 'dashboard-login.html'; return; }
      const el = $('dbUsername');
      if (el) el.textContent = d.username || '';
      if (typeof onReady === 'function') onReady(d.username);
    } catch(e){
      location.href = 'dashboard-login.html';
    }
  }

  window.DashUI = { requireAuth, money, fmtDate, fmtDateShort, escHtml, escAttr, toast, closeSidebar };
})();
