/* ============================================================
   THE PINK ROOM — admin orders API (auth required on every route)
   GET  /api/admin/orders                — paginated list + search/filter + stats
                                            (?status=, ?payment=, ?method=)
   GET  /api/admin/orders?id=PR-XXXXXX    — full detail of one order
   GET  /api/admin/orders?action=payments — payment-focused summary (see "Payments")
   PATCH  /api/admin/orders               — { id, orderStatus?, paymentStatus? }
   DELETE /api/admin/orders?id=PR-XXXXXX  — permanently remove an order (test/mistaken orders)
   ============================================================ */

const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');

const ORDER_STATUSES = ['confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
const PAYMENT_STATUSES = ['pending', 'processing', 'paid', 'failed', 'cancelled'];
const PAGE_SIZE = 20;

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
function rowToSummary(row) {
  const customer = typeof row.customer === 'string' ? JSON.parse(row.customer) : row.customer;
  const pricing = typeof row.pricing === 'string' ? JSON.parse(row.pricing) : row.pricing;
  return {
    id: row.id,
    createdAt: new Date(row.created_at).getTime(),
    customerName: customer.name,
    customerPhone: customer.phone,
    total: pricing.total,
    paymentStatus: row.payment_status,
    orderStatus: row.order_status
  };
}

async function listOrders(req, res) {
  const search = String(req.query.q || '').trim();
  const statusFilter = ORDER_STATUSES.includes(req.query.status) ? req.query.status : '';
  const paymentFilter = PAYMENT_STATUSES.includes(req.query.payment) ? req.query.payment : '';
  const methodFilter = String(req.query.method || '').trim();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const like = '%' + search + '%';
  const offset = (page - 1) * PAGE_SIZE;

  const [rows, countRows, statsRows] = await Promise.all([
    sql`
      SELECT id, created_at, customer, pricing, payment_status, order_status, payment_method
      FROM orders
      WHERE (${search} = '' OR id ILIKE ${like} OR customer_email ILIKE ${like} OR customer_phone ILIKE ${like} OR customer->>'name' ILIKE ${like})
        AND (${statusFilter} = '' OR order_status = ${statusFilter})
        AND (${paymentFilter} = '' OR payment_status = ${paymentFilter})
        AND (${methodFilter} = '' OR payment_method->>'id' = ${methodFilter})
      ORDER BY created_at DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `,
    sql`
      SELECT count(*)::int AS total
      FROM orders
      WHERE (${search} = '' OR id ILIKE ${like} OR customer_email ILIKE ${like} OR customer_phone ILIKE ${like} OR customer->>'name' ILIKE ${like})
        AND (${statusFilter} = '' OR order_status = ${statusFilter})
        AND (${paymentFilter} = '' OR payment_status = ${paymentFilter})
        AND (${methodFilter} = '' OR payment_method->>'id' = ${methodFilter})
    `,
    sql`
      SELECT
        count(*)::int AS total_orders,
        COALESCE(sum((pricing->>'total')::numeric), 0)::float AS total_revenue,
        count(*) FILTER (WHERE order_status = 'confirmed')::int AS confirmed_count,
        count(*) FILTER (WHERE order_status = 'processing')::int AS processing_count,
        count(*) FILTER (WHERE order_status = 'shipped')::int AS shipped_count,
        count(*) FILTER (WHERE order_status = 'delivered')::int AS delivered_count,
        count(*) FILTER (WHERE order_status = 'cancelled')::int AS cancelled_count,
        count(*) FILTER (WHERE payment_status = 'pending')::int AS pending_payment_count
      FROM orders
    `
  ]);

  return res.status(200).json({
    ok: true,
    orders: rows.map(r => ({ ...rowToSummary(r), paymentMethod: (typeof r.payment_method === 'string' ? JSON.parse(r.payment_method) : r.payment_method) || {} })),
    page,
    pageSize: PAGE_SIZE,
    total: countRows[0].total,
    stats: statsRows[0]
  });
}

/* GET ?action=payments — payment-focused aggregate view: money actually
   collected vs. pending vs. failed, and a breakdown by payment method.
   Derived entirely from `orders` — no new table, this is a read-only
   summary over data that already exists. */
async function paymentsSummary(req, res) {
  const [byStatus, byMethod, recentFailed] = await Promise.all([
    sql`
      SELECT payment_status,
             count(*)::int AS count,
             COALESCE(sum((pricing->>'total')::numeric), 0)::float AS total
      FROM orders GROUP BY payment_status
    `,
    sql`
      SELECT payment_method->>'id' AS method_id, payment_method->>'label' AS method_label,
             count(*)::int AS count,
             COALESCE(sum((pricing->>'total')::numeric), 0)::float AS total
      FROM orders GROUP BY payment_method->>'id', payment_method->>'label'
      ORDER BY count DESC
    `,
    sql`
      SELECT id, created_at, customer, pricing, payment_status, payment_note, payment_method
      FROM orders WHERE payment_status = 'failed'
      ORDER BY created_at DESC LIMIT 10
    `
  ]);

  const parse = v => (v == null ? v : (typeof v === 'string' ? JSON.parse(v) : v));
  return res.status(200).json({
    ok: true,
    byStatus: byStatus.map(r => ({ status: r.payment_status, count: r.count, total: r.total })),
    byMethod: byMethod.map(r => ({ methodId: r.method_id, methodLabel: r.method_label, count: r.count, total: r.total })),
    recentFailed: recentFailed.map(r => ({
      id: r.id, createdAt: new Date(r.created_at).getTime(),
      customerName: (parse(r.customer) || {}).name || '',
      total: (parse(r.pricing) || {}).total || 0,
      paymentNote: r.payment_note || '',
      paymentMethod: (parse(r.payment_method) || {}).label || ''
    })),
    paymob: {
      configured: !!(process.env.PAYMOB_API_KEY && process.env.PAYMOB_INTEGRATION_ID && process.env.PAYMOB_HMAC_SECRET),
      status: 'integration pending' // see BACKEND-SETUP.md "Payments" — architecture is ready, no fake gateway
    }
  });
}

async function getOrderDetail(req, res) {
  const id = req.query.id;
  const rows = await sql`SELECT * FROM orders WHERE id = ${id} LIMIT 1`;
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Order not found.' });
  return res.status(200).json({ ok: true, order: rowToOrder(rows[0]) });
}

/* direction +1 = give stock back (order cancelled), -1 = take it again
   (a cancelled order was reinstated). Only touches products that still
   have track_inventory on — same skip rule as reserveStock in api/orders.js. */
async function restockOrderItems(items, orderId, direction) {
  const parse = v => (v == null ? v : (typeof v === 'string' ? JSON.parse(v) : v));
  const list = parse(items) || [];
  for (const item of list) {
    if (!item || !item.id) continue;
    const qty = Math.max(1, Math.round(Number(item.qty) || 1));
    const row = await sql`SELECT track_inventory FROM products WHERE id = ${item.id}`;
    if (!row.length || !row[0].track_inventory) continue;
    await sql`UPDATE products SET stock_quantity = GREATEST(0, stock_quantity + ${direction * qty}) WHERE id = ${item.id}`;
    await sql`INSERT INTO inventory_log (product_id, change, reason, order_id, note) VALUES (${item.id}, ${direction * qty}, 'order', ${orderId}, ${direction > 0 ? 'Order cancelled' : 'Cancelled order reinstated'})`;
  }
}

async function updateOrder(req, res) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); }
  }
  const { id, orderStatus, paymentStatus } = body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'Missing order id.' });
  if (orderStatus && !ORDER_STATUSES.includes(orderStatus)) return res.status(400).json({ ok: false, error: 'Invalid order status.' });
  if (paymentStatus && !PAYMENT_STATUSES.includes(paymentStatus)) return res.status(400).json({ ok: false, error: 'Invalid payment status.' });
  if (!orderStatus && !paymentStatus) return res.status(400).json({ ok: false, error: 'Nothing to update.' });

  if (orderStatus) {
    const current = await sql`SELECT order_status, items FROM orders WHERE id = ${id}`;
    if (!current.length) return res.status(404).json({ ok: false, error: 'Order not found.' });
    const wasCancelled = current[0].order_status === 'cancelled';
    const nowCancelled = orderStatus === 'cancelled';

    await sql`UPDATE orders SET order_status = ${orderStatus} WHERE id = ${id}`;

    // moving INTO cancelled restores any stock this order took; moving
    // OUT of cancelled (reinstating) takes it again — keeps stock_quantity
    // consistent no matter which direction the status changes.
    if (nowCancelled && !wasCancelled) await restockOrderItems(current[0].items, id, +1);
    if (wasCancelled && !nowCancelled) await restockOrderItems(current[0].items, id, -1);
  }
  if (paymentStatus) await sql`UPDATE orders SET payment_status = ${paymentStatus} WHERE id = ${id}`;

  const rows = await sql`SELECT * FROM orders WHERE id = ${id} LIMIT 1`;
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Order not found.' });
  return res.status(200).json({ ok: true, order: rowToOrder(rows[0]) });
}

/* Permanently removes an order — for test/mistaken orders, not a normal
   part of running the shop (cancelling is what handles a real order that
   fell through). If the order was never cancelled, any stock it reserved
   is put back first so deleting it can't leave stock looking short for
   an order that no longer exists. */
async function deleteOrder(req, res) {
  const id = req.query.id;
  if (!id) return res.status(400).json({ ok: false, error: 'Missing order id.' });

  const rows = await sql`SELECT order_status, items FROM orders WHERE id = ${id}`;
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Order not found.' });

  if (rows[0].order_status !== 'cancelled') await restockOrderItems(rows[0].items, id, +1);
  await sql`DELETE FROM inventory_log WHERE order_id = ${id}`;
  await sql`DELETE FROM orders WHERE id = ${id}`;
  return res.status(200).json({ ok: true });
}

module.exports = async (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  if (!sql) return res.status(500).json({ ok: false, error: 'Database is not configured.' });

  try {
    if (req.method === 'GET' && req.query.action === 'payments') return await paymentsSummary(req, res);
    if (req.method === 'GET') return req.query.id ? await getOrderDetail(req, res) : await listOrders(req, res);
    if (req.method === 'PATCH') return await updateOrder(req, res);
    if (req.method === 'DELETE') return await deleteOrder(req, res);
    res.setHeader('Allow', 'GET, PATCH, DELETE');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  } catch (e) {
    console.error('[admin/orders] error:', e);
    return res.status(500).json({ ok: false, error: 'Something went wrong.' });
  }
};
