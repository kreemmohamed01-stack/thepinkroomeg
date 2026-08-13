/* Shared coupon validation — used by both the public "apply code"
   preview (api/orders.js?action=validate-coupon) and the authoritative
   check that runs again at order creation. Same function both times on
   purpose: a code that previews as valid but fails at checkout (someone
   else used the last redemption in between) is a real, honest race —
   not a bug — and the client-sent discount is never trusted either way. */
const { sql } = require('./db');

function moneyStr(n){ return 'EGP ' + Math.round(Number(n) || 0).toLocaleString('en-US'); }

/* Returns { discount, code, pct, label } on success or { error } on
   failure. `subtotal` must already be server-computed (real product
   prices), never the client's number. */
async function validateCoupon(rawCode, subtotal) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return { discount: 0, code: null, pct: null, label: null };

  const rows = await sql`SELECT * FROM coupons WHERE code = ${code}`;
  if (!rows.length) return { error: `Promo code "${code}" isn't valid.` };
  const c = rows[0];

  if (!c.active) return { error: `Promo code "${code}" is no longer active.` };
  const now = new Date();
  if (c.starts_at && new Date(c.starts_at) > now) return { error: `Promo code "${code}" isn't active yet.` };
  if (c.expires_at && new Date(c.expires_at) < now) return { error: `Promo code "${code}" has expired.` };
  if (c.usage_limit != null && c.usage_count >= c.usage_limit) return { error: `Promo code "${code}" has reached its usage limit.` };
  if (c.min_order_total != null && subtotal < Number(c.min_order_total)) {
    return { error: `Promo code "${code}" needs a minimum order of ${moneyStr(c.min_order_total)}.` };
  }

  let discount = c.type === 'percent'
    ? Math.round(subtotal * Number(c.value) / 100)
    : Math.round(Number(c.value));
  if (c.max_discount != null) discount = Math.min(discount, Number(c.max_discount));
  discount = Math.max(0, Math.min(discount, subtotal)); // never below zero, never more than the order

  const label = c.label || (c.type === 'percent' ? `${Number(c.value)}% off` : `${moneyStr(c.value)} off`);
  return { discount, code, pct: c.type === 'percent' ? Number(c.value) / 100 : null, label };
}

module.exports = { validateCoupon };
