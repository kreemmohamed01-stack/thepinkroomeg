/* ============================================================
   THE PINK ROOM — admin products API (auth required on every route)
   GET    /api/admin/products                    — list all (search + category filter)
   GET    /api/admin/products?id=...              — single product
   POST   /api/admin/products                     — create
   PATCH  /api/admin/products                     — update (id in body)
   DELETE /api/admin/products?id=...              — delete

   POST   /api/admin/products?action=upload       — image upload (Blob)

   GET    /api/admin/products?action=inventory    — stock levels + low-stock flag, every tracked product
   POST   /api/admin/products?action=stock-adjust — manual stock change { id, change, note }
   GET    /api/admin/products?action=inventory-log[&id=...] — adjustment history

   GET    /api/admin/products?action=reviews[&status=]      — moderation queue
   POST   /api/admin/products?action=review-moderate        — { id, status }
   DELETE /api/admin/products?action=review-delete&id=...   — delete a review

   POST/PATCH above also accept a { notifySubscribers: true } field —
   when set, every active "Stay Inspired" subscriber gets an email
   about the product being saved. Never automatic, only on request.

   Upload, inventory and reviews used to be (or would have been)
   separate files — folded in here (all product-scoped) to stay under
   Vercel Hobby's serverless-function-per-deployment cap as more admin
   modules get added.
   ============================================================ */

const { put } = require('@vercel/blob');
const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { rowToProduct, validateProduct } = require('../_lib/products');
const { notifySubscribersNewProduct } = require('../_lib/notify');

function baseUrlOf(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${req.headers.host}`;
}

/* Only fires when the admin explicitly ticks "notify subscribers" on
   the product form — never automatically on every save, so routine
   edits don't spam the list. Awaited before responding (same as order
   notifications) so the caller's toast reflects what actually
   happened, but never fails the save itself if sending has trouble. */
async function maybeNotifySubscribers(req, product) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  if (!body || !body.notifySubscribers) return null;

  try {
    const subs = await sql`SELECT email FROM newsletter_subscribers WHERE unsubscribed = false`;
    if (!subs.length) return { ok: true, sent: 0, failed: 0 };
    return await notifySubscribersNewProduct(product, subs.map(s => s.email), baseUrlOf(req));
  } catch (e) {
    console.error('[admin/products] notifySubscribers error:', e);
    return { ok: false, error: e.message };
  }
}

async function uploadImage(req, res) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); } }
  const { filename, dataUrl } = body || {};

  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return res.status(400).json({ ok: false, error: 'Missing image data.' });
  }
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) return res.status(400).json({ ok: false, error: 'Unsupported image format.' });

  const [, mime, base64] = match;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > 8 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'Image is too large (max 8MB).' });

  const ext = mime.split('/')[1].replace('jpeg', 'jpg');
  const safeName = (filename || 'product').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40);

  try {
    const blob = await put(`products/${Date.now()}-${safeName}.${ext}`, buffer, {
      access: 'public',
      contentType: mime,
      addRandomSuffix: true
    });
    return res.status(200).json({ ok: true, url: blob.url });
  } catch (e) {
    console.error('[admin/products] upload error:', e);
    return res.status(500).json({ ok: false, error: 'Upload failed.' });
  }
}

async function listInventory(req, res) {
  const rows = await sql`
    SELECT id, name, sku, category_name, stock_quantity, low_stock_threshold, availability
    FROM products WHERE track_inventory = true
    ORDER BY (stock_quantity <= low_stock_threshold) DESC, stock_quantity ASC, name ASC
  `;
  const items = rows.map(r => ({
    id: r.id, name: r.name, sku: r.sku, categoryName: r.category_name,
    stockQuantity: Number(r.stock_quantity), lowStockThreshold: Number(r.low_stock_threshold),
    availability: r.availability,
    status: Number(r.stock_quantity) <= 0 ? 'out' : (Number(r.stock_quantity) <= Number(r.low_stock_threshold) ? 'low' : 'ok')
  }));
  return res.status(200).json({
    ok: true, items,
    lowStockCount: items.filter(i => i.status === 'low').length,
    outOfStockCount: items.filter(i => i.status === 'out').length
  });
}

async function adjustStock(req, res) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); } }
  const { id, change, note } = body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'Missing product id.' });
  const delta = Math.round(Number(change));
  if (!delta || isNaN(delta)) return res.status(400).json({ ok: false, error: 'Change must be a non-zero number.' });

  const rows = await sql`
    UPDATE products SET stock_quantity = GREATEST(0, stock_quantity + ${delta}), track_inventory = true
    WHERE id = ${id} RETURNING id, stock_quantity
  `;
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Product not found.' });

  await sql`INSERT INTO inventory_log (product_id, change, reason, note) VALUES (${id}, ${delta}, 'restock', ${note || null})`;
  return res.status(200).json({ ok: true, stockQuantity: rows[0].stock_quantity });
}

async function inventoryLog(req, res) {
  const id = req.query.id;
  const rows = id
    ? await sql`SELECT l.*, p.name AS product_name FROM inventory_log l LEFT JOIN products p ON p.id = l.product_id WHERE l.product_id = ${id} ORDER BY l.created_at DESC LIMIT 100`
    : await sql`SELECT l.*, p.name AS product_name FROM inventory_log l LEFT JOIN products p ON p.id = l.product_id ORDER BY l.created_at DESC LIMIT 100`;
  return res.status(200).json({
    ok: true,
    entries: rows.map(r => ({
      id: r.id, productId: r.product_id, productName: r.product_name,
      change: r.change, reason: r.reason, orderId: r.order_id, note: r.note,
      createdAt: new Date(r.created_at).getTime()
    }))
  });
}

async function listReviews(req, res) {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : '';
  const rows = status
    ? await sql`SELECT r.*, p.name AS product_name FROM reviews r LEFT JOIN products p ON p.id = r.product_id WHERE r.status = ${status} ORDER BY r.created_at DESC LIMIT 200`
    : await sql`SELECT r.*, p.name AS product_name FROM reviews r LEFT JOIN products p ON p.id = r.product_id ORDER BY r.created_at DESC LIMIT 200`;
  const counts = await sql`SELECT status, count(*)::int AS n FROM reviews GROUP BY status`;
  const countMap = { pending: 0, approved: 0, rejected: 0 };
  counts.forEach(c => { countMap[c.status] = c.n; });
  return res.status(200).json({
    ok: true,
    counts: countMap,
    reviews: rows.map(r => ({
      id: r.id, productId: r.product_id, productName: r.product_name,
      name: r.name, email: r.email, rating: r.rating, title: r.title || '', body: r.body,
      status: r.status, createdAt: new Date(r.created_at).getTime()
    }))
  });
}

async function moderateReview(req, res) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); } }
  const { id, status } = body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'Missing review id.' });
  if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ ok: false, error: 'Invalid status.' });

  const rows = await sql`UPDATE reviews SET status = ${status} WHERE id = ${id} RETURNING id`;
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Review not found.' });
  return res.status(200).json({ ok: true });
}

async function deleteReview(req, res) {
  const id = req.query.id;
  if (!id) return res.status(400).json({ ok: false, error: 'Missing review id.' });
  const rows = await sql`DELETE FROM reviews WHERE id = ${id} RETURNING id`;
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Review not found.' });
  return res.status(200).json({ ok: true });
}

async function listProducts(req, res) {
  const search = String(req.query.q || '').trim();
  const category = String(req.query.category || '').trim();
  const like = '%' + search + '%';

  // the category filter matches a product's primary category OR any of
  // the extra categories it's also listed under (extra.extraCategories),
  // so filtering by e.g. Accessories finds the Sale piece placed there
  const extraMatch = JSON.stringify([{ category }]);

  const rows = await sql`
    SELECT * FROM products
    WHERE (${search} = '' OR name ILIKE ${like} OR slug ILIKE ${like} OR sku ILIKE ${like})
      AND (${category} = '' OR category = ${category}
           OR extra->'extraCategories' @> ${extraMatch}::jsonb)
    ORDER BY category ASC, sort_order ASC, created_at DESC
  `;
  return res.status(200).json({ ok: true, products: rows.map(rowToProduct) });
}

async function getProduct(req, res) {
  const rows = await sql`SELECT * FROM products WHERE id = ${req.query.id} LIMIT 1`;
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Product not found.' });
  return res.status(200).json({ ok: true, product: rowToProduct(rows[0]) });
}

async function createProduct(req, res) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); } }

  const { error, values: v } = validateProduct(body);
  if (error) return res.status(400).json({ ok: false, error });

  const id = body.id || (v.category.slice(0, 4) + '-' + v.slug).slice(0, 60);

  try {
    await sql`
      INSERT INTO products (id, slug, name, category, category_name, subcategory, subcategory_name, price, sale_price, images, size, size_label, short_description, material, color, availability, sku, is_new, extra, track_inventory, stock_quantity, low_stock_threshold)
      VALUES (${id}, ${v.slug}, ${v.name}, ${v.category}, ${v.categoryName}, ${v.subcategory}, ${v.subcategoryName}, ${v.price}, ${v.salePrice}, ${JSON.stringify(v.images)}::jsonb, ${v.size}, ${v.sizeLabel}, ${v.shortDescription}, ${v.material}, ${v.color}, ${v.availability}, ${v.sku}, ${v.isNew}, ${JSON.stringify(v.extra)}::jsonb, ${v.trackInventory}, ${v.stockQuantity}, ${v.lowStockThreshold})
    `;
    if (v.trackInventory && v.stockQuantity > 0) {
      await sql`INSERT INTO inventory_log (product_id, change, reason, note) VALUES (${id}, ${v.stockQuantity}, 'manual', 'Initial stock on product creation')`;
    }
  } catch (e) {
    if (e.message && /duplicate key/i.test(e.message)) return res.status(409).json({ ok: false, error: 'A product with that id or slug already exists.' });
    console.error('[admin/products] insert failed:', e);
    return res.status(500).json({ ok: false, error: 'Could not create the product.' });
  }

  const rows = await sql`SELECT * FROM products WHERE id = ${id}`;
  const product = rowToProduct(rows[0]);
  const notify = await maybeNotifySubscribers(req, product);
  return res.status(200).json({ ok: true, product, notify });
}

async function updateProduct(req, res) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); } }
  const { id } = body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'Missing product id.' });

  const { error, values: v } = validateProduct(body);
  if (error) return res.status(400).json({ ok: false, error });

  try {
    const before = await sql`SELECT stock_quantity FROM products WHERE id = ${id}`;
    if (!before.length) return res.status(404).json({ ok: false, error: 'Product not found.' });
    const prevStock = Number(before[0].stock_quantity) || 0;

    await sql`
      UPDATE products SET
        slug = ${v.slug}, name = ${v.name}, category = ${v.category}, category_name = ${v.categoryName},
        subcategory = ${v.subcategory}, subcategory_name = ${v.subcategoryName},
        price = ${v.price}, sale_price = ${v.salePrice}, images = ${JSON.stringify(v.images)}::jsonb,
        size = ${v.size}, size_label = ${v.sizeLabel}, short_description = ${v.shortDescription},
        material = ${v.material}, color = ${v.color}, availability = ${v.availability}, sku = ${v.sku},
        is_new = ${v.isNew}, extra = ${JSON.stringify(v.extra)}::jsonb, updated_at = now(),
        track_inventory = ${v.trackInventory}, stock_quantity = ${v.stockQuantity}, low_stock_threshold = ${v.lowStockThreshold}
      WHERE id = ${id}
    `;

    if (v.trackInventory && v.stockQuantity !== prevStock) {
      await sql`INSERT INTO inventory_log (product_id, change, reason, note) VALUES (${id}, ${v.stockQuantity - prevStock}, 'manual', 'Stock set from product edit')`;
    }
  } catch (e) {
    if (e.message && /duplicate key/i.test(e.message)) return res.status(409).json({ ok: false, error: 'Another product already uses that slug.' });
    console.error('[admin/products] update failed:', e);
    return res.status(500).json({ ok: false, error: 'Could not save the product.' });
  }

  const rows = await sql`SELECT * FROM products WHERE id = ${id}`;
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Product not found.' });
  const product = rowToProduct(rows[0]);
  const notify = await maybeNotifySubscribers(req, product);
  return res.status(200).json({ ok: true, product, notify });
}

async function deleteProduct(req, res) {
  const id = req.query.id;
  if (!id) return res.status(400).json({ ok: false, error: 'Missing product id.' });
  const rows = await sql`DELETE FROM products WHERE id = ${id} RETURNING id`;
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Product not found.' });
  return res.status(200).json({ ok: true });
}

module.exports = async (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  if (!sql) return res.status(500).json({ ok: false, error: 'Database is not configured.' });

  const action = req.query.action;

  try {
    if (action === 'upload') {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }); }
      return await uploadImage(req, res);
    }
    if (action === 'inventory') {
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }); }
      return await listInventory(req, res);
    }
    if (action === 'stock-adjust') {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }); }
      return await adjustStock(req, res);
    }
    if (action === 'inventory-log') {
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }); }
      return await inventoryLog(req, res);
    }
    if (action === 'reviews') {
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }); }
      return await listReviews(req, res);
    }
    if (action === 'review-moderate') {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }); }
      return await moderateReview(req, res);
    }
    if (action === 'review-delete') {
      if (req.method !== 'DELETE') { res.setHeader('Allow', 'DELETE'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }); }
      return await deleteReview(req, res);
    }

    if (req.method === 'GET') return req.query.id ? await getProduct(req, res) : await listProducts(req, res);
    if (req.method === 'POST') return await createProduct(req, res);
    if (req.method === 'PATCH') return await updateProduct(req, res);
    if (req.method === 'DELETE') return await deleteProduct(req, res);
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  } catch (e) {
    console.error('[admin/products] error:', e);
    return res.status(500).json({ ok: false, error: 'Something went wrong.' });
  }
};
