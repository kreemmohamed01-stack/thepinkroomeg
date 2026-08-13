/* ============================================================
   THE PINK ROOM — admin coupons API (auth required on every route)
   GET    /api/admin/coupons              — list all
   GET    /api/admin/coupons?code=...     — single coupon
   POST   /api/admin/coupons              — create
   PATCH  /api/admin/coupons              — update (code in body)
   DELETE /api/admin/coupons?code=...     — delete
   ============================================================ */
const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');

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

module.exports = async (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  if (!sql) return res.status(500).json({ ok: false, error: 'Database is not configured.' });

  try {
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
