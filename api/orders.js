/* ============================================================
   THE PINK ROOM — orders API (Vercel serverless function)
   POST /api/orders   — save a new order to Postgres, then fire the
                        shop/customer email + shop WhatsApp notifications
                        (via api/_lib/notify.js). Returns the saved order.
   GET  /api/orders?id=PR-XXXXXX — fetch a single order back, used by
                        order-success.html / receipt.html on any device,
                        not just the one that placed the order.
   GET  /api/orders?action=shipping-methods — public, checkout.js reads this
   POST /api/orders?action=validate-coupon  — public, checkout.js "Apply" preview
   POST /api/orders?action=paymob-webhook   — Paymob calls this (see "Payments" —
                        integration pending, returns 501 until configured)
   ============================================================ */

const { sql } = require('./_lib/db');
const { notifyOrder } = require('./_lib/notify');
const { validateCoupon } = require('./_lib/coupons');
const { getSetting } = require('./_lib/settings');
const { getActivePromotions, effectivePrice } = require('./_lib/promotions');

// same shape/values as the seed row in db/schema.sql — used only if the
// settings table row is ever missing, so checkout never hard-fails.
const DEFAULT_SHIPPING_METHODS = {
  standard: { id: 'standard', label: 'Standard Delivery', sub: '3 – 5 Business Days', price: 80, minDays: 3, maxDays: 5 },
  express:  { id: 'express',  label: 'Express Delivery',  sub: '1 – 2 Business Days', price: 150, minDays: 1, maxDays: 2 }
};

function validateOrder(order) {
  if (!order || typeof order !== 'object') return 'Missing order payload.';
  if (!order.id || typeof order.id !== 'string') return 'Missing order id.';
  if (!order.customer || !order.customer.name || !order.customer.phone) return 'Missing customer details.';
  if (!order.shippingAddress || !order.shippingAddress.street) return 'Missing shipping address.';
  if (!order.shippingMethod || !order.shippingMethod.id) return 'Missing shipping method.';
  if (!order.paymentMethod || !order.paymentMethod.id) return 'Missing payment method.';
  if (!Array.isArray(order.items) || !order.items.length) return 'Order has no items.';
  if (order.items.length > 100) return 'Order has an unreasonable number of items.';
  if (!order.pricing || typeof order.pricing.total !== 'number') return 'Missing order pricing.';
  if (!order.paymentStatus || !order.orderStatus) return 'Missing order status.';
  return null;
}

/* DB rows come back with snake_case columns and JSONB either already
   parsed or still a string depending on driver version — normalize both
   so the frontend always gets exactly the shape checkout.js produces. */
function rowToOrder(row) {
  const parse = (v) => (v == null ? v : (typeof v === 'string' ? JSON.parse(v) : v));
  return {
    id: row.id,
    createdAt: new Date(row.created_at).getTime(),
    customer: parse(row.customer),
    shippingAddress: parse(row.shipping_address),
    shippingMethod: parse(row.shipping_method),
    billingAddress: parse(row.billing_address),
    paymentMethod: parse(row.payment_method),
    notes: row.notes || '',
    items: parse(row.items),
    pricing: parse(row.pricing),
    promo: parse(row.promo),
    paymentStatus: row.payment_status,
    paymentNote: row.payment_note || '',
    orderStatus: row.order_status,
    delivery: parse(row.delivery)
  };
}

/* Reserves stock for every item that has inventory tracking on, one
   product at a time. Each decrement is its own atomic conditional
   UPDATE (`WHERE stock_quantity >= qty`), so two orders racing for the
   last unit can't both succeed — Postgres serializes the row lock. Not
   a single DB transaction (the HTTP driver's transaction() can't branch
   on a mid-transaction result), so on insufficient stock we compensate
   by putting back what we already took, which is safe here because
   nothing else touches stock_quantity between these calls. Items for
   products with track_inventory = false (the default — most items are
   made-to-order/no stock concept) are skipped entirely. */
/* Reserves one color's stock — an atomic conditional UPDATE just like the
   plain-product path below, but reaching into extra.colors for both the
   check and the decrement (jsonb_agg rebuilds the array with just that
   one element changed). stock_quantity, the top-level "sum of colors"
   number the rest of the dashboard reads, is decremented in the same
   statement so it never drifts out of sync with the colors underneath
   it. Returns true if reserved, false if that color doesn't have enough
   (or doesn't exist / isn't tracked). */
async function reserveColorStock(id, color, qty) {
  const rows = await sql`
    UPDATE products SET
      extra = jsonb_set(
        extra, '{colors}',
        (SELECT jsonb_agg(
           CASE WHEN elem->>'name' = ${color}
                THEN jsonb_set(elem, '{stockQuantity}', to_jsonb((elem->>'stockQuantity')::int - ${qty}))
                ELSE elem END
         ) FROM jsonb_array_elements(extra->'colors') elem)
      ),
      stock_quantity = stock_quantity - ${qty}
    WHERE id = ${id} AND track_inventory = true
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(extra->'colors') elem
        WHERE elem->>'name' = ${color} AND (elem->>'stockQuantity')::int >= ${qty}
      )
    RETURNING id
  `;
  return rows.length > 0;
}

async function releaseColorStock(id, color, qty) {
  await sql`
    UPDATE products SET
      extra = jsonb_set(
        extra, '{colors}',
        (SELECT jsonb_agg(
           CASE WHEN elem->>'name' = ${color}
                THEN jsonb_set(elem, '{stockQuantity}', to_jsonb((elem->>'stockQuantity')::int + ${qty}))
                ELSE elem END
         ) FROM jsonb_array_elements(extra->'colors') elem)
      ),
      stock_quantity = stock_quantity + ${qty}
    WHERE id = ${id}
  `;
}

/* Puts back whatever reserveStock successfully took — used both when a
   later item in the same order fails and when the order row itself
   fails to save. Mirrors whichever path (color-aware or plain) took it. */
async function releaseTaken(taken) {
  for (const t of taken) {
    if (t.color) await releaseColorStock(t.id, t.color, t.qty);
    else await sql`UPDATE products SET stock_quantity = stock_quantity + ${t.qty} WHERE id = ${t.id}`;
  }
}

async function reserveStock(items, orderId) {
  const taken = [];
  for (const item of items) {
    if (!item || !item.id) continue;
    const qty = Math.max(1, Math.round(Number(item.qty) || 1));

    if (item.color) {
      const ok = await reserveColorStock(item.id, item.color, qty);
      if (ok) { taken.push({ id: item.id, qty, color: item.color }); continue; }

      const row = await sql`SELECT track_inventory, name, extra FROM products WHERE id = ${item.id}`;
      if (!row.length || !row[0].track_inventory) continue; // untracked or unknown product — nothing to reserve
      const extra = typeof row[0].extra === 'string' ? JSON.parse(row[0].extra) : (row[0].extra || {});
      const colorRow = (extra.colors || []).find(c => c.name === item.color);

      await releaseTaken(taken);
      return { error: `"${row[0].name || item.name || item.id}"${item.color ? ' in ' + item.color : ''} only has ${colorRow ? colorRow.stockQuantity : 0} left in stock.` };
    }

    const ok = await sql`
      UPDATE products SET stock_quantity = stock_quantity - ${qty}
      WHERE id = ${item.id} AND track_inventory = true AND stock_quantity >= ${qty}
      RETURNING id
    `;
    if (ok.length) { taken.push({ id: item.id, qty }); continue; }

    const row = await sql`SELECT track_inventory, stock_quantity, name FROM products WHERE id = ${item.id}`;
    if (!row.length || !row[0].track_inventory) continue; // untracked or unknown product — nothing to reserve

    // insufficient stock — undo what we already reserved for this order
    await releaseTaken(taken);
    return { error: `"${row[0].name || item.name || item.id}" only has ${row[0].stock_quantity} left in stock.` };
  }

  for (const t of taken) {
    await sql`INSERT INTO inventory_log (product_id, change, reason, order_id, note) VALUES (${t.id}, ${-t.qty}, 'order', ${orderId}, ${t.color ? ('Color: ' + t.color) : null})`;
  }
  return { taken };
}

/* Recomputes subtotal from the DB's own product prices (falling back to
   the client's price only for an item whose product no longer exists —
   e.g. deleted after being added to a cart, a rare edge case that
   shouldn't block a real sale), then re-validates the promo code
   against that real subtotal. Nothing about pricing.subtotal/discount/
   total is ever taken from the client as-is. Shipping price isn't
   cross-checked yet — SHIPPING_METHODS is still a client-side constant
   until Phase 4 moves it server-side; documented as a known gap. */
async function recomputePricing(order) {
  const ids = (order.items || []).map(i => i && i.id).filter(Boolean);
  const [rows, activePromotions] = await Promise.all([
    ids.length ? sql`SELECT id, price, sale_price FROM products WHERE id = ANY(${ids})` : Promise.resolve([]),
    getActivePromotions()
  ]);
  // same overlay the public product list applies — a product in a live
  // sale campaign is charged its campaign price here too, never just
  // its raw price/sale_price, so the banner's "15% off" is never a lie
  // at the register
  const priceMap = new Map(rows.map(r => [
    r.id,
    effectivePrice(r.id, r.price != null ? Number(r.price) : null, r.sale_price != null ? Number(r.sale_price) : null, activePromotions)
  ]));

  let subtotal = 0;
  const items = order.items.map(item => {
    const qty = Math.max(1, Math.round(Number(item.qty) || 1));
    const known = priceMap.get(item.id);
    const price = known != null ? known : (Number(item.price) || 0);
    subtotal += price * qty;
    return { ...item, price };
  });

  let discount = 0, promo = null;
  if (order.promo && order.promo.code) {
    const result = await validateCoupon(order.promo.code, subtotal);
    if (result.error) return { error: result.error };
    discount = result.discount;
    promo = { code: result.code, pct: result.pct, label: result.label };
  }

  // shipping price comes from the real settings row, not the client —
  // an unrecognized method id falls back to its price being 0 rather
  // than trusting whatever the client sent
  const methods = await getSetting('shipping_methods', DEFAULT_SHIPPING_METHODS);
  const methodId = order.shippingMethod && order.shippingMethod.id;
  const method = methodId ? methods[methodId] : null;
  const shipping = method ? Number(method.price) || 0 : 0;
  if (methodId && !method) return { error: `"${methodId}" isn't a valid shipping method.` };

  const total = Math.max(0, subtotal - discount) + shipping;

  return {
    items, promo,
    shippingMethod: method ? { id: method.id, label: method.label, sub: method.sub, price: shipping } : order.shippingMethod,
    pricing: { subtotal, discount, shipping, tax: 0, total }
  };
}

/* POST /api/orders?action=paymob-webhook — Paymob calls this after a
   card payment is processed. NOT wired into checkout yet (Paymob stays
   `enabled:false` in checkout.js until real API keys exist) — this is
   the receiving end built ahead of time, per the "build the correct
   architecture, mark it pending, never fake it" instruction. Returns
   501 (never pretends to succeed) unless PAYMOB_HMAC_SECRET is set.

   HMAC verification follows Paymob's documented "Transaction Processed
   Callback" field order (amount_cents, created_at, currency,
   error_occured, has_parent_transaction, id, integration_id,
   is_3d_secure, is_auth, is_capture, is_refunded, is_standalone_payment,
   is_voided, order.id, owner, pending, source_data.pan,
   source_data.sub_type, source_data.type, success — HMAC-SHA512, hex).
   This hasn't been exercised against Paymob's actual sandbox (no
   account/keys yet) — verify against a real test transaction before
   relying on it once Paymob is actually connected. */
const crypto = require('crypto');

function verifyPaymobHmac(obj, hmacParam, secret) {
  const g = (v) => (v === undefined || v === null ? '' : String(v));
  const fields = [
    g(obj.amount_cents), g(obj.created_at), g(obj.currency), g(obj.error_occured),
    g(obj.has_parent_transaction), g(obj.id), g(obj.integration_id), g(obj.is_3d_secure),
    g(obj.is_auth), g(obj.is_capture), g(obj.is_refunded), g(obj.is_standalone_payment),
    g(obj.is_voided), g(obj.order && obj.order.id), g(obj.owner), g(obj.pending),
    g(obj.source_data && obj.source_data.pan), g(obj.source_data && obj.source_data.sub_type),
    g(obj.source_data && obj.source_data.type), g(obj.success)
  ].join('');
  const computed = crypto.createHmac('sha512', secret).update(fields).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(String(hmacParam || ''))); }
  catch (e) { return false; } // length mismatch etc — definitely not a match
}

async function paymobWebhook(req, res) {
  const secret = process.env.PAYMOB_HMAC_SECRET;
  if (!secret) {
    console.warn('[orders] paymob-webhook called but PAYMOB_HMAC_SECRET is not set — integration pending, ignoring.');
    return res.status(501).json({ ok: false, error: 'Paymob integration is not configured yet.' });
  }
  if (!sql) return res.status(500).json({ ok: false, error: 'Database is not configured.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); } }
  const obj = body && body.obj;
  if (!obj) return res.status(400).json({ ok: false, error: 'Missing transaction payload.' });

  if (!verifyPaymobHmac(obj, req.query.hmac, secret)) {
    console.error('[orders] paymob-webhook HMAC mismatch — rejecting.');
    return res.status(401).json({ ok: false, error: 'Invalid signature.' });
  }

  const orderId = obj.order && obj.order.merchant_order_id;
  if (!orderId) return res.status(400).json({ ok: false, error: 'Missing merchant_order_id.' });

  const newStatus = obj.success ? 'paid' : 'failed';
  await sql`UPDATE orders SET payment_status = ${newStatus}, payment_note = ${obj.success ? 'Paid via Paymob.' : 'Paymob payment failed.'} WHERE id = ${orderId}`;

  return res.status(200).json({ ok: true });
}

async function validateCouponPreview(req, res) {
  if (!sql) return res.status(500).json({ ok: false, error: 'Database is not configured.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); } }
  const { code, subtotal } = body || {};
  if (!code) return res.status(400).json({ ok: false, error: 'Missing promo code.' });
  const result = await validateCoupon(code, Number(subtotal) || 0);
  if (result.error) return res.status(400).json({ ok: false, error: result.error });
  return res.status(200).json({ ok: true, discount: result.discount, code: result.code, pct: result.pct, label: result.label });
}

async function createOrder(req, res) {
  let order = req.body;
  if (typeof order === 'string') {
    try { order = JSON.parse(order); } catch (e) { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); }
  }

  const validationError = validateOrder(order);
  if (validationError) return res.status(400).json({ ok: false, error: validationError });

  if (!sql) return res.status(500).json({ ok: false, error: 'Database is not configured.' });

  const recomputed = await recomputePricing(order);
  if (recomputed.error) return res.status(400).json({ ok: false, error: recomputed.error });
  order = { ...order, items: recomputed.items, pricing: recomputed.pricing, promo: recomputed.promo, shippingMethod: recomputed.shippingMethod };

  const stock = await reserveStock(order.items, order.id);
  if (stock.error) return res.status(409).json({ ok: false, error: stock.error });

  try {
    await sql`
      INSERT INTO orders (
        id, created_at, customer, shipping_address, shipping_method,
        billing_address, payment_method, notes, items, pricing, promo,
        payment_status, payment_note, order_status, delivery,
        customer_email, customer_phone
      ) VALUES (
        ${order.id}, to_timestamp(${(order.createdAt || Date.now()) / 1000}),
        ${JSON.stringify(order.customer)}::jsonb,
        ${JSON.stringify(order.shippingAddress)}::jsonb,
        ${JSON.stringify(order.shippingMethod)}::jsonb,
        ${order.billingAddress ? JSON.stringify(order.billingAddress) : null}::jsonb,
        ${JSON.stringify(order.paymentMethod)}::jsonb,
        ${order.notes || null},
        ${JSON.stringify(order.items)}::jsonb,
        ${JSON.stringify(order.pricing)}::jsonb,
        ${order.promo ? JSON.stringify(order.promo) : null}::jsonb,
        ${order.paymentStatus},
        ${order.paymentNote || null},
        ${order.orderStatus},
        ${order.delivery ? JSON.stringify(order.delivery) : null}::jsonb,
        ${order.customer.email || null},
        ${order.customer.phone || null}
      )
    `;
  } catch (e) {
    // the order row didn't save — put back any stock we already reserved
    try { await releaseTaken(stock.taken || []); } catch (e2) {}
    if (e.message && /duplicate key/i.test(e.message)) {
      return res.status(409).json({ ok: false, error: 'That order id already exists — please try again.' });
    }
    console.error('[orders] insert failed:', e);
    return res.status(500).json({ ok: false, error: 'Could not save the order.' });
  }

  if (order.promo && order.promo.code) {
    try { await sql`UPDATE coupons SET usage_count = usage_count + 1 WHERE code = ${order.promo.code}`; } catch (e) { console.error('[orders] coupon usage increment failed:', e); }
  }

  const notify = await notifyOrder(order);
  return res.status(200).json({ ok: true, order: { ...order, _notify: notify } });
}

async function getOrder(req, res) {
  const id = req.query.id;
  if (!id || typeof id !== 'string') return res.status(400).json({ ok: false, error: 'Missing order id.' });
  if (!sql) return res.status(500).json({ ok: false, error: 'Database is not configured.' });

  const rows = await sql`SELECT * FROM orders WHERE id = ${id} LIMIT 1`;
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Order not found.' });
  return res.status(200).json({ ok: true, order: rowToOrder(rows[0]) });
}

module.exports = async (req, res) => {
  if (req.query.action === 'paymob-webhook') {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }); }
    return paymobWebhook(req, res);
  }
  if (req.query.action === 'validate-coupon') {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }); }
    return validateCouponPreview(req, res);
  }
  if (req.query.action === 'shipping-methods') {
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }); }
    if (!sql) return res.status(200).json({ ok: true, methods: DEFAULT_SHIPPING_METHODS });
    try {
      const methods = await getSetting('shipping_methods', DEFAULT_SHIPPING_METHODS);
      return res.status(200).json({ ok: true, methods });
    } catch (e) {
      console.error('[orders] shipping-methods error:', e);
      return res.status(200).json({ ok: true, methods: DEFAULT_SHIPPING_METHODS }); // never break checkout over this
    }
  }
  if (req.method === 'POST') return createOrder(req, res);
  if (req.method === 'GET') return getOrder(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'Method not allowed.' });
};
