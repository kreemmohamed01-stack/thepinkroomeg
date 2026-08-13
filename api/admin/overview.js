/* GET /api/admin/overview — everything the dashboard's Home/Overview page
   needs, in one request. Reuses the same orders/products tables as the
   Orders, Products and Analytics endpoints — no new tables here. */
const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');

module.exports = async (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  if (!sql) return res.status(500).json({ ok: false, error: 'Database is not configured.' });

  try {
    const [
      revenueAll, revenueMonth, revenueLastMonth,
      ordersCount, ordersMonth, pendingOrders, pendingPayments,
      customersCount, newCustomersMonth,
      productsCount, hiddenProducts,
      recentOrders, recentCustomers, bestSellers
    ] = await Promise.all([
      sql`SELECT COALESCE(sum((pricing->>'total')::numeric), 0)::float AS n FROM orders`,
      sql`SELECT COALESCE(sum((pricing->>'total')::numeric), 0)::float AS n FROM orders WHERE created_at >= date_trunc('month', now())`,
      sql`SELECT COALESCE(sum((pricing->>'total')::numeric), 0)::float AS n FROM orders WHERE created_at >= date_trunc('month', now()) - interval '1 month' AND created_at < date_trunc('month', now())`,

      sql`SELECT count(*)::int AS n FROM orders`,
      sql`SELECT count(*)::int AS n FROM orders WHERE created_at >= date_trunc('month', now())`,
      sql`SELECT count(*)::int AS n FROM orders WHERE order_status = 'pending'`,
      sql`SELECT count(*)::int AS n FROM orders WHERE payment_status = 'pending'`,

      sql`SELECT count(DISTINCT customer_email)::int AS n FROM orders WHERE customer_email IS NOT NULL AND customer_email != ''`,
      sql`
        SELECT count(*)::int AS n FROM (
          SELECT customer_email FROM orders
          WHERE customer_email IS NOT NULL AND customer_email != ''
          GROUP BY customer_email HAVING min(created_at) >= date_trunc('month', now())
        ) x
      `,

      sql`SELECT count(*)::int AS n FROM products`,
      sql`SELECT count(*)::int AS n FROM products WHERE availability = 'Out of Stock'`,

      sql`SELECT id, created_at, customer, pricing, payment_status, order_status FROM orders ORDER BY created_at DESC LIMIT 6`,

      sql`
        SELECT customer_email AS email,
               (array_agg(customer->>'name' ORDER BY created_at DESC))[1] AS name,
               count(*)::int AS total_orders,
               max(created_at) AS last_order_at
        FROM orders
        WHERE customer_email IS NOT NULL AND customer_email != ''
        GROUP BY customer_email
        ORDER BY last_order_at DESC LIMIT 6
      `,

      sql`
        SELECT item->>'id' AS product_id, item->>'name' AS name,
               sum((item->>'qty')::numeric)::int AS qty,
               sum((item->>'qty')::numeric * (item->>'price')::numeric)::float AS revenue
        FROM orders, jsonb_array_elements(items) AS item
        WHERE created_at >= now() - interval '90 days'
        GROUP BY item->>'id', item->>'name'
        ORDER BY qty DESC LIMIT 6
      `
    ]);

    const parse = v => (v == null ? v : (typeof v === 'string' ? JSON.parse(v) : v));

    return res.status(200).json({
      ok: true,
      revenue: { allTime: revenueAll[0].n, thisMonth: revenueMonth[0].n, lastMonth: revenueLastMonth[0].n },
      orders: { total: ordersCount[0].n, thisMonth: ordersMonth[0].n, pending: pendingOrders[0].n, pendingPayments: pendingPayments[0].n },
      customers: { total: customersCount[0].n, newThisMonth: newCustomersMonth[0].n },
      products: { total: productsCount[0].n, outOfStock: hiddenProducts[0].n },
      recentOrders: recentOrders.map(o => ({
        id: o.id,
        createdAt: new Date(o.created_at).getTime(),
        customerName: (parse(o.customer) || {}).name || '',
        total: (parse(o.pricing) || {}).total || 0,
        paymentStatus: o.payment_status,
        orderStatus: o.order_status
      })),
      recentCustomers: recentCustomers.map(c => ({
        email: c.email, name: c.name, totalOrders: c.total_orders,
        lastOrderAt: new Date(c.last_order_at).getTime()
      })),
      bestSellers: bestSellers.map(b => ({ productId: b.product_id, name: b.name, qty: b.qty, revenue: b.revenue }))
    });
  } catch (e) {
    console.error('[admin/overview] error:', e);
    return res.status(500).json({ ok: false, error: 'Could not load overview.' });
  }
};
