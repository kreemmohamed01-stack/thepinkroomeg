/* POST /api/track — public, no auth (called by every visitor's browser
   via analytics.js). Records one event and always refreshes the
   session's "last seen" timestamp (used for the dashboard's live
   active-visitor count). Heartbeats update last_seen but are not
   stored as events — see db/schema.sql for why. */
const { sql } = require('./_lib/db');
const { describeVisitor } = require('./_lib/visitor');

const VALID_TYPES = ['pageview', 'product_view', 'category_view', 'add_to_cart', 'heartbeat'];
const clip = (s, n) => (s == null ? null : String(s).slice(0, n));

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }
  if (!sql) return res.status(200).json({ ok: true }); // fail silently — never break the site over analytics

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(200).json({ ok: true }); } }
  const { type, sessionId, path, productId, productName, category, categoryName } = body || {};

  if (!sessionId || !VALID_TYPES.includes(type)) return res.status(200).json({ ok: true }); // malformed beacon — ignore, don't error the page

  // server-decided, not client-reported — a scraper can lie about
  // sessionId/type but not about the request it's actually making
  const visitor = describeVisitor(req);
  if (visitor.bot) return res.status(200).json({ ok: true }); // known crawler/script — don't count it at all

  try {
    await sql`
      INSERT INTO active_sessions (session_id, last_seen, path, device_type, country)
      VALUES (${clip(sessionId, 100)}, now(), ${clip(path, 300)}, ${visitor.deviceType}, ${visitor.country})
      ON CONFLICT (session_id) DO UPDATE SET last_seen = now(), path = ${clip(path, 300)}, device_type = ${visitor.deviceType}, country = ${visitor.country}
    `;

    if (type !== 'heartbeat') {
      await sql`
        INSERT INTO analytics_events (session_id, type, path, product_id, product_name, category, category_name, device_type, browser, country, city)
        VALUES (${clip(sessionId, 100)}, ${type}, ${clip(path, 300)}, ${clip(productId, 100)}, ${clip(productName, 200)}, ${clip(category, 100)}, ${clip(categoryName, 100)}, ${visitor.deviceType}, ${visitor.browser}, ${visitor.country}, ${visitor.city})
      `;
    }

    // opportunistic cleanup — no cron needed, just prune old rows on ~5%
    // of writes so this table never grows unbounded
    if (Math.random() < 0.05) {
      await sql`DELETE FROM active_sessions WHERE last_seen < now() - interval '1 hour'`;
    }
  } catch (e) {
    console.error('[track] error:', e); // analytics failures are logged but never surfaced to the visitor
  }

  return res.status(200).json({ ok: true });
};
