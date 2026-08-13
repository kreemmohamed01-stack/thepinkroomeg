/* GET /api/admin/analytics — everything the dashboard's Analytics tab
   needs, in one request.
   GET /api/admin/analytics?action=live — cheap "active right now" count,
   polled every ~10s, kept as its own branch (merged in from what used
   to be api/admin/live.js, to stay under Vercel Hobby's serverless
   function cap) so polling doesn't re-run the heavier queries below.
   GET /api/admin/analytics?action=range&range=today|7d|30d|this_month|last_month|custom[&from=&to=]
   — date-scoped business metrics: revenue/orders/AOV, a rough
   conversion rate, new-vs-returning customers, best/worst sellers,
   order/payment status breakdowns. See "Advanced Analytics". */
const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');

async function liveCount(req, res) {
  const rows = await sql`SELECT count(*)::int AS active FROM active_sessions WHERE last_seen > now() - interval '3 minutes'`;
  return res.status(200).json({ ok: true, active: rows[0].active });
}

function resolveRange(query) {
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

  switch (query.range) {
    case 'today': return { start: startOfDay(now), end: now, label: 'Today' };
    case '7d': return { start: new Date(now.getTime() - 7 * 86400000), end: now, label: 'Last 7 days' };
    case '30d': return { start: new Date(now.getTime() - 30 * 86400000), end: now, label: 'Last 30 days' };
    case 'this_month': return { start: startOfMonth(now), end: now, label: 'This month' };
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = startOfMonth(now);
      return { start, end, label: 'Last month' };
    }
    case 'custom': {
      const from = query.from ? new Date(query.from) : null;
      const to = query.to ? new Date(query.to) : null;
      if (!from || isNaN(from) || !to || isNaN(to)) return null;
      return { start: from, end: new Date(to.getTime() + 86400000), label: 'Custom range' }; // end is exclusive, so include the whole "to" day
    }
    default: return { start: new Date(now.getTime() - 30 * 86400000), end: now, label: 'Last 30 days' };
  }
}

async function rangeAnalytics(req, res) {
  const range = resolveRange(req.query);
  if (!range) return res.status(400).json({ ok: false, error: 'Invalid date range.' });
  const { start, end } = range;

  const [
    orderStats, visitorCount, customerSplit, bestSellers, worstSellers, orderStatusRows, paymentStatusRows
  ] = await Promise.all([
    sql`
      SELECT count(*)::int AS orders, COALESCE(sum((pricing->>'total')::numeric), 0)::float AS revenue
      FROM orders WHERE created_at >= ${start} AND created_at < ${end}
    `,
    sql`
      SELECT count(DISTINCT session_id)::int AS n FROM analytics_events
      WHERE type = 'pageview' AND created_at >= ${start} AND created_at < ${end}
    `,
    sql`
      WITH period_customers AS (
        SELECT customer_email FROM orders
        WHERE created_at >= ${start} AND created_at < ${end} AND customer_email IS NOT NULL AND customer_email != ''
        GROUP BY customer_email
      ),
      first_ever AS (
        SELECT customer_email, min(created_at) AS first_order_at FROM orders
        WHERE customer_email IS NOT NULL AND customer_email != ''
        GROUP BY customer_email
      )
      SELECT
        count(*) FILTER (WHERE fe.first_order_at >= ${start})::int AS new_customers,
        count(*) FILTER (WHERE fe.first_order_at < ${start})::int AS returning_customers
      FROM period_customers pc JOIN first_ever fe ON fe.customer_email = pc.customer_email
    `,
    sql`
      SELECT item->>'id' AS product_id, item->>'name' AS name,
             sum((item->>'qty')::numeric)::int AS qty,
             sum((item->>'qty')::numeric * (item->>'price')::numeric)::float AS revenue
      FROM orders, jsonb_array_elements(items) AS item
      WHERE created_at >= ${start} AND created_at < ${end}
      GROUP BY item->>'id', item->>'name'
      ORDER BY qty DESC LIMIT 8
    `,
    sql`
      SELECT item->>'id' AS product_id, item->>'name' AS name,
             sum((item->>'qty')::numeric)::int AS qty
      FROM orders, jsonb_array_elements(items) AS item
      WHERE created_at >= ${start} AND created_at < ${end}
      GROUP BY item->>'id', item->>'name'
      ORDER BY qty ASC LIMIT 8
    `,
    sql`
      SELECT order_status, count(*)::int AS n FROM orders
      WHERE created_at >= ${start} AND created_at < ${end}
      GROUP BY order_status
    `,
    sql`
      SELECT payment_status, count(*)::int AS n FROM orders
      WHERE created_at >= ${start} AND created_at < ${end}
      GROUP BY payment_status
    `
  ]);

  const orders = orderStats[0].orders;
  const revenue = orderStats[0].revenue;
  const visitors = visitorCount[0].n;

  return res.status(200).json({
    ok: true,
    range: { label: range.label, start: start.getTime(), end: end.getTime() },
    revenue, orders,
    aov: orders ? revenue / orders : 0,
    visitors,
    // "conversion" here is a simple orders/visitors ratio, not a true
    // funnel — there's no per-session purchase attribution, just
    // aggregate pageview sessions vs. orders in the same window. Useful
    // as a trend indicator, not a precise rate.
    conversionRate: visitors ? (orders / visitors) * 100 : 0,
    newCustomers: customerSplit[0] ? customerSplit[0].new_customers : 0,
    returningCustomers: customerSplit[0] ? customerSplit[0].returning_customers : 0,
    bestSellers: bestSellers.map(r => ({ productId: r.product_id, name: r.name, qty: r.qty, revenue: r.revenue })),
    worstSellers: worstSellers.map(r => ({ productId: r.product_id, name: r.name, qty: r.qty })),
    orderStatusBreakdown: orderStatusRows.map(r => ({ status: r.order_status, count: r.n })),
    paymentStatusBreakdown: paymentStatusRows.map(r => ({ status: r.payment_status, count: r.n }))
  });
}

module.exports = async (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  if (!sql) return res.status(500).json({ ok: false, error: 'Database is not configured.' });

  if (req.query.action === 'live') {
    try { return await liveCount(req, res); }
    catch (e) { console.error('[admin/analytics] live error:', e); return res.status(500).json({ ok: false, error: 'Could not load live visitor count.' }); }
  }
  if (req.query.action === 'range') {
    try { return await rangeAnalytics(req, res); }
    catch (e) { console.error('[admin/analytics] range error:', e); return res.status(500).json({ ok: false, error: 'Could not load analytics for that range.' }); }
  }

  try {
    const [
      visitorsToday, visitorsWeek, visitorsMonth, pageViews30d,
      monthlySales, visitorTrend, topProducts, topCategories, topAddToCart
    ] = await Promise.all([
      sql`SELECT count(DISTINCT session_id)::int AS n FROM analytics_events WHERE type = 'pageview' AND created_at >= date_trunc('day', now())`,
      sql`SELECT count(DISTINCT session_id)::int AS n FROM analytics_events WHERE type = 'pageview' AND created_at >= date_trunc('week', now())`,
      sql`SELECT count(DISTINCT session_id)::int AS n FROM analytics_events WHERE type = 'pageview' AND created_at >= date_trunc('month', now())`,
      sql`SELECT count(*)::int AS n FROM analytics_events WHERE type = 'pageview' AND created_at >= now() - interval '30 days'`,

      sql`
        SELECT to_char(date_trunc('month', gs), 'YYYY-MM') AS month,
               COALESCE(o.revenue, 0)::float AS revenue,
               COALESCE(o.orders, 0)::int AS orders
        FROM generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') AS gs
        LEFT JOIN (
          SELECT date_trunc('month', created_at) AS month,
                 sum((pricing->>'total')::numeric) AS revenue,
                 count(*) AS orders
          FROM orders
          WHERE created_at >= date_trunc('month', now()) - interval '11 months'
          GROUP BY 1
        ) o ON o.month = gs
        ORDER BY 1
      `,

      sql`
        SELECT to_char(date_trunc('day', gs), 'YYYY-MM-DD') AS day, COALESCE(v.visitors, 0)::int AS visitors
        FROM generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') AS gs
        LEFT JOIN (
          SELECT date_trunc('day', created_at) AS day, count(DISTINCT session_id) AS visitors
          FROM analytics_events
          WHERE type = 'pageview' AND created_at >= date_trunc('day', now()) - interval '13 days'
          GROUP BY 1
        ) v ON v.day = gs
        ORDER BY 1
      `,

      sql`
        SELECT product_id, product_name, count(*)::int AS views
        FROM analytics_events
        WHERE type = 'product_view' AND product_id IS NOT NULL AND created_at >= now() - interval '90 days'
        GROUP BY product_id, product_name
        ORDER BY views DESC LIMIT 6
      `,

      sql`
        SELECT category, category_name, count(*)::int AS views
        FROM analytics_events
        WHERE type = 'category_view' AND category IS NOT NULL AND created_at >= now() - interval '90 days'
        GROUP BY category, category_name
        ORDER BY views DESC LIMIT 6
      `,

      sql`
        SELECT product_id, product_name, count(*)::int AS adds
        FROM analytics_events
        WHERE type = 'add_to_cart' AND product_id IS NOT NULL AND created_at >= now() - interval '90 days'
        GROUP BY product_id, product_name
        ORDER BY adds DESC LIMIT 6
      `
    ]);

    return res.status(200).json({
      ok: true,
      visitorsToday: visitorsToday[0].n,
      visitorsWeek: visitorsWeek[0].n,
      visitorsMonth: visitorsMonth[0].n,
      pageViews30d: pageViews30d[0].n,
      monthlySales,
      visitorTrend,
      topProducts,
      topCategories,
      topAddToCart
    });
  } catch (e) {
    console.error('[admin/analytics] error:', e);
    return res.status(500).json({ ok: false, error: 'Could not load analytics.' });
  }
};
