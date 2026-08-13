/* GET /api/products — public, no auth. Returns every product, in the
   exact shape catalog.js used to hardcode, so category.html/product.html/
   index.html/wishlist.html/shared-ui.js can all keep working with a
   `PRODUCTS` array without knowing it now comes from Postgres. Small
   catalogue (dozens, not thousands) — returning everything in one
   response matches how the site already worked, no pagination needed
   here yet.

   GET  /api/products?action=site-structure       — categories/rooms/top-sellers/homepage content
   GET  /api/products?action=reviews&productId=... — approved reviews + average for one product
   POST /api/products?action=review                — submit a review (goes to 'pending', moderated in the dashboard)
   All folded into this one public file rather than new ones — same
   public-catalog concern, keeps the serverless function count down. */
const { sql } = require('./_lib/db');
const { rowToProduct } = require('./_lib/products');
const { getSetting } = require('./_lib/settings');

async function siteStructure(req, res) {
  const empty = { categories: null, rooms: null, topSellers: null, homepageContent: null, storeSettings: null };
  if (!sql) return res.status(200).json({ ok: true, ...empty });
  try {
    const [categories, rooms, topSellers, homepageContent, storeSettings] = await Promise.all([
      getSetting('categories', null),
      getSetting('rooms', null),
      getSetting('top_sellers', null),
      getSetting('homepage_content', null),
      getSetting('store_settings', null)
    ]);
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ ok: true, categories, rooms, topSellers, homepageContent, storeSettings });
  } catch (e) {
    console.error('[products] site-structure error:', e);
    return res.status(200).json({ ok: true, ...empty }); // never break the homepage over this
  }
}

async function listReviews(req, res) {
  const productId = req.query.productId;
  if (!productId) return res.status(400).json({ ok: false, error: 'Missing productId.' });
  if (!sql) return res.status(200).json({ ok: true, reviews: [], average: 0, count: 0 });

  const rows = await sql`
    SELECT id, name, rating, title, body, created_at FROM reviews
    WHERE product_id = ${productId} AND status = 'approved'
    ORDER BY created_at DESC
  `;
  const count = rows.length;
  const average = count ? rows.reduce((s, r) => s + r.rating, 0) / count : 0;
  return res.status(200).json({
    ok: true, count, average,
    reviews: rows.map(r => ({ id: r.id, name: r.name, rating: r.rating, title: r.title || '', body: r.body, createdAt: new Date(r.created_at).getTime() }))
  });
}

async function submitReview(req, res) {
  if (!sql) return res.status(500).json({ ok: false, error: 'Database is not configured.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); } }
  const { productId, name, email, rating, title, body: text } = body || {};

  if (!productId) return res.status(400).json({ ok: false, error: 'Missing product.' });
  if (!name || !String(name).trim()) return res.status(400).json({ ok: false, error: 'Name is required.' });
  const r = Math.round(Number(rating));
  if (!r || r < 1 || r > 5) return res.status(400).json({ ok: false, error: 'Rating must be 1-5 stars.' });
  if (!text || !String(text).trim()) return res.status(400).json({ ok: false, error: 'Review text is required.' });
  if (String(text).length > 3000) return res.status(400).json({ ok: false, error: 'Review is too long.' });

  const check = await sql`SELECT id FROM products WHERE id = ${productId}`;
  if (!check.length) return res.status(404).json({ ok: false, error: 'Product not found.' });

  await sql`
    INSERT INTO reviews (product_id, name, email, rating, title, body, status)
    VALUES (${productId}, ${String(name).trim().slice(0,100)}, ${email ? String(email).trim().slice(0,200) : null}, ${r}, ${title ? String(title).trim().slice(0,150) : null}, ${String(text).trim()}, 'pending')
  `;
  return res.status(200).json({ ok: true });
}

module.exports = async (req, res) => {
  const action = req.query.action;

  if (action === 'site-structure') {
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }); }
    return siteStructure(req, res);
  }
  if (action === 'reviews') {
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }); }
    try { return await listReviews(req, res); }
    catch (e) { console.error('[products] reviews error:', e); return res.status(500).json({ ok: false, error: 'Could not load reviews.' }); }
  }
  if (action === 'review') {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }); }
    try { return await submitReview(req, res); }
    catch (e) { console.error('[products] review submit error:', e); return res.status(500).json({ ok: false, error: 'Could not submit review.' }); }
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }
  if (!sql) return res.status(500).json({ ok: false, error: 'Database is not configured.' });

  try {
    const rows = await sql`SELECT * FROM products ORDER BY sort_order ASC, created_at DESC`;
    // cache at the edge for a minute — product data doesn't change every
    // second, and this cuts DB load on a page that every visitor loads
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ ok: true, products: rows.map(rowToProduct) });
  } catch (e) {
    console.error('[products] error:', e);
    return res.status(500).json({ ok: false, error: 'Could not load products.' });
  }
};
