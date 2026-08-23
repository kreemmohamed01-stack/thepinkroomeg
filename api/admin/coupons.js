/* ============================================================
   THE PINK ROOM — admin coupons + promotions API (auth required on
   every route). Coupons and "sale campaign" promotions both live here
   (rather than promotions getting their own file) purely to stay under
   Vercel Hobby's serverless-function-per-deployment cap — they're
   otherwise unrelated features, just shown on the same dashboard page.

   ---- coupons (customer types a code at checkout) ----
   GET    /api/admin/coupons              — list all
   GET    /api/admin/coupons?code=...     — single coupon
   POST   /api/admin/coupons              — create
   PATCH  /api/admin/coupons              — update (code in body)
   DELETE /api/admin/coupons?code=...     — delete

   ---- promotions ("sale campaigns" — automatic, no code needed) ----
   GET    /api/admin/coupons?action=promotions          — list all
   GET    /api/admin/coupons?action=promotions&id=...    — single
   POST   /api/admin/coupons?action=promotions           — create
   PATCH  /api/admin/coupons?action=promotions            — update (id in body)
   DELETE /api/admin/coupons?action=promotions&id=...     — delete
   POST   /api/admin/coupons?action=toggle-promotion-product
     { productId, promotionId | null } — used by the product edit
     drawer's single "Campaign" dropdown: puts productId in the chosen
     promotion's product list and takes it out of every other one, so a
     product is only ever in the one campaign picked there (a campaign
     can still be given more products from its own drawer on this page,
     which allows the usual multi-select).
   ============================================================ */
const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { rowToPromotion } = require('../_lib/promotions');

function rowToCoupon(r) {
  return {
    code: r.code,
    type: r.type,
    value: Number(r.value),
    label: r.label,
    minOrderTotal: r.min_order_total == null ? null : Number(r.min_order_total),
    maxDiscount: r.max_discount == null ? null : Number(r.max_discount),
    usageLimit: r.usage_limit,
    usageCount: r.usage_count,
    startsAt: r.starts_at ? new Date(r.starts_at).getTime() : null,
    expiresAt: r.expires_at ? new Date(r.expires_at).getTime() : null,
    active: !!r.active,
    createdAt: new Date(r.created_at).getTime()
  };
}

function validateCoupon(body) {
  if (!body || !body.code || !String(body.code).trim()) return { error: 'Code is required.' };
  const code = String(body.code).trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9_-]{2,30}$/.test(code)) return { error: 'Code must be 2-30 letters/numbers/dashes, no spaces.' };
  if (!['percent', 'fixed'].includes(body.type)) return { error: 'Type must be "percent" or "fixed".' };
  const value = Number(body.value);
  if (isNaN(value) || value <= 0) return { error: 'Value must be a positive number.' };
  if (body.type === 'percent' && value > 100) return { error: 'A percent discount can\'t exceed 100.' };

  return {
    values: {
      code, type: body.type, value,
      label: body.label ? String(body.label).trim() : null,
      minOrderTotal: body.minOrderTotal == null || body.minOrderTotal === '' ? null : Number(body.minOrderTotal),
      maxDiscount: body.maxDiscount == null || body.maxDiscount === '' ? null : Number(body.maxDiscount),
      usageLimit: body.usageLimit == null || body.usageLimit === '' ? null : Math.max(1, Math.round(Number(body.usageLimit))),
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      active: body.active !== false
    }
  };
}

async function listCoupons(req, res) {
  const rows = await sql`SELECT * FROM coupons ORDER BY created_at DESC`;
  return res.status(200).json({ ok: true, coupons: rows.map(rowToCoupon) });
}

async function getCoupon(req, res) {
  const rows = await sql`SELECT * FROM coupons WHERE code = ${String(req.query.code).toUpperCase()}`;
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Coupon not found.' });
  return res.status(200).json({ ok: true, coupon: rowToCoupon(rows[0]) });
}

async function createCoupon(req, res) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); } }
  const { error, values: v } = validateCoupon(body);
  if (error) return res.status(400).json({ ok: false, error });

  try {
    await sql`
      INSERT INTO coupons (code, type, value, label, min_order_total, max_discount, usage_limit, starts_at, expires_at, active)
      VALUES (${v.code}, ${v.type}, ${v.value}, ${v.label}, ${v.minOrderTotal}, ${v.maxDiscount}, ${v.usageLimit}, ${v.startsAt}, ${v.expiresAt}, ${v.active})
    `;
  } catch (e) {
    if (e.message && /duplicate key/i.test(e.message)) return res.status(409).json({ ok: false, error: `Coupon "${v.code}" already exists.` });
    console.error('[admin/coupons] insert failed:', e);
    return res.status(500).json({ ok: false, error: 'Could not create the coupon.' });
  }
  const rows = await sql`SELECT * FROM coupons WHERE code = ${v.code}`;
  return res.status(200).json({ ok: true, coupon: rowToCoupon(rows[0]) });
}

async function updateCoupon(req, res) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); } }
  const originalCode = body && body.originalCode ? String(body.originalCode).toUpperCase() : null;
  if (!originalCode) return res.status(400).json({ ok: false, error: 'Missing coupon code.' });

  const { error, values: v } = validateCoupon(body);
  if (error) return res.status(400).json({ ok: false, error });

  try {
    await sql`
      UPDATE coupons SET
        code = ${v.code}, type = ${v.type}, value = ${v.value}, label = ${v.label},
        min_order_total = ${v.minOrderTotal}, max_discount = ${v.maxDiscount}, usage_limit = ${v.usageLimit},
        starts_at = ${v.startsAt}, expires_at = ${v.expiresAt}, active = ${v.active}, updated_at = now()
      WHERE code = ${originalCode}
    `;
  } catch (e) {
    if (e.message && /duplicate key/i.test(e.message)) return res.status(409).json({ ok: false, error: `Coupon "${v.code}" already exists.` });
    console.error('[admin/coupons] update failed:', e);
    return res.status(500).json({ ok: false, error: 'Could not save the coupon.' });
  }
  const rows = await sql`SELECT * FROM coupons WHERE code = ${v.code}`;
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Coupon not found.' });
  return res.status(200).json({ ok: true, coupon: rowToCoupon(rows[0]) });
}

async function deleteCoupon(req, res) {
  const code = req.query.code;
  if (!code) return res.status(400).json({ ok: false, error: 'Missing coupon code.' });
  const rows = await sql`DELETE FROM coupons WHERE code = ${String(code).toUpperCase()} RETURNING code`;
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Coupon not found.' });
  return res.status(200).json({ ok: true });
}

/* ------------------------------------------------------------
   promotions — "sale campaigns"
   ------------------------------------------------------------ */
function validatePromotion(body) {
  if (!body || !body.label || !String(body.label).trim()) return { error: 'Campaign name is required.' };
  const value = Number(body.value);
  if (isNaN(value) || value <= 0) return { error: 'Discount must be a positive number.' };
  if (value > 90) return { error: "A campaign discount can't exceed 90%." };
  const productIds = Array.isArray(body.productIds) ? [...new Set(body.productIds.filter(Boolean).map(String))] : [];

  return {
    values: {
      label: String(body.label).trim().slice(0, 100),
      type: 'percent',
      value,
      productIds,
      active: body.active !== false,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null
    }
  };
}

async function listPromotions(req, res) {
  const rows = await sql`SELECT * FROM promotions ORDER BY created_at DESC`;
  return res.status(200).json({ ok: true, promotions: rows.map(rowToPromotion) });
}

async function getPromotion(req, res) {
  const rows = await sql`SELECT * FROM promotions WHERE id = ${req.query.id}`;
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Campaign not found.' });
  return res.status(200).json({ ok: true, promotion: rowToPromotion(rows[0]) });
}

async function createPromotion(req, res) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); } }
  const { error, values: v } = validatePromotion(body);
  if (error) return res.status(400).json({ ok: false, error });

  const rows = await sql`
    INSERT INTO promotions (label, type, value, product_ids, active, starts_at, expires_at)
    VALUES (${v.label}, ${v.type}, ${v.value}, ${JSON.stringify(v.productIds)}::jsonb, ${v.active}, ${v.startsAt}, ${v.expiresAt})
    RETURNING *
  `;
  return res.status(200).json({ ok: true, promotion: rowToPromotion(rows[0]) });
}

async function updatePromotion(req, res) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); } }
  const id = body && body.id;
  if (!id) return res.status(400).json({ ok: false, error: 'Missing campaign id.' });

  const { error, values: v } = validatePromotion(body);
  if (error) return res.status(400).json({ ok: false, error });

  const rows = await sql`
    UPDATE promotions SET
      label = ${v.label}, type = ${v.type}, value = ${v.value}, product_ids = ${JSON.stringify(v.productIds)}::jsonb,
      active = ${v.active}, starts_at = ${v.startsAt}, expires_at = ${v.expiresAt}, updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Campaign not found.' });
  return res.status(200).json({ ok: true, promotion: rowToPromotion(rows[0]) });
}

async function deletePromotion(req, res) {
  const id = req.query.id;
  if (!id) return res.status(400).json({ ok: false, error: 'Missing campaign id.' });
  const rows = await sql`DELETE FROM promotions WHERE id = ${id} RETURNING id`;
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Campaign not found.' });
  return res.status(200).json({ ok: true });
}

/* Moves one product between campaigns in a single round trip — pulls it
   out of every promotion's product_ids (jsonb array subtraction via a
   rebuild, there being no built-in "remove element" jsonb op) and, if a
   target promotion was given, adds it there. */
async function togglePromotionProduct(req, res) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); } }
  const productId = body && body.productId ? String(body.productId) : null;
  const promotionId = body && body.promotionId ? Number(body.promotionId) : null;
  if (!productId) return res.status(400).json({ ok: false, error: 'Missing product id.' });

  const rows = await sql`SELECT id, product_ids FROM promotions`;
  for (const r of rows) {
    const ids = Array.isArray(r.product_ids) ? r.product_ids : [];
    const shouldContain = promotionId != null && r.id === promotionId;
    const contains = ids.includes(productId);
    if (shouldContain && !contains) {
      await sql`UPDATE promotions SET product_ids = product_ids || ${JSON.stringify([productId])}::jsonb, updated_at = now() WHERE id = ${r.id}`;
    } else if (!shouldContain && contains) {
      const next = ids.filter(x => x !== productId);
      await sql`UPDATE promotions SET product_ids = ${JSON.stringify(next)}::jsonb, updated_at = now() WHERE id = ${r.id}`;
    }
  }
  return res.status(200).json({ ok: true });
}

module.exports = async (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  if (!sql) return res.status(500).json({ ok: false, error: 'Database is not configured.' });

  const action = req.query.action;

  try {
    if (action === 'promotions') {
      if (req.method === 'GET') return req.query.id ? await getPromotion(req, res) : await listPromotions(req, res);
      if (req.method === 'POST') return await createPromotion(req, res);
      if (req.method === 'PATCH') return await updatePromotion(req, res);
      if (req.method === 'DELETE') return await deletePromotion(req, res);
      res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
      return res.status(405).json({ ok: false, error: 'Method not allowed.' });
    }
    if (action === 'toggle-promotion-product') {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'Method not allowed.' }); }
      return await togglePromotionProduct(req, res);
    }

    if (req.method === 'GET') return req.query.code ? await getCoupon(req, res) : await listCoupons(req, res);
    if (req.method === 'POST') return await createCoupon(req, res);
    if (req.method === 'PATCH') return await updateCoupon(req, res);
    if (req.method === 'DELETE') return await deleteCoupon(req, res);
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  } catch (e) {
    console.error('[admin/coupons] error:', e);
    return res.status(500).json({ ok: false, error: 'Something went wrong.' });
  }
};
