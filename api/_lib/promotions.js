/* Shared "sale campaign" logic — used by the public product read
   (api/products.js), the checkout price recompute (api/orders.js), and
   the admin CRUD (api/admin/promotions.js). A promotion never changes
   what's stored on products.sale_price; it's overlaid on top at read
   time, so turning a promotion off (or unpicking a product from it)
   reverts that product to its real price with nothing to undo. */
const { sql } = require('./db');

function rowToPromotion(r) {
  return {
    id: r.id,
    label: r.label,
    type: r.type,
    value: Number(r.value),
    productIds: Array.isArray(r.product_ids) ? r.product_ids : (r.product_ids ? JSON.parse(r.product_ids) : []),
    active: !!r.active,
    startsAt: r.starts_at ? new Date(r.starts_at).getTime() : null,
    expiresAt: r.expires_at ? new Date(r.expires_at).getTime() : null,
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime()
  };
}

/* Every promotion that's currently live: active flag set, and (if
   given) the current time falls inside starts_at/expires_at. This is
   the single definition of "live" — the banner, the price overlay and
   checkout all call this instead of re-deriving the rule themselves. */
async function getActivePromotions() {
  if (!sql) return [];
  const rows = await sql`
    SELECT * FROM promotions
    WHERE active = true
      AND (starts_at IS NULL OR starts_at <= now())
      AND (expires_at IS NULL OR expires_at >= now())
    ORDER BY created_at ASC
  `;
  return rows.map(rowToPromotion);
}

/* For one product id, the best (largest) live discount percent that
   applies to it, plus which promotion gave it — or null if none does.
   "Best" matters once two campaigns are allowed to run at once and
   happen to overlap on the same product. */
function bestPromotionFor(productId, activePromotions) {
  let best = null;
  for (const promo of activePromotions) {
    if (!promo.productIds.includes(productId)) continue;
    if (!best || promo.value > best.value) best = promo;
  }
  return best;
}

/* Applies the campaign discount on top of a product's own price/
   sale_price, in place, mutating `salePrice` — every page already
   renders sale price/strikethrough/badges purely from `salePrice`, so
   this is the only touchpoint the rest of the app needs. Returns the
   same array for convenience. */
function applyPromotions(products, activePromotions) {
  if (!activePromotions.length) return products;
  for (const p of products) {
    const promo = bestPromotionFor(p.id, activePromotions);
    if (!promo || p.price == null) continue;
    const base = p.salePrice != null ? p.salePrice : p.price;
    const discounted = Math.round(base * (1 - promo.value / 100));
    p.salePrice = Math.max(0, Math.min(discounted, base));
    p.activePromotion = { id: promo.id, label: promo.label, value: promo.value };
  }
  return products;
}

/* Same overlay, but for the checkout's server-side price recompute,
   which only has {id, price, sale_price} rows (not full product
   objects) — kept separate so api/orders.js doesn't need to build
   fuller product shapes just to get a number back. */
function effectivePrice(id, price, salePrice, activePromotions) {
  const promo = bestPromotionFor(id, activePromotions);
  const base = salePrice != null ? salePrice : price;
  if (!promo || base == null) return base;
  const discounted = Math.round(base * (1 - promo.value / 100));
  return Math.max(0, Math.min(discounted, base));
}

module.exports = { rowToPromotion, getActivePromotions, bestPromotionFor, applyPromotions, effectivePrice };
