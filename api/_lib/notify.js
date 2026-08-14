/* ============================================================
   THE PINK ROOM — order notifications
   Shared by /api/orders.js. Sends three notifications in parallel:
     1. Order-details email to the shop's own Gmail
     2. Order-confirmation email to the customer's entered email
     3. Order-details WhatsApp message to the shop's WhatsApp number
   One channel failing never blocks the others — each result is
   reported back separately so the caller can log (not block) on a
   partial failure.

   Required environment variables (set in Vercel → Project → Settings
   → Environment Variables, never committed to the repo):
     GMAIL_USER            e.g. thepinkroomeg@gmail.com
     GMAIL_APP_PASSWORD    16-character Gmail App Password (not the
                            normal account password — see BACKEND-SETUP.md)
     SHOP_NOTIFY_EMAIL     where the "new order" email goes (defaults
                            to GMAIL_USER if unset)
     CALLMEBOT_APIKEY      from callmebot.com — WhatsApp their bot number
                            once from the shop's WhatsApp to get this
     SHOP_WHATSAPP_TO      the shop's WhatsApp number that receives the
                            notification, with country code e.g.
                            +201207803666 (same number that sent the
                            CallMeBot activation message)
   ============================================================ */

const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { getSetting } = require('./settings');

const money = (n) => 'EGP ' + Math.round(Number(n) || 0).toLocaleString('en-US');
const GOLD = '#c9a97c';
const INK = '#1c1a17';
const CREAM = '#f8f4ee';

/* Dashboard-editable pieces of the notifications — subjects, the two
   short customer-facing lines, and the WhatsApp message. Deliberately
   NOT the whole HTML layout: these are safe to edit as plain strings
   (can't break the email's markup), while the branded template around
   them stays consistent. Read once per notifyOrder() call, falling
   back to these exact defaults if nothing's been configured, so
   behavior is unchanged until an admin actually edits something. */
const DEFAULT_TEMPLATES = {
  shopEmailSubject: '🔔 New Order #{orderId} — {total}',
  customerEmailSubject: 'Your Pink Room order #{orderId} is confirmed',
  customerEmailIntro: 'Your order has been placed and is being prepared.',
  customerEmailFooter: 'Questions about your order? WhatsApp us at {shopWhatsapp} or reply to this email.',
  whatsappTemplate: [
    '🛍️ *New Order — The Pink Room*',
    'Order #{orderId}',
    '',
    '👤 {customerName}',
    '📞 {customerPhone}',
    '✉️ {customerEmail}',
    '📍 {address}',
    '',
    '{items}',
    '',
    'Subtotal: {subtotal}',
    '{discountLine}',
    'Shipping: {shipping}',
    '*Total: {total}*',
    '',
    '💳 {paymentMethod} ({paymentStatus})',
    '🚚 {shippingMethod} — {deliveryLabel}',
    '{notesLine}'
  ].join('\n')
};

/* {placeholder} substitution — simple and predictable, no template
   engine dependency for a handful of fields. */
function fillTemplate(str, vars) {
  return String(str || '').replace(/\{(\w+)\}/g, (m, key) => (key in vars ? vars[key] : m));
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function itemsRowsHtml(items) {
  return items.map(i => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #e2d8c6;font-size:13px;color:${INK}">
        <b>${escapeHtml(i.name)}</b>${i.variant ? `<br><span style="color:#6b6459;font-size:11.5px">${escapeHtml(i.variant)}</span>` : ''}
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #e2d8c6;font-size:13px;color:${INK};text-align:center">${i.qty}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e2d8c6;font-size:13px;color:${INK};text-align:right">${money(i.price * i.qty)}</td>
    </tr>`).join('');
}
function pricingRowsHtml(p, promo) {
  let rows = `<tr><td style="padding:4px 8px;font-size:13px;color:#6b6459">Subtotal</td><td style="padding:4px 8px;font-size:13px;text-align:right">${money(p.subtotal)}</td></tr>`;
  if (p.discount) rows += `<tr><td style="padding:4px 8px;font-size:13px;color:#6b6459">Discount${promo ? ' (' + escapeHtml(promo.code) + ')' : ''}</td><td style="padding:4px 8px;font-size:13px;text-align:right;color:#5a7a52">&minus;${money(p.discount)}</td></tr>`;
  rows += `<tr><td style="padding:4px 8px;font-size:13px;color:#6b6459">Shipping</td><td style="padding:4px 8px;font-size:13px;text-align:right">${money(p.shipping)}</td></tr>`;
  rows += `<tr><td style="padding:10px 8px 4px;font-size:16px;font-weight:700;border-top:1.5px solid ${INK}">Total</td><td style="padding:10px 8px 4px;font-size:16px;font-weight:700;text-align:right;border-top:1.5px solid ${INK}">${money(p.total)}</td></tr>`;
  return rows;
}

function shopEmailHtml(order) {
  const c = order.customer, a = order.shippingAddress;
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:${CREAM};padding:28px 16px">
    <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2d8c6;border-radius:6px;overflow:hidden">
      <div style="background:${INK};padding:20px 24px">
        <p style="margin:0;color:${GOLD};font-size:11px;letter-spacing:2px">NEW ORDER RECEIVED</p>
        <h1 style="margin:6px 0 0;color:#fff;font-size:22px;font-weight:400">#${escapeHtml(order.id)}</h1>
      </div>
      <div style="padding:22px 24px">
        <table style="width:100%;border-collapse:collapse;margin-bottom:18px">
          <tr><td style="padding:4px 0;font-size:12px;color:#6b6459;width:140px">Customer</td><td style="padding:4px 0;font-size:13px"><b>${escapeHtml(c.name)}</b></td></tr>
          <tr><td style="padding:4px 0;font-size:12px;color:#6b6459">Phone</td><td style="padding:4px 0;font-size:13px"><a href="tel:${escapeHtml(c.phone)}">${escapeHtml(c.phone)}</a></td></tr>
          <tr><td style="padding:4px 0;font-size:12px;color:#6b6459">Email</td><td style="padding:4px 0;font-size:13px"><a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></td></tr>
          <tr><td style="padding:4px 0;font-size:12px;color:#6b6459;vertical-align:top">Address</td><td style="padding:4px 0;font-size:13px">${escapeHtml([a.street, a.apt].filter(Boolean).join(', '))}<br>${escapeHtml([a.city, a.governorate].filter(Boolean).join(', '))}, Egypt</td></tr>
          <tr><td style="padding:4px 0;font-size:12px;color:#6b6459">Shipping</td><td style="padding:4px 0;font-size:13px">${escapeHtml(order.shippingMethod.label)} (${escapeHtml(order.shippingMethod.sub)})</td></tr>
          <tr><td style="padding:4px 0;font-size:12px;color:#6b6459">Payment</td><td style="padding:4px 0;font-size:13px">${escapeHtml(order.paymentMethod.label)} &middot; <b>${escapeHtml(order.paymentStatus.toUpperCase())}</b></td></tr>
          ${order.notes ? `<tr><td style="padding:4px 0;font-size:12px;color:#6b6459;vertical-align:top">Notes</td><td style="padding:4px 0;font-size:13px">${escapeHtml(order.notes)}</td></tr>` : ''}
        </table>
        <table style="width:100%;border-collapse:collapse;margin-bottom:6px">
          <thead><tr>
            <th style="text-align:left;padding:6px 8px;font-size:10.5px;letter-spacing:1px;color:#fff;background:${INK}">ITEM</th>
            <th style="text-align:center;padding:6px 8px;font-size:10.5px;letter-spacing:1px;color:#fff;background:${INK}">QTY</th>
            <th style="text-align:right;padding:6px 8px;font-size:10.5px;letter-spacing:1px;color:#fff;background:${INK}">TOTAL</th>
          </tr></thead>
          <tbody>${itemsRowsHtml(order.items)}</tbody>
        </table>
        <table style="width:100%;border-collapse:collapse">${pricingRowsHtml(order.pricing, order.promo)}</table>
      </div>
    </div>
  </div>`;
}

function customerEmailHtml(order, tpl, storeSettings) {
  const c = order.customer, a = order.shippingAddress;
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:${CREAM};padding:28px 16px">
    <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2d8c6;border-radius:6px;overflow:hidden">
      <div style="background:${INK};padding:28px 24px;text-align:center">
        <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:13px;letter-spacing:3px;color:${GOLD}">THE PINK ROOM</p>
        <h1 style="margin:0;color:#fff;font-size:23px;font-weight:400;font-style:italic">Thank you, ${escapeHtml(c.name.split(' ')[0] || c.name)}!</h1>
        <p style="margin:10px 0 0;color:rgba(255,255,255,.7);font-size:13px">${escapeHtml(tpl.customerEmailIntro)}</p>
      </div>
      <div style="padding:22px 24px">
        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;background:${CREAM};border-radius:4px">
          <tr><td style="padding:12px 14px;font-size:11px;letter-spacing:1px;color:#6b6459">ORDER NUMBER</td><td style="padding:12px 14px;font-size:14px;font-weight:700;text-align:right;color:${GOLD}">#${escapeHtml(order.id)}</td></tr>
          <tr><td style="padding:0 14px 12px;font-size:11px;letter-spacing:1px;color:#6b6459">ESTIMATED DELIVERY</td><td style="padding:0 14px 12px;font-size:13px;text-align:right">${escapeHtml(order.delivery.days)}</td></tr>
        </table>
        <table style="width:100%;border-collapse:collapse;margin-bottom:6px">
          <thead><tr>
            <th style="text-align:left;padding:6px 8px;font-size:10.5px;letter-spacing:1px;color:#fff;background:${INK}">ITEM</th>
            <th style="text-align:center;padding:6px 8px;font-size:10.5px;letter-spacing:1px;color:#fff;background:${INK}">QTY</th>
            <th style="text-align:right;padding:6px 8px;font-size:10.5px;letter-spacing:1px;color:#fff;background:${INK}">TOTAL</th>
          </tr></thead>
          <tbody>${itemsRowsHtml(order.items)}</tbody>
        </table>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">${pricingRowsHtml(order.pricing, order.promo)}</table>
        <p style="font-size:12px;color:#6b6459;line-height:1.8;margin-bottom:4px"><b style="color:${INK}">Delivery address:</b><br>${escapeHtml([a.street, a.apt].filter(Boolean).join(', '))}, ${escapeHtml([a.city, a.governorate].filter(Boolean).join(', '))}, Egypt</p>
        <p style="font-size:12px;color:#6b6459;line-height:1.8;margin-bottom:20px"><b style="color:${INK}">Payment method:</b> ${escapeHtml(order.paymentMethod.label)}</p>
        <p style="font-size:12.5px;color:#6b6459;line-height:1.8;text-align:center;border-top:1px solid #e2d8c6;padding-top:16px">${fillTemplate(escapeHtml(tpl.customerEmailFooter), { shopWhatsapp: `<a href="https://wa.me/${String((storeSettings && storeSettings.whatsapp) || '+201207803666').replace(/[^0-9]/g, '')}" style="color:${GOLD}">${escapeHtml((storeSettings && storeSettings.whatsapp) || '+20 120 780 3666')}</a>` })}</p>
      </div>
    </div>
  </div>`;
}

function whatsappText(order, tpl) {
  const c = order.customer, a = order.shippingAddress, p = order.pricing;
  const items = order.items.map(i => `• ${i.name}${i.variant ? ' (' + i.variant + ')' : ''} x${i.qty} — ${money(i.price * i.qty)}`).join('\n');
  const filled = fillTemplate(tpl.whatsappTemplate, {
    orderId: order.id,
    customerName: c.name,
    customerPhone: c.phone,
    customerEmail: c.email || '—',
    address: `${[a.street, a.apt].filter(Boolean).join(', ')}, ${[a.city, a.governorate].filter(Boolean).join(', ')}, Egypt`,
    items,
    subtotal: money(p.subtotal),
    discountLine: p.discount ? `Discount: -${money(p.discount)}` : '',
    shipping: money(p.shipping),
    total: money(p.total),
    paymentMethod: order.paymentMethod.label,
    paymentStatus: order.paymentStatus,
    shippingMethod: order.shippingMethod.label,
    deliveryLabel: order.delivery.label,
    notesLine: order.notes ? `📝 ${order.notes}` : ''
  });
  // collapse the up-to-two blank lines left behind when discountLine/notesLine were empty
  return filled.replace(/\n{3,}/g, '\n\n').trim();
}

async function sendEmails(order, tpl, storeSettings) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD not configured.');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });

  const shopTo = process.env.SHOP_NOTIFY_EMAIL || user;
  const results = {};
  const vars = { orderId: order.id, total: money(order.pricing.total) };

  results.shopEmail = await transporter.sendMail({
    from: `"The Pink Room" <${user}>`,
    to: shopTo,
    subject: fillTemplate(tpl.shopEmailSubject, vars),
    html: shopEmailHtml(order)
  }).then(() => ({ ok: true })).catch(e => ({ ok: false, error: e.message }));

  if (order.customer && order.customer.email) {
    results.customerEmail = await transporter.sendMail({
      from: `"The Pink Room" <${user}>`,
      to: order.customer.email,
      subject: fillTemplate(tpl.customerEmailSubject, vars),
      html: customerEmailHtml(order, tpl, storeSettings)
    }).then(() => ({ ok: true })).catch(e => ({ ok: false, error: e.message }));
  } else {
    results.customerEmail = { ok: false, error: 'No customer email provided.' };
  }

  return results;
}

/* Sent via CallMeBot (callmebot.com) — a free, no-signup WhatsApp relay for
   personal/small-business use: you WhatsApp their bot number once to
   authorize your own number, it replies with an API key, and from then on
   a plain GET request to this endpoint delivers a text message to that same
   number. No Meta developer account / business verification needed. */
async function sendWhatsapp(order, tpl) {
  const apiKey = process.env.CALLMEBOT_APIKEY;
  const to = process.env.SHOP_WHATSAPP_TO;
  if (!apiKey || !to) throw new Error('CALLMEBOT_APIKEY / SHOP_WHATSAPP_TO not configured.');

  const url = 'https://api.callmebot.com/whatsapp.php?' + new URLSearchParams({
    phone: to,
    text: whatsappText(order, tpl),
    apikey: apiKey
  }).toString();

  const resp = await fetch(url);
  const text = await resp.text().catch(() => '');
  if (!resp.ok || /error|invalid|not allowed/i.test(text)) {
    throw new Error(text || `CallMeBot responded ${resp.status}`);
  }
  return { status: text };
}

/* Fires all three notifications in parallel. Never throws — every failure
   is captured per-channel in the returned object. */
async function notifyOrder(order) {
  // never let a template-loading hiccup block the notification itself —
  // fall straight back to the exact defaults if settings can't be read
  const tpl = await getSetting('notification_templates', DEFAULT_TEMPLATES).catch(() => DEFAULT_TEMPLATES);
  const merged = { ...DEFAULT_TEMPLATES, ...tpl }; // fills in any field an older/partial saved template is missing
  // same Store Settings (Dashboard) WhatsApp number the storefront shows —
  // so the customer email's "chat with us" link matches the real number
  const storeSettings = await getSetting('store_settings', { whatsapp: '+201207803666' }).catch(() => ({ whatsapp: '+201207803666' }));

  const [emailResult, whatsappResult] = await Promise.allSettled([
    sendEmails(order, merged, storeSettings),
    sendWhatsapp(order, merged)
  ]);

  return {
    shopEmail: emailResult.status === 'fulfilled' ? emailResult.value.shopEmail : { ok: false, error: emailResult.reason.message },
    customerEmail: emailResult.status === 'fulfilled' ? emailResult.value.customerEmail : { ok: false, error: emailResult.reason.message },
    whatsapp: whatsappResult.status === 'fulfilled' ? { ok: true } : { ok: false, error: whatsappResult.reason.message }
  };
}

/* ============================================================
   Newsletter — the homepage "Stay Inspired" form (api/products.js's
   ?action=newsletter-subscribe) and the "notify subscribers" checkbox
   on the product form (api/admin/products.js). Reuses the same Gmail
   transporter/credentials as order emails — no separate setup needed.
   ============================================================ */

/* Every unsubscribe link is signed so nobody can unsubscribe someone
   else's email by guessing it — HMAC over the email using the same
   session secret already required for the dashboard, with a distinct
   prefix so this token can never be replayed as a login session or
   vice versa. */
function unsubscribeToken(email) {
  const secret = process.env.ADMIN_SESSION_SECRET || '';
  return crypto.createHmac('sha256', 'newsletter-unsub:' + secret).update(email.toLowerCase()).digest('hex');
}
function verifyUnsubscribeToken(email, token) {
  if (!email || !token) return false;
  const expected = unsubscribeToken(email);
  const a = Buffer.from(token), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return { user, transporter: nodemailer.createTransport({ service: 'gmail', auth: { user, pass } }) };
}

function unsubscribeFooter(email, baseUrl) {
  const token = unsubscribeToken(email);
  const link = `${baseUrl}/api/products?action=newsletter-unsubscribe&email=${encodeURIComponent(email)}&token=${token}`;
  return `<p style="font-size:11px;color:#9a9184;text-align:center;margin-top:24px">
    You're receiving this because you subscribed at The Pink Room.
    <a href="${link}" style="color:#9a9184">Unsubscribe</a>
  </p>`;
}

async function sendNewsletterWelcome(email, baseUrl) {
  const t = getTransporter();
  if (!t) return { ok: false, error: 'GMAIL_USER / GMAIL_APP_PASSWORD not configured.' };
  try {
    await t.transporter.sendMail({
      from: `"The Pink Room" <${t.user}>`,
      to: email,
      subject: "You're in — welcome to The Pink Room",
      html: `<div style="font-family:Arial,Helvetica,sans-serif;background:${CREAM};padding:28px 16px">
        <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2d8c6;border-radius:6px;overflow:hidden">
          <div style="background:${INK};padding:26px 24px;text-align:center">
            <p style="margin:0;font-family:Georgia,serif;font-size:13px;letter-spacing:3px;color:${GOLD}">THE PINK ROOM</p>
            <h1 style="margin:10px 0 0;color:#fff;font-size:20px;font-weight:400;font-style:italic">Welcome to The Room</h1>
          </div>
          <div style="padding:24px;text-align:center">
            <p style="font-size:13px;color:#3a362f;line-height:1.8">You'll be the first to know about new arrivals, styling ideas and exclusive offers.</p>
          </div>
        </div>
        ${unsubscribeFooter(email, baseUrl)}
      </div>`
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/* Sent to every active subscriber when the admin ticks "notify
   subscribers" while saving a product. One send per recipient (not a
   single email with everyone BCC'd — keeps each unsubscribe link
   correctly scoped to that one address) — fine at small-list scale;
   Gmail's own sending caps are the real ceiling if this list grows
   large, at which point a dedicated bulk-email provider would be the
   next step, not a code change here. */
async function notifySubscribersNewProduct(product, emails, baseUrl) {
  const t = getTransporter();
  if (!t) return { ok: false, error: 'GMAIL_USER / GMAIL_APP_PASSWORD not configured.', sent: 0 };

  const img = (product.images && product.images[0]) || '';
  const priceHtml = product.salePrice != null
    ? `${money(product.salePrice)} <span style="text-decoration:line-through;color:#9a9184">${money(product.price)}</span>`
    : (product.price != null ? money(product.price) : '');
  const productUrl = `${baseUrl}/product.html?slug=${encodeURIComponent(product.slug)}`;

  let sent = 0, failed = 0;
  await Promise.all(emails.map(email =>
    t.transporter.sendMail({
      from: `"The Pink Room" <${t.user}>`,
      to: email,
      subject: `New at The Pink Room: ${product.name}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;background:${CREAM};padding:28px 16px">
        <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2d8c6;border-radius:6px;overflow:hidden">
          <div style="background:${INK};padding:20px 24px;text-align:center">
            <p style="margin:0;font-family:Georgia,serif;font-size:12px;letter-spacing:3px;color:${GOLD}">THE PINK ROOM</p>
          </div>
          ${img ? `<img src="${img}" alt="${product.name}" style="width:100%;display:block">` : ''}
          <div style="padding:22px 24px;text-align:center">
            <h1 style="margin:0 0 8px;font-size:19px;font-weight:400;color:${INK}">${product.name}</h1>
            <p style="font-size:15px;color:${INK};margin-bottom:18px">${priceHtml}</p>
            <a href="${productUrl}" style="display:inline-block;background:${INK};color:#fff;padding:12px 28px;font-size:11px;letter-spacing:1.6px;text-decoration:none;border-radius:2px">SHOP NOW</a>
          </div>
        </div>
        ${unsubscribeFooter(email, baseUrl)}
      </div>`
    }).then(() => { sent++; }).catch(() => { failed++; })
  ));

  return { ok: true, sent, failed };
}

module.exports = {
  notifyOrder,
  sendNewsletterWelcome, notifySubscribersNewProduct,
  unsubscribeToken, verifyUnsubscribeToken
};
