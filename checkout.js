/* ============================================================
   THE PINK ROOM — checkout engine
   One shared module used by checkout.html, order-success.html and
   receipt.html so state, pricing and payment logic live in exactly
   one place. Everything here is front-end only (localStorage) —
   it is deliberately structured so a real backend/API can replace
   the storage + PaymentProviders.process() calls later without
   touching the UI layer.
   Requires: nothing (standalone) — but expects the shared cart
   (tpr_cart_v1) written by shared-ui.js to exist.
   ============================================================ */
(function(){

  const CART_KEY     = 'tpr_cart_v1';      // shared with shared-ui.js
  const CHECKOUT_KEY = 'tpr_checkout_v1';  // in-progress checkout answers
  const ORDERS_KEY    = 'tpr_orders_v1';    // placed orders (order history)

  const STEPS = ['information', 'shipping', 'payment', 'review'];

  const GOVERNORATES = [
    'Cairo','Giza','Alexandria','Qalyubia','Port Said','Suez','Dakahlia','Sharqia',
    'Gharbia','Monufia','Beheira','Ismailia','Faiyum','Beni Suef','Minya','Asyut',
    'Sohag','Qena','Luxor','Aswan','Red Sea','New Valley','Matrouh','North Sinai',
    'South Sinai','Damietta','Kafr El Sheikh'
  ];

  // sane defaults so the page renders instantly — refreshed from the
  // dashboard's real Shipping settings just below. Mutated in place
  // (never reassigned) so anything holding a reference to this exact
  // object automatically sees the real numbers once they arrive, the
  // same pattern PRODUCTS uses in catalog.js.
  const SHIPPING_METHODS = {
    standard: { id:'standard', label:'Standard Delivery', sub:'3 – 5 Business Days', price:80,  minDays:3, maxDays:5 },
    express:  { id:'express',  label:'Express Delivery',  sub:'1 – 2 Business Days', price:150, minDays:1, maxDays:2 }
  };
  const SHIPPING_METHODS_READY = fetch('/api/orders?action=shipping-methods')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data && data.ok && data.methods && Object.keys(data.methods).length) {
        Object.keys(SHIPPING_METHODS).forEach(k => delete SHIPPING_METHODS[k]);
        Object.assign(SHIPPING_METHODS, data.methods);
      }
      return SHIPPING_METHODS;
    })
    .catch(() => SHIPPING_METHODS);

  /* ---------- payment provider abstraction ----------
     Each provider exposes the same shape so a real gateway (Paymob,
     Stripe, etc.) can be dropped in later without changing checkout.html.
     process() never fakes a "paid" result — every provider we can
     actually offer today just returns 'pending' because there is no
     backend yet to confirm a real charge. Paymob is wired up but kept
     disabled until its API keys / webhook handler exist server-side. */
  const PaymentProviders = {
    cash_on_delivery: {
      id:'cash_on_delivery', label:'Cash on Delivery', enabled:true,
      description:'Pay with cash upon delivery.',
      async process(){ return { status:'pending', note:'Payment due on delivery.' }; }
    },
    card: {
      id:'card', label:'Credit / Debit Card', enabled:true,
      description:'Secure payment with your card.',
      /* NOTE: card number / expiry / CVV are read from the form for display
         purposes only and are NEVER written to checkout state, the order
         object, or localStorage. A real integration would tokenize them
         through a PCI-compliant gateway and only store the returned token. */
      async process(){ return { status:'pending', note:'Card payments require a connected payment gateway. Your order has been recorded and will be confirmed once payment is captured.' }; }
    },
    bank_transfer: {
      id:'bank_transfer', label:'Bank Transfer', enabled:true,
      description:'Transfer directly from your bank account.',
      async process(){ return { status:'pending', note:'Order will be confirmed once the transfer is received.' }; }
    },
    paymob: {
      id:'paymob', label:'Paymob', enabled:false,
      description:'Coming soon.',
      /* Ready for: initiate(order) -> {iframeUrl, transactionId}
         handleCallback(payload) -> verifies HMAC, updates paymentStatus
         verifyTransaction(transactionId) -> polls Paymob's transaction API
         None of that can run from a static front-end — it needs a server
         route holding the Paymob secret key, so this stays disabled. */
      async process(){ throw new Error('Paymob is not yet available.'); }
    }
  };

  /* ---------- storage ---------- */
  function loadCart(){
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch(e){ return []; }
  }
  function loadCheckoutState(){
    try { return JSON.parse(localStorage.getItem(CHECKOUT_KEY)) || {}; }
    catch(e){ return {}; }
  }
  function saveCheckoutState(state){
    try { localStorage.setItem(CHECKOUT_KEY, JSON.stringify(state)); } catch(e){}
  }
  function clearCheckoutState(){
    try { localStorage.removeItem(CHECKOUT_KEY); } catch(e){}
  }
  function loadOrders(){
    try { return JSON.parse(localStorage.getItem(ORDERS_KEY)) || []; }
    catch(e){ return []; }
  }
  function saveOrders(orders){
    try { localStorage.setItem(ORDERS_KEY, JSON.stringify(orders)); } catch(e){}
  }
  function getOrder(id){
    return loadOrders().find(o => o.id === id) || null;
  }
  function getLatestOrder(){
    const orders = loadOrders();
    return orders.length ? orders[orders.length - 1] : null;
  }

  /* ---------- formatting ---------- */
  const money = n => 'EGP ' + Math.round(Number(n) || 0).toLocaleString('en-US');

  /* ---------- validation ---------- */
  const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());
  const isPhone = v => /^[0-9+\-\s()]{8,18}$/.test(String(v||'').trim());
  const isFilled = v => String(v||'').trim().length > 0;

  /* ---------- promo codes — real ones, validated server-side against
     the `coupons` table (api/_lib/coupons.js). This is a preview only:
     it tells the customer their code worked and roughly what it's
     worth, but the authoritative check (and the discount actually
     charged) happens again at order creation in api/orders.js, which
     never trusts anything the client sends about pricing. ---------- */
  async function checkPromo(code, subtotal){
    const c = String(code||'').trim().toUpperCase();
    if (!c) return null;
    try {
      const resp = await fetch('/api/orders?action=validate-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: c, subtotal })
      });
      const data = await resp.json();
      if (!data.ok) return false; // false = invalid/expired/etc — data.error has why
      return { code: data.code, pct: data.pct, label: data.label, discount: data.discount };
    } catch(e){
      return false;
    }
  }

  /* ---------- the single source of truth for every total on the site.
     promo.discount (an absolute EGP amount from the server) is used
     directly rather than recomputed from pct here, since fixed-amount
     coupons don't have a pct at all — this only ever renders a preview,
     the real number is always recomputed server-side at order time. ---------- */
  function calculatePricing(cart, shippingMethod, promo){
    const subtotal = cart.reduce((s,i)=> s + (i.price * i.qty), 0);
    const discount = (promo && promo.discount) ? Math.min(promo.discount, subtotal) : 0;
    const shipping = shippingMethod ? shippingMethod.price : 0;
    const tax = 0; // VAT is included in listed prices, as on every product page ("Tax included.")
    const total = Math.max(0, subtotal - discount) + shipping + tax;
    return { subtotal, discount, shipping, tax, total };
  }

  /* ---------- delivery estimate — real calendar dates, Fri/Sat weekend ---------- */
  function addBusinessDays(date, days){
    const d = new Date(date);
    let added = 0;
    while (added < days){
      d.setDate(d.getDate() + 1);
      const day = d.getDay(); // 0=Sun..6=Sat — Egypt weekend is Fri(5)/Sat(6)
      if (day !== 5 && day !== 6) added++;
    }
    return d;
  }
  function fmtDate(d){
    return d.toLocaleDateString('en-US', { weekday:'short', day:'numeric', month:'short' });
  }
  function deliveryEstimate(shippingMethod, from){
    const base = from ? new Date(from) : new Date();
    const min = addBusinessDays(base, shippingMethod.minDays);
    const max = addBusinessDays(base, shippingMethod.maxDays);
    return {
      minDate: min.toISOString(), maxDate: max.toISOString(),
      label: `${fmtDate(min)} – ${fmtDate(max)}`,
      days: `${shippingMethod.minDays} – ${shippingMethod.maxDays} business days`
    };
  }

  /* ---------- order id ---------- */
  function generateOrderId(){
    const n = Math.floor(100000 + Math.random() * 900000);
    return 'PR-' + n;
  }

  /* ---------- full-checkout validity, used to gate step access so a
     visitor can't jump ahead by editing the URL ---------- */
  function furthestAllowedStep(state, cart){
    if (!cart.length) return 'information'; // nothing to check out — send back
    if (!state.customer || !isFilled(state.customer.name) || !isEmail(state.customer.email) ||
        !isPhone(state.customer.phone) || !state.shippingAddress || !isFilled(state.shippingAddress.street) ||
        !isFilled(state.shippingAddress.city) || !isFilled(state.shippingAddress.governorate)){
      return 'information';
    }
    if (!state.shippingMethod) return 'shipping';
    if (!state.paymentMethod) return 'payment';
    return 'review';
  }
  function stepIndex(step){ return Math.max(0, STEPS.indexOf(step)); }
  function stepAllowed(step, state, cart){
    return stepIndex(step) <= stepIndex(furthestAllowedStep(state, cart));
  }

  /* ---------- order creation ----------
     Validates everything, calls the selected PaymentProvider (never
     assumes success), snapshots the cart, and persists the order.
     Returns { ok:true, order } or { ok:false, error }. */
  async function placeOrder(){
    await SHIPPING_METHODS_READY; // make sure the real prices are in before we price the order
    const cart = loadCart();
    const state = loadCheckoutState();

    if (!cart.length) return { ok:false, error:'Your bag is empty.' };
    if (furthestAllowedStep(state, cart) !== 'review') return { ok:false, error:'Please complete every step before placing your order.' };

    const provider = PaymentProviders[state.paymentMethod && state.paymentMethod.id];
    if (!provider || !provider.enabled) return { ok:false, error:'Please choose a valid payment method.' };

    const shippingMethod = SHIPPING_METHODS[state.shippingMethod.id];
    const promo = state.promo || null;
    const pricing = calculatePricing(cart, shippingMethod, promo);

    let paymentResult;
    try { paymentResult = await provider.process(); }
    catch(e){ return { ok:false, error: e.message || 'Payment could not be processed.' }; }

    let order = {
      id: generateOrderId(),
      createdAt: Date.now(),
      customer: state.customer,
      shippingAddress: state.shippingAddress,
      shippingMethod: { id: shippingMethod.id, label: shippingMethod.label, sub: shippingMethod.sub, price: shippingMethod.price },
      billingAddress: state.billingAddress && !state.billingAddress.sameAsShipping ? state.billingAddress : { sameAsShipping:true },
      paymentMethod: { id: provider.id, label: provider.label },
      notes: state.notes || '',
      items: cart.map(i => ({ id:i.id, name:i.name, variant:i.variant||'', price:i.price, img:i.img, qty:i.qty })),
      pricing,
      promo,
      paymentStatus: paymentResult.status,       // pending | processing | paid | failed | cancelled
      paymentNote: paymentResult.note || '',
      orderStatus: provider.id === 'cash_on_delivery' ? 'confirmed' : 'confirmed',
      delivery: deliveryEstimate(shippingMethod, Date.now())
    };

    // Save to the real database + fire shop/customer email + shop WhatsApp
    // notifications (all in one request — see api/orders.js). This never
    // blocks the sale itself: if the network/server hiccups, we still fall
    // back to saving the order locally so the customer sees success, just
    // flagged `_synced:false` so it's clear this one never reached the
    // server (only exists in this browser until someone notices and re-syncs).
    const synced = await syncOrder(order);
    if (synced.ok){
      order = synced.order;
      order._synced = true;
    } else {
      order._synced = false;
      order._notify = { ok:false, error: synced.error };
    }

    const orders = loadOrders();
    orders.push(order);
    saveOrders(orders);

    // order placed — clear the working checkout answers and the cart
    clearCheckoutState();
    try { localStorage.setItem(CART_KEY, JSON.stringify([])); } catch(e){}

    return { ok:true, order };
  }

  async function syncOrder(order){
    try {
      const resp = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) return { ok:false, error: data.error || ('Server responded ' + resp.status) };
      return { ok:true, order: data.order };
    } catch(e){
      // most likely: no backend deployed yet, or the visitor is offline.
      return { ok:false, error: e.message || 'Could not reach the server.' };
    }
  }

  /* Fetches an order by id from the server — used as a fallback when it
     isn't in this browser's localStorage (e.g. a different device, or a
     receipt link opened from an email). */
  async function fetchOrder(id){
    try {
      const resp = await fetch('/api/orders?id=' + encodeURIComponent(id));
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) return null;
      return data.order;
    } catch(e){
      return null;
    }
  }

  /* Server-first order lookup (so a dashboard status change — shipped,
     delivered, payment update — actually shows up when the customer
     reopens their receipt), falling back to this browser's local cache
     only if the server can't be reached (offline, or a brand-new order
     the API hasn't caught up on yet) — the one function
     order-success.html / receipt.html should call instead of
     getOrder() directly. */
  async function getOrderAnywhere(id){
    if (id) {
      const remote = await fetchOrder(id);
      if (remote) return remote;
      return getOrder(id);
    }
    return getLatestOrder();
  }

  window.TPRCheckout = {
    STEPS, GOVERNORATES, SHIPPING_METHODS, SHIPPING_METHODS_READY, PaymentProviders,
    loadCart, loadCheckoutState, saveCheckoutState, clearCheckoutState,
    loadOrders, getOrder, getLatestOrder, fetchOrder, getOrderAnywhere,
    money, isEmail, isPhone, isFilled,
    checkPromo, calculatePricing, deliveryEstimate, fmtDate,
    generateOrderId, furthestAllowedStep, stepAllowed, stepIndex,
    placeOrder
  };
})();
