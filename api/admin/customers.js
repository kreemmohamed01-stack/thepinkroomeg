/* ============================================================
   THE PINK ROOM — admin customers API (auth required)
   There is no accounts/registration system — checkout is guest-only —
   so "customers" aren't a separate table. They're derived live from
   `orders` (grouped by the already-indexed customer_email), which is
   the correct model for this store rather than a parallel data
   structure that could drift out of sync with the real order history.

   GET /api/admin/customers                — paginated list + search
   GET /api/admin/customers?email=...       — one customer's profile +
                                               full order history
   ============================================================ */
const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');

const PAGE_SIZE = 20;

async function listCustomers(req, res) {
  const search = String(req.query.q || '').trim();
  const like = '%' + search + '%';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [rows, countRows] = await Promise.all([
    sql`
      SELECT
        customer_email AS email,
        (array_agg(customer_phone ORDER BY created_at DESC))[1] AS phone,
        (array_agg(customer->>'name' ORDER BY created_at DESC))[1] AS name,
        count(*)::int AS total_orders,
        COALESCE(sum((pricing->>'total')::numeric), 0)::float AS total_spent,
        min(created_at) AS first_order_at,
        max(created_at) AS last_order_at
      FROM orders
      WHERE customer_email IS NOT NULL AND customer_email != ''
        AND (${search} = '' OR customer_email ILIKE ${like} OR customer_phone ILIKE ${like} OR customer->>'name' ILIKE ${like})
      GROUP BY customer_email
      ORDER BY last_order_at DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `,
    sql`
      SELECT count(*)::int AS total FROM (
        SELECT customer_email FROM orders
        WHERE customer_email IS NOT NULL AND customer_email != ''
          AND (${search} = '' OR customer_email ILIKE ${like} OR customer_phone ILIKE ${like} OR customer->>'name' ILIKE ${like})
        GROUP BY customer_email
      ) x
    `
  ]);

  const customers = rows.map(r => ({
    email: r.email,
    name: r.name,
    phone: r.phone,
    totalOrders: r.total_orders,
    totalSpent: r.total_spent,
    avgOrderValue: r.total_orders ? r.total_spent / r.total_orders : 0,
    firstOrderAt: new Date(r.first_order_at).getTime(),
    lastOrderAt: new Date(r.last_order_at).getTime(),
    type: r.total_orders > 1 ? 'returning' : 'new'
  }));

  return res.status(200).json({ ok: true, customers, page, pageSize: PAGE_SIZE, total: countRows[0].total });
}

async function getCustomer(req, res) {
  const email = req.query.email;
  if (!email) return res.status(400).json({ ok: false, error: 'Missing customer email.' });

  const [profileRows, orderRows] = await Promise.all([
    sql`
      SELECT
        customer_email AS email,
        (array_agg(customer ORDER BY created_at DESC))[1] AS latest_customer,
        (array_agg(shipping_address ORDER BY created_at DESC))[1] AS latest_address,
        count(*)::int AS total_orders,
        COALESCE(sum((pricing->>'total')::numeric), 0)::float AS total_spent,
        min(created_at) AS first_order_at,
        max(created_at) AS last_order_at
      FROM orders
      WHERE customer_email = ${email}
      GROUP BY customer_email
    `,
    sql`
      SELECT id, created_at, pricing, payment_status, order_status
      FROM orders WHERE customer_email = ${email}
      ORDER BY created_at DESC
    `
  ]);

  if (!profileRows.length) return res.status(404).json({ ok: false, error: 'No orders found for this customer.' });

  const p = profileRows[0];
  const parse = v => (v == null ? v : (typeof v === 'string' ? JSON.parse(v) : v));
  const customer = parse(p.latest_customer) || {};
  const address = parse(p.latest_address) || {};

  return res.status(200).json({
    ok: true,
    customer: {
      email: p.email,
      name: customer.name,
      phone: customer.phone,
      address: [address.street, address.apt].filter(Boolean).join(', '),
      city: [address.city, address.governorate].filter(Boolean).join(', '),
      totalOrders: p.total_orders,
      totalSpent: p.total_spent,
      avgOrderValue: p.total_orders ? p.total_spent / p.total_orders : 0,
      firstOrderAt: new Date(p.first_order_at).getTime(),
      lastOrderAt: new Date(p.last_order_at).getTime(),
      type: p.total_orders > 1 ? 'returning' : 'new'
    },
    orders: orderRows.map(o => ({
      id: o.id,
      createdAt: new Date(o.created_at).getTime(),
      total: parse(o.pricing).total,
      paymentStatus: o.payment_status,
      orderStatus: o.order_status
    }))
  });
}

module.exports = async (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  if (!sql) return res.status(500).json({ ok: false, error: 'Database is not configured.' });

  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ ok: false, error: 'Method not allowed.' });
    }
    return req.query.email ? await getCustomer(req, res) : await listCustomers(req, res);
  } catch (e) {
    console.error('[admin/customers] error:', e);
    return res.status(500).json({ ok: false, error: 'Something went wrong.' });
  }
};
