/* GET /api/products — public, no auth. Returns every product, in the
   exact shape catalog.js used to hardcode, so category.html/product.html/
   index.html/wishlist.html/shared-ui.js can all keep working with a
   `PRODUCTS` array without knowing it now comes from Postgres. Small
   catalogue (dozens, not thousands) — returning everything in one
   response matches how the site already worked, no pagination needed
   here yet.

   GET  /api/products?action=site-structure          — categories/rooms/top-sellers/homepage content
   GET  /api/products?action=reviews&productId=...    — approved reviews + average for one product
   POST /api/products?action=review                   — submit a review (goes to 'pending', moderated in the dashboard)
   POST /api/products?action=newsletter-subscribe      — "Stay Inspired" homepage form
   GET  /api/products?action=newsletter-unsubscribe    — one-click unsubscribe link (from the email itself)
   GET  /api/products?action=sitemap                   — XML sitemap (rewritten to /sitemap.xml, see vercel.json)
   All folded into this one public file rather than new ones — same
   public-catalog concern, keeps the serverless function count down. */
const { sql } = require('./_lib/db');
const { rowToProduct } = require('./_lib/products');
const { getSetting } = require('./_lib/settings');
const { sendNewsletterWelcome, verifyUnsubscribeToken } = require('./_lib/notify');
const { getActivePromotions, applyPromotions } = require('./_lib/promotions');

const SITE_URL = 'https://thepinkroomeg.com';

async function siteStructure(req, res) {
  const empty = { categories: null, rooms: null, topSellers: null, homepageContent: null, storeSettings: null, activePromotions: [] };
  if (!sql) return res.status(200).json({ ok: true, ...empty });
  try {
    const [categories, rooms, topSellers, homepageContent, storeSettings, activePromotions] = await Promise.all([
      getSetting('categories', null),
      getSetting('rooms', null),
      getSetting('top_sellers', null),
      getSetting('homepage_content', null),
      getSetting('store_settings', null),
      getActivePromotions()
    ]);
    // the banner only needs label/value, not the product id list
    const bannerPromotions = activePromotions.map(p => ({ id: p.id, label: p.label, value: p.value }));
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ ok: true, categories, rooms, topSellers, homepageContent, storeSettings, activePromotions: bannerPromotions });
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

async function sitemap(req, res) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  // NOTE: the site also has prettier /paintings, /products/:slug,
  // /rooms/:room style rewrites defined in vercel.json, but those are
  // currently broken in production (return 404 — a pre-existing routing
  // issue, not something this sitemap should paper over). Using the
  // ?query= URLs here instead since they're the ones confirmed to
  // actually work (cleanUrls strips .html automatically) — a sitemap
  // full of 404s would be actively harmful, not just cosmetically ugly.
  const staticUrls = [
    { loc: '/', priority: '1.0', changefreq: 'daily' },
    { loc: '/category?cat=paintings', priority: '0.8', changefreq: 'weekly' },
    { loc: '/category?cat=accessories', priority: '0.8', changefreq: 'weekly' },
    { loc: '/category?cat=lighting', priority: '0.8', changefreq: 'weekly' },
    { loc: '/category?cat=furniture', priority: '0.8', changefreq: 'weekly' },
    { loc: '/category?cat=wall-art', priority: '0.8', changefreq: 'weekly' },
    { loc: '/category?cat=plants', priority: '0.8', changefreq: 'weekly' },
    { loc: '/category?cat=sale-offers', priority: '0.8', changefreq: 'weekly' },
    { loc: '/refund-return-policy', priority: '0.3', changefreq: 'monthly' }
  ];

  let productUrls = [];
  let roomUrls = [];
  try {
    if (sql) {
      const rows = await sql`SELECT slug, updated_at FROM products ORDER BY updated_at DESC`;
      productUrls = rows.map(r => ({ loc: '/product?slug=' + r.slug, priority: '0.7', changefreq: 'weekly', lastmod: new Date(r.updated_at).toISOString().slice(0, 10) }));
      const rooms = await getSetting('rooms', null);
      if (rooms) roomUrls = Object.keys(rooms).map(k => ({ loc: '/category?room=' + k, priority: '0.6', changefreq: 'weekly' }));
    }
  } catch (e) {
    console.error('[products] sitemap error:', e);
  }

  const all = [...staticUrls, ...roomUrls, ...productUrls];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map(u => `  <url>
    <loc>${SITE_URL}${u.loc}</loc>
${u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : ''}    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return res.status(200).send(xml);
}

function isValidEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
function baseUrlOf(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${req.headers.host}`;
}

async function newsletterSubscribe(req, res) {
  if (!sql) return res.status(500).json({ ok: false, error: 'Database is not configured.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); } }
  const email = body && body.email ? String(body.email).trim().toLowerCase() : '';
  if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: 'Enter a valid email address.' });

  await sql`
    INSERT INTO newsletter_subscribers (email) VALUES (${email})
    ON CONFLICT (email) DO UPDATE SET unsubscribed = false, unsubscribed_at = NULL
  `;
  // best-effort — a slow/failed welcome email should never fail the signup itself
  sendNewsletterWelcome(email, baseUrlOf(req)).catch(() => {});
  return res.status(200).json({ ok: true });
}

async function newsletterUnsubscribe(req, res) {
  const email = req.query.email ? String(req.query.email).trim().toLowerCase() : '';
  const token = req.query.token;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const page = (title, message) => res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | The Pink Room</title>
    <style>body{font-family:Arial,Helvetica,sans-serif;background:#f8f4ee;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
    .box{max-width:420px;text-align:center;background:#fff;border:1px solid #e2d8c6;border-radius:6px;padding:36px 28px}
    p{color:#3a362f;font-size:11px;letter-spacing:3px;margin:0 0 10px}
    h1{font-family:Georgia,serif;font-weight:400;font-style:italic;font-size:20px;color:#1c1a17;margin:0 0 14px}
    span{font-size:13px;color:#6b6459;line-height:1.7}
    a{color:#c9a97c}</style></head>
    <body><div class="box"><p>THE PINK ROOM</p><h1>${title}</h1><span>${message}</span></div></body></html>`);

  if (!email || !isValidEmail(email) || !verifyUnsubscribeToken(email, token)) {
    return page('Link not valid', 'This unsubscribe link is invalid or has expired.');
  }
  if (!sql) return page('Something went wrong', 'Please try again later.');

  await sql`UPDATE newsletter_subscribers SET unsubscribed = true, unsubscribed_at = now() WHERE email = ${email}`;
  return page("You're unsubscribed", `${email} won't receive any more emails from The Pink Room. <a href="/">Back to the site</a>`);
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
  if (action === 'newsletter-subscribe') {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }); }
    try { return await newsletterSubscribe(req, res); }
    catch (e) { console.error('[products] newsletter-subscribe error:', e); return res.status(500).json({ ok: false, error: 'Could not subscribe right now.' }); }
  }
  if (action === 'newsletter-unsubscribe') {
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }); }
    try { return await newsletterUnsubscribe(req, res); }
    catch (e) { console.error('[products] newsletter-unsubscribe error:', e); return res.status(500).json({ ok: false, error: 'Could not process that.' }); }
  }
  if (action === 'sitemap') {
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }); }
    try { return await sitemap(req, res); }
    catch (e) { console.error('[products] sitemap error:', e); return res.status(500).send('Could not generate sitemap.'); }
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }
  if (!sql) return res.status(500).json({ ok: false, error: 'Database is not configured.' });

  try {
    const [rows, activePromotions] = await Promise.all([
      sql`SELECT * FROM products ORDER BY sort_order ASC, created_at DESC`,
      getActivePromotions()
    ]);
    const products = applyPromotions(rows.map(rowToProduct), activePromotions);
    // cache at the edge for a minute — product data doesn't change every
    // second, and this cuts DB load on a page that every visitor loads
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ ok: true, products });
  } catch (e) {
    console.error('[products] error:', e);
    return res.status(500).json({ ok: false, error: 'Could not load products.' });
  }
};
