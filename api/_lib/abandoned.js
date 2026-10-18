/* ============================================================
   THE PINK ROOM — Abandoned Cart Recovery
   Shared by api/orders.js (public capture / restore / unsubscribe /
   reminder-cron actions, plus marking a cart recovered when an order is
   placed) and api/admin/orders.js (?action=abandoned, the dashboard list).
   Lives in the existing functions rather than a new /api file to stay
   under Vercel Hobby's serverless-function-per-deployment cap.

   Flow:
     1. checkout.html — the moment a valid email OR phone is typed, the
        bag + contact details are POSTed (captureCart). Re-sent whenever
        they change, always onto the same row (by token).
     2. A cron calls runReminders() every ~15 min. Per cart, at most:
          reminder 1  ~1h   after last activity — simple nudge
          reminder 2  ~24h  — second nudge
          reminder 3  ~48h  — includes a one-time discount code
        Each one carries a link that rebuilds that exact bag in the
        shopper's browser (restorePage) and opens checkout.
     3. Placing an order (markRecovered, called from createOrder) flips the
        cart to 'recovered' instantly, and every reminder run re-checks the
        orders table first anyway — so nobody who bought gets nagged.

   Channels: email via the same Gmail transporter as order emails;
   WhatsApp via Meta's official WhatsApp Cloud API (CallMeBot can only
   message the shop's own number, never a customer). WhatsApp is skipped
   — not failed — until these are set:
     WHATSAPP_TOKEN             permanent System User access token
     WHATSAPP_PHONE_NUMBER_ID   the sending number's id (Meta → WhatsApp → API Setup)
     WHATSAPP_TEMPLATE_LANG     optional, defaults to "ar"
     WHATSAPP_TPL_CART_1/2/3    optional template names, default
                                cart_reminder_1 / cart_reminder_2 / cart_reminder_3
   Cron auth: CRON_SECRET (Vercel Cron sends it as a Bearer token
   automatically; an external cron passes ?key=CRON_SECRET).
   ============================================================ */
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { sql } = require('./db');
const { getSetting } = require('./settings');

const money = (n) => 'EGP ' + Math.round(Number(n) || 0).toLocaleString('en-US');
const GOLD = '#c9a97c', INK = '#1c1a17', CREAM = '#f8f4ee';

const DEFAULT_SETTINGS = {
  enabled: true,
  delay1Hours: 0.5,
  delay2Hours: 24,
  delay3Hours: 72,
  discountPercent: 10,
  discountValidDays: 3,
  channels: { email: true, whatsapp: true }
};
// a cart nobody came back for is closed this long after its last reminder,
// so the dashboard's "pending" only ever means "still being worked on"
const EXPIRE_AFTER_LAST_HOURS = 72;
const BATCH = 40; // per cron run — keeps one run well inside the function timeout + Gmail's pace

/* Creates the table on first use — same DDL as db/schema.sql — so the
   feature works on a fresh deploy even before `node db/migrate.js` has
   been run. Cached per warm instance, so it's one cheap query per cold start. */
let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS abandoned_carts (
          id bigserial PRIMARY KEY, token text UNIQUE NOT NULL,
          name text, email text, phone text,
          items jsonb NOT NULL DEFAULT '[]'::jsonb, subtotal numeric NOT NULL DEFAULT 0,
          status text NOT NULL DEFAULT 'pending', reminders_sent integer NOT NULL DEFAULT 0,
          last_reminder_at timestamptz, reminder_log jsonb NOT NULL DEFAULT '[]'::jsonb,
          discount_code text, recovered_order_id text, recovered_at timestamptz,
          link_clicks integer NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_abandoned_status ON abandoned_carts (status, updated_at)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_abandoned_email ON abandoned_carts (lower(email))`;
      await sql`CREATE INDEX IF NOT EXISTS idx_abandoned_phone ON abandoned_carts (phone)`;
    })().catch(e => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

/* The secret the reminder cron must present. CRON_SECRET if set;
   otherwise one derived from ADMIN_SESSION_SECRET (already configured),
   so the cron works without adding a new env var. Shown to the signed-in
   admin on the Abandoned Carts page to paste into cron-job.org. */
function cronKey() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  const base = process.env.ADMIN_SESSION_SECRET;
  return base ? crypto.createHmac('sha256', 'abandoned-cron:' + base).digest('hex').slice(0, 40) : null;
}

async function loadSettings() {
  const s = await getSetting('abandoned_cart', DEFAULT_SETTINGS).catch(() => DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...s, channels: { ...DEFAULT_SETTINGS.channels, ...(s && s.channels) } };
}

/* ---------- input cleaning ---------- */
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
const phoneDigits = v => String(v || '').replace(/\D/g, '');
const clip = (v, n) => (v == null ? null : String(v).trim().slice(0, n) || null);

/* The bag is stored exactly as shared-ui.js keeps it in localStorage, so
   the restore link can drop it straight back in — but only plain fields
   of a sane size, nothing a crafted request could abuse. */
const ITEM_KEYS = ['id', 'name', 'variant', 'color', 'size', 'price', 'img', 'qty', 'weight', 'slug', 'category'];
function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 100).filter(i => i && i.id).map(i => {
    const out = {};
    for (const k of ITEM_KEYS) {
      const v = i[k];
      if (v == null) continue;
      if (typeof v === 'number') out[k] = v;
      else if (typeof v === 'string') out[k] = v.slice(0, 600);
    }
    out.qty = Math.max(1, Math.min(999, Math.round(Number(out.qty) || 1)));
    out.price = Number(out.price) || 0;
    return out;
  });
}

function newToken() { return crypto.randomBytes(18).toString('base64url'); }

/* POST ?action=cart-capture  { token?, name, email, phone, items }
   Returns { token } — the browser keeps it and sends it on every update. */
async function captureCart(body) {
  await ensureSchema();
  const email = isEmail(body.email) ? String(body.email).trim().toLowerCase().slice(0, 200) : null;
  const phone = phoneDigits(body.phone).length >= 8 ? clip(body.phone, 30) : null;
  if (!email && !phone) return { error: 'An email or phone number is required.' };

  const items = cleanItems(body.items);
  if (!items.length) return { error: 'Cart is empty.' };
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const name = clip(body.name, 120);

  let token = typeof body.token === 'string' && /^[A-Za-z0-9_-]{10,60}$/.test(body.token) ? body.token : null;
  if (token) {
    const rows = await sql`
      UPDATE abandoned_carts SET
        name = COALESCE(${name}, name), email = COALESCE(${email}, email), phone = COALESCE(${phone}, phone),
        items = ${JSON.stringify(items)}::jsonb, subtotal = ${subtotal}, updated_at = now()
      WHERE token = ${token} AND status = 'pending'
      RETURNING id
    `;
    if (rows.length) { await closeDuplicates(token, email, phone); return { token }; }
    token = null; // recovered/expired/unknown — this is a new shopping session
  }

  token = newToken();
  await sql`
    INSERT INTO abandoned_carts (token, name, email, phone, items, subtotal)
    VALUES (${token}, ${name}, ${email}, ${phone}, ${JSON.stringify(items)}::jsonb, ${subtotal})
  `;
  await closeDuplicates(token, email, phone);
  return { token };
}

/* One shopper, one live reminder sequence: an older pending cart for the
   same email/phone (another device, cleared storage) is closed as soon as
   a newer one exists, so they never get two parallel sets of messages. */
async function closeDuplicates(token, email, phone) {
  const digits = phoneDigits(phone);
  await sql`
    UPDATE abandoned_carts SET status = 'expired', updated_at = now()
    WHERE status = 'pending' AND token <> ${token}
      AND ((${email}::text IS NOT NULL AND lower(email) = ${email})
        OR (${digits}::text <> '' AND regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = ${digits}))
  `;
}

/* Called from createOrder right after the order row is saved. Matches by
   the cart token the checkout sent along, and also by email/phone so a
   purchase from a different device still stops the reminders. */
async function markRecovered(order) {
  await ensureSchema();
  const token = typeof order.cartToken === 'string' ? order.cartToken : '';
  const email = order.customer && isEmail(order.customer.email) ? String(order.customer.email).trim().toLowerCase() : null;
  const digits = phoneDigits(order.customer && order.customer.phone);
  await sql`
    UPDATE abandoned_carts SET status = 'recovered', recovered_order_id = ${order.id}, recovered_at = now(), updated_at = now()
    WHERE status IN ('pending', 'expired')
      AND created_at > now() - interval '30 days'
      AND (token = ${token}
        OR (${email}::text IS NOT NULL AND lower(email) = ${email})
        OR (${digits}::text <> '' AND regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = ${digits}))
      AND (status = 'pending' OR token = ${token}) -- an expired cart only counts if it's this exact session
  `;
}

/* ---------- discount code for reminder 3 ---------- */
async function createDiscountCode(cart, settings) {
  const pct = Math.max(1, Math.min(90, Number(settings.discountPercent) || 10));
  const days = Math.max(1, Number(settings.discountValidDays) || 3);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = 'BACK' + crypto.randomBytes(3).toString('hex').toUpperCase();
    try {
      await sql`
        INSERT INTO coupons (code, type, value, label, usage_limit, expires_at, active)
        VALUES (${code}, 'percent', ${pct}, ${pct + '% off — welcome back'}, 1, now() + ${days}::float8 * interval '1 day', true)
      `;
      return { code, pct, days };
    } catch (e) {
      if (!/duplicate key/i.test(e.message || '')) throw e;
    }
  }
  throw new Error('Could not generate a unique discount code.');
}

/* ---------- message content ---------- */
const COPY = {
  1: { subject: 'You left something beautiful behind', heading: 'Still thinking it over?',
       body: 'Your bag at The Pink Room is saved and waiting for you — pick up right where you left off.' },
  2: { subject: 'Your bag is still waiting at The Pink Room', heading: 'Your pieces are still here',
       body: 'We kept your bag exactly as you left it. Popular pieces can sell out, so complete your order while they are still available.' },
  3: { subject: 'A little something to bring you back — {pct}% off', heading: 'A gift to complete your order',
       body: 'Here is {pct}% off your bag with a one-time code, valid for {days} days.' }
};
function fill(str, vars) { return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : '')); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function absImg(src, baseUrl) {
  if (!src) return '';
  return /^https?:\/\//i.test(src) ? src : baseUrl + '/' + String(src).replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
}

function emailHtml(cart, step, links, vars, baseUrl) {
  const c = COPY[step];
  const items = (typeof cart.items === 'string' ? JSON.parse(cart.items) : cart.items) || [];
  const rows = items.slice(0, 6).map(i => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #eee5d6;width:64px">${i.img ? `<img src="${esc(absImg(i.img, baseUrl))}" width="56" height="56" style="display:block;width:56px;height:56px;object-fit:cover;border-radius:3px" alt="">` : ''}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee5d6;font-size:13px;color:${INK}">${esc(i.name)}${i.variant ? `<br><span style="color:#9a9184;font-size:11.5px">${esc(i.variant)}</span>` : ''}<br><span style="color:#9a9184;font-size:11.5px">Qty ${i.qty}</span></td>
      <td style="padding:10px 0;border-bottom:1px solid #eee5d6;font-size:13px;color:${INK};text-align:right;white-space:nowrap">${money(i.price * i.qty)}</td>
    </tr>`).join('');
  const codeBlock = step === 3 && vars.code ? `
    <div style="margin:20px 0;padding:16px;border:1px dashed ${GOLD};border-radius:4px;text-align:center">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;color:#9a9184">YOUR CODE</p>
      <p style="margin:0;font-family:Georgia,serif;font-size:22px;letter-spacing:3px;color:${INK}">${esc(vars.code)}</p>
      <p style="margin:6px 0 0;font-size:11.5px;color:#9a9184">Applied automatically when you return · single use · ${vars.days} days</p>
    </div>` : '';
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:${CREAM};padding:28px 16px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2d8c6;border-radius:6px;overflow:hidden">
      <div style="background:${INK};padding:24px;text-align:center">
        <p style="margin:0;font-family:Georgia,serif;font-size:13px;letter-spacing:3px;color:${GOLD}">THE PINK ROOM</p>
        <h1 style="margin:10px 0 0;color:#fff;font-size:20px;font-weight:400;font-style:italic">${esc(fill(c.heading, vars))}</h1>
      </div>
      <div style="padding:24px">
        <p style="font-size:13.5px;color:#3a362f;line-height:1.8;margin:0 0 6px">${cart.name ? 'Hi ' + esc(String(cart.name).split(' ')[0]) + ',' : 'Hi,'}</p>
        <p style="font-size:13.5px;color:#3a362f;line-height:1.8;margin:0 0 14px">${esc(fill(c.body, vars))}</p>
        ${codeBlock}
        <table style="width:100%;border-collapse:collapse">${rows}</table>
        <p style="text-align:right;font-size:14px;color:${INK};margin:14px 0 22px"><b>Subtotal: ${money(cart.subtotal)}</b></p>
        <div style="text-align:center">
          <a href="${links.restore}" style="display:inline-block;background:${INK};color:#fff;padding:14px 34px;font-size:11.5px;letter-spacing:1.8px;text-decoration:none;border-radius:2px">RETURN TO MY BAG</a>
        </div>
      </div>
    </div>
    <p style="font-size:11px;color:#9a9184;text-align:center;margin-top:20px">
      You're receiving this because you started a checkout at The Pink Room.
      <a href="${links.unsubscribe}" style="color:#9a9184">Stop these reminders</a>
    </p>
  </div>`;
}

let transporterCache = null;
function getTransporter() {
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  if (!transporterCache) transporterCache = { user, t: nodemailer.createTransport({ service: 'gmail', auth: { user, pass } }) };
  return transporterCache;
}

async function sendEmail(cart, step, links, vars, baseUrl) {
  if (!cart.email) return { skipped: true, reason: 'no email' };
  const tr = getTransporter();
  if (!tr) return { ok: false, error: 'GMAIL_USER / GMAIL_APP_PASSWORD not configured.' };
  try {
    await tr.t.sendMail({
      from: `"The Pink Room" <${tr.user}>`,
      to: cart.email,
      subject: fill(COPY[step].subject, vars),
      html: emailHtml(cart, step, links, vars, baseUrl),
      headers: { 'List-Unsubscribe': `<${links.unsubscribe}>` }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/* WhatsApp Cloud API — business-initiated messages must use a template
   Meta has approved. Each template's body takes, in order:
     {{1}} first name   {{2}} bag total   {{3}} return-to-bag link
   and reminder 3's template adds {{4}} the discount code, {{5}} the percent.
   Egyptian numbers typed as "+20 1XXXXXXXXX" become "201XXXXXXXXX". */
async function sendWhatsapp(cart, step, links, vars) {
  const token = process.env.WHATSAPP_TOKEN, phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { skipped: true, reason: 'WhatsApp Cloud API not configured' };
  let to = phoneDigits(cart.phone);
  if (!to) return { skipped: true, reason: 'no phone' };
  if (to.startsWith('0')) to = '20' + to.slice(1);

  const params = [
    (cart.name ? String(cart.name).split(' ')[0] : 'there'),
    money(cart.subtotal),
    links.restore
  ];
  if (step === 3) params.push(vars.code || '', String(vars.pct || ''));

  const template = process.env['WHATSAPP_TPL_CART_' + step] || ('cart_reminder_' + step);
  try {
    const resp = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'ar' },
          components: [{ type: 'body', parameters: params.map(text => ({ type: 'text', text })) }]
        }
      })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: (data.error && data.error.message) || ('WhatsApp API responded ' + resp.status) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/* ---------- the cron ---------- */
async function hasOrderSince(cart) {
  const email = cart.email ? String(cart.email).toLowerCase() : null;
  const digits = phoneDigits(cart.phone);
  const rows = await sql`
    SELECT id FROM orders
    WHERE created_at >= ${cart.created_at}
      AND ((${email}::text IS NOT NULL AND lower(customer_email) = ${email})
        OR (${digits}::text <> '' AND regexp_replace(coalesce(customer_phone,''), '[^0-9]', '', 'g') = ${digits}))
    ORDER BY created_at ASC LIMIT 1
  `;
  return rows.length ? rows[0].id : null;
}

async function runReminders(baseUrl) {
  await ensureSchema();
  const settings = await loadSettings();
  const summary = { checked: 0, sent: [], recovered: 0, expired: 0, errors: [] };
  if (!settings.enabled) return { ...summary, disabled: true };

  const d1 = Number(settings.delay1Hours) || 0.5, d2 = Number(settings.delay2Hours) || 24, d3 = Number(settings.delay3Hours) || 72;

  // close out carts whose sequence finished long enough ago
  const exp = await sql`
    UPDATE abandoned_carts SET status = 'expired', updated_at = now()
    WHERE status = 'pending' AND reminders_sent >= 3 AND last_reminder_at < now() - ${EXPIRE_AFTER_LAST_HOURS}::float8 * interval '1 hour'
    RETURNING id
  `;
  summary.expired = exp.length;

  // due = waited long enough since the shopper's last activity for the next step
  const due = await sql`
    SELECT * FROM abandoned_carts
    WHERE status = 'pending' AND reminders_sent < 3
      AND (
        (reminders_sent = 0 AND updated_at <= now() - ${d1}::float8 * interval '1 hour') OR
        (reminders_sent = 1 AND updated_at <= now() - ${d2}::float8 * interval '1 hour') OR
        (reminders_sent = 2 AND updated_at <= now() - ${d3}::float8 * interval '1 hour')
      )
    ORDER BY updated_at ASC
    LIMIT ${BATCH}
  `;

  for (const cart of due) {
    summary.checked++;
    try {
      const orderId = await hasOrderSince(cart);
      if (orderId) {
        await sql`UPDATE abandoned_carts SET status = 'recovered', recovered_order_id = ${orderId}, recovered_at = now() WHERE id = ${cart.id}`;
        summary.recovered++;
        continue;
      }

      // claim the step first, so two overlapping cron runs can never send the same reminder twice
      const step = cart.reminders_sent + 1;
      const claimed = await sql`
        UPDATE abandoned_carts SET reminders_sent = ${step}, last_reminder_at = now()
        WHERE id = ${cart.id} AND reminders_sent = ${cart.reminders_sent} AND status = 'pending'
        RETURNING id
      `;
      if (!claimed.length) continue;

      const vars = {};
      if (step === 3) {
        const d = cart.discount_code ? { code: cart.discount_code, pct: settings.discountPercent, days: settings.discountValidDays } : await createDiscountCode(cart, settings);
        Object.assign(vars, d);
        if (!cart.discount_code) await sql`UPDATE abandoned_carts SET discount_code = ${d.code} WHERE id = ${cart.id}`;
      }
      const links = {
        restore: `${baseUrl}/api/orders?action=cart-restore&t=${cart.token}&s=${step}`,
        unsubscribe: `${baseUrl}/api/orders?action=cart-unsubscribe&t=${cart.token}`
      };

      const [email, whatsapp] = await Promise.all([
        settings.channels.email ? sendEmail(cart, step, links, vars, baseUrl) : { skipped: true, reason: 'channel off' },
        settings.channels.whatsapp ? sendWhatsapp(cart, step, links, vars) : { skipped: true, reason: 'channel off' }
      ]);
      const entry = { step, at: Date.now(), email, whatsapp };
      await sql`UPDATE abandoned_carts SET reminder_log = reminder_log || ${JSON.stringify([entry])}::jsonb WHERE id = ${cart.id}`;
      summary.sent.push({ id: cart.id, step, email: email.ok ? 'ok' : (email.skipped ? 'skipped' : 'failed'), whatsapp: whatsapp.ok ? 'ok' : (whatsapp.skipped ? 'skipped' : 'failed') });
    } catch (e) {
      console.error('[abandoned] reminder failed for cart', cart.id, e);
      summary.errors.push({ id: cart.id, error: e.message });
    }
  }
  return summary;
}

/* Runs the reminder job only if nobody has in the last few minutes —
   the claim is one atomic upsert on the settings table, so many
   concurrent visitors still trigger exactly one run. */
const RUN_EVERY_MINUTES = 5;
async function runRemindersIfDue(baseUrl) {
  const claimed = await sql`
    INSERT INTO settings (key, value, updated_at) VALUES ('abandoned_cart_last_run', '{}'::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET updated_at = now()
      WHERE settings.updated_at < now() - ${RUN_EVERY_MINUTES}::float8 * interval '1 minute'
    RETURNING key
  `;
  if (!claimed.length) return null;
  return runReminders(baseUrl);
}

/* ---------- the "return to my bag" link ----------
   Answers with a tiny page that writes the saved bag (and the contact
   details, and reminder 3's code) back into this browser's localStorage
   — the same keys shared-ui.js / checkout.js read — then opens checkout.
   Works on any device: the bag comes from the database, not the browser
   that abandoned it. */
async function restorePage(token, step) {
  await ensureSchema();
  const rows = token ? await sql`SELECT * FROM abandoned_carts WHERE token = ${token} LIMIT 1` : [];
  if (!rows.length) return { redirect: '/shop' };
  const cart = rows[0];
  if (cart.status === 'recovered') return { redirect: '/shop' };
  await sql`UPDATE abandoned_carts SET link_clicks = link_clicks + 1 WHERE id = ${cart.id}`;

  const items = typeof cart.items === 'string' ? JSON.parse(cart.items) : cart.items;
  const payload = {
    token: cart.status === 'pending' ? cart.token : null,
    items,
    customer: { name: cart.name || '', email: cart.email || '', phone: cart.phone || '' },
    promo: cart.discount_code || null
  };
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>The Pink Room</title></head><body style="font-family:Arial,sans-serif;background:${CREAM};color:${INK};text-align:center;padding-top:30vh">
<p style="letter-spacing:3px;font-size:13px">THE PINK ROOM</p><p style="font-size:13px;color:#9a9184">Restoring your bag…</p>
<script>
(function(){
  var d = ${json};
  try {
    localStorage.setItem('tpr_cart_v1', JSON.stringify(d.items || []));
    if (d.token) localStorage.setItem('tpr_cart_token', d.token);
    var st = {}; try { st = JSON.parse(localStorage.getItem('tpr_checkout_v1')) || {}; } catch(e){}
    st.customer = st.customer || {};
    ['name','email','phone'].forEach(function(k){ if (!st.customer[k] && d.customer[k]) st.customer[k] = d.customer[k]; });
    localStorage.setItem('tpr_checkout_v1', JSON.stringify(st));
    if (d.promo) localStorage.setItem('tpr_pending_promo', d.promo);
  } catch(e){}
  location.replace('/checkout');
})();
</script></body></html>`;
  return { html };
}

async function unsubscribe(token) {
  await ensureSchema();
  if (!token) return false;
  await sql`UPDATE abandoned_carts SET status = 'unsubscribed', updated_at = now() WHERE token = ${token} AND status = 'pending'`;
  return true;
}

/* Permanently removes one cart — by id from the dashboard's Delete
   button, or by its secret token. */
async function deleteCart({ id, token }) {
  await ensureSchema();
  const rows = id
    ? await sql`DELETE FROM abandoned_carts WHERE id = ${Number(id)} RETURNING id`
    : await sql`DELETE FROM abandoned_carts WHERE token = ${String(token || '')} RETURNING id`;
  return rows.length > 0;
}

/* ---------- dashboard ---------- */
function rowToCart(r) {
  const parse = v => (v == null ? v : (typeof v === 'string' ? JSON.parse(v) : v));
  return {
    id: Number(r.id),
    name: r.name, email: r.email, phone: r.phone,
    items: parse(r.items) || [],
    subtotal: Number(r.subtotal),
    status: r.status,
    remindersSent: r.reminders_sent,
    lastReminderAt: r.last_reminder_at ? new Date(r.last_reminder_at).getTime() : null,
    reminderLog: parse(r.reminder_log) || [],
    discountCode: r.discount_code,
    recoveredOrderId: r.recovered_order_id,
    recoveredAt: r.recovered_at ? new Date(r.recovered_at).getTime() : null,
    linkClicks: r.link_clicks,
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime()
  };
}

async function listForAdmin(query) {
  await ensureSchema();
  const PAGE = 20;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const status = ['pending', 'recovered', 'expired', 'unsubscribed'].includes(query.status) ? query.status : null;
  const q = query.q ? '%' + String(query.q).trim().toLowerCase() + '%' : null;

  const [rows, count, stats] = await Promise.all([
    sql`
      SELECT * FROM abandoned_carts
      WHERE (${status}::text IS NULL OR status = ${status})
        AND (${q}::text IS NULL OR lower(coalesce(name,'')) LIKE ${q} OR lower(coalesce(email,'')) LIKE ${q} OR coalesce(phone,'') LIKE ${q})
      ORDER BY created_at DESC
      LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}
    `,
    sql`
      SELECT count(*)::int AS n FROM abandoned_carts
      WHERE (${status}::text IS NULL OR status = ${status})
        AND (${q}::text IS NULL OR lower(coalesce(name,'')) LIKE ${q} OR lower(coalesce(email,'')) LIKE ${q} OR coalesce(phone,'') LIKE ${q})
    `,
    sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE status = 'pending')::int AS pending,
        count(*) FILTER (WHERE status = 'recovered')::int AS recovered,
        count(*) FILTER (WHERE status = 'recovered' AND reminders_sent > 0)::int AS recovered_after_reminder,
        coalesce(sum(subtotal) FILTER (WHERE status <> 'recovered'), 0) AS lost_value,
        coalesce(sum(subtotal) FILTER (WHERE status = 'recovered'), 0) AS recovered_value
      FROM abandoned_carts
      WHERE created_at > now() - interval '30 days'
    `
  ]);
  const s = stats[0];
  return {
    carts: rows.map(rowToCart),
    total: count[0].n, page, pageSize: PAGE,
    stats: {
      total: s.total, pending: s.pending, recovered: s.recovered,
      recoveredAfterReminder: s.recovered_after_reminder,
      recoveryRate: s.total ? Math.round((s.recovered / s.total) * 1000) / 10 : 0,
      lostValue: Number(s.lost_value), recoveredValue: Number(s.recovered_value)
    },
    whatsappConfigured: !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    cronKey: cronKey()
  };
}

module.exports = {
  captureCart, markRecovered, runReminders, restorePage, unsubscribe,
  listForAdmin, deleteCart, loadSettings, cronKey, runRemindersIfDue, DEFAULT_SETTINGS
};
