/* Shared between /api/products.js (public) and /api/admin/products.js
   (dashboard CRUD) — one mapping so the shape returned to the browser
   is always identical to what catalog.js used to hardcode, meaning
   category.html / product.html / index.html don't need to know or
   care that the data now comes from Postgres instead of a JS array. */

function parseMaybe(v, fallback){
  if (v == null) return fallback;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

function rowToProduct(row){
  const extra = parseMaybe(row.extra, {}) || {};
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    categoryName: row.category_name,
    subcategory: row.subcategory,
    subcategoryName: row.subcategory_name,
    size: row.size,
    price: row.price == null ? null : Number(row.price),
    salePrice: row.sale_price == null ? null : Number(row.sale_price),
    images: parseMaybe(row.images, []),
    sizeLabel: row.size_label,
    dimensions: extra.dimensions || null,
    finish: extra.finish || null,
    finishes: extra.finishes || null,
    shortDescription: row.short_description,
    material: row.material,
    color: row.color,
    availability: row.availability,
    sku: row.sku,
    collection: extra.collection || [],
    _provisional: extra._provisional || [],
    rooms: extra.rooms || [],
    // additional categories this product is also listed under, on top of
    // its primary `category` — see productPlacements() in catalog.js
    extraCategories: extra.extraCategories || [],
    isNew: !!row.is_new,
    createdAt: new Date(row.created_at).getTime(),
    trackInventory: !!row.track_inventory,
    stockQuantity: row.stock_quantity == null ? 0 : Number(row.stock_quantity),
    lowStockThreshold: row.low_stock_threshold == null ? 5 : Number(row.low_stock_threshold)
  };
}

/* Validates + normalizes an incoming product payload from the dashboard
   before it's written to the DB. Returns { error } or { values } where
   values is ready to spread into an INSERT/UPDATE param list. */
function validateProduct(p){
  if (!p || typeof p !== 'object') return { error: 'Missing product payload.' };
  if (!p.name || !String(p.name).trim()) return { error: 'Name is required.' };
  if (!p.category || !String(p.category).trim()) return { error: 'Category is required.' };
  if (!Array.isArray(p.images)) return { error: 'Images must be a list.' };
  if (p.price != null && (isNaN(Number(p.price)) || Number(p.price) < 0)) return { error: 'Price must be a positive number.' };
  if (p.salePrice != null && (isNaN(Number(p.salePrice)) || Number(p.salePrice) < 0)) return { error: 'Sale price must be a positive number.' };
  if (p.stockQuantity != null && (isNaN(Number(p.stockQuantity)) || Number(p.stockQuantity) < 0)) return { error: 'Stock quantity must be a positive number.' };
  if (p.lowStockThreshold != null && (isNaN(Number(p.lowStockThreshold)) || Number(p.lowStockThreshold) < 0)) return { error: 'Low stock threshold must be a positive number.' };

  const slugify = (s) => String(s).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const slug = p.slug ? slugify(p.slug) : slugify(p.name);
  if (!slug) return { error: 'Could not derive a URL slug from the name.' };

  const category = String(p.category).trim();

  /* Extra categories the product is ALSO listed under (dashboard's
     "Also show in" checkboxes). Same shape as the primary placement so
     the front end can treat them identically. The primary category and
     any duplicates are dropped so a product can never be listed twice
     in the same place. */
  const seenCats = new Set([category]);
  const extraCategories = (Array.isArray(p.extraCategories) ? p.extraCategories : [])
    .map(e => {
      if (!e) return null;
      const cat = String(e.category || '').trim();
      if (!cat || seenCats.has(cat)) return null;
      seenCats.add(cat);
      return {
        category: cat,
        categoryName: e.categoryName ? String(e.categoryName).trim() : cat,
        subcategory: e.subcategory || null,
        subcategoryName: e.subcategoryName || null
      };
    })
    .filter(Boolean);

  return {
    values: {
      name: String(p.name).trim(),
      slug,
      category,
      categoryName: p.categoryName ? String(p.categoryName).trim() : String(p.category).trim(),
      subcategory: p.subcategory || null,
      subcategoryName: p.subcategoryName || null,
      size: p.size || null,
      price: p.price == null || p.price === '' ? null : Number(p.price),
      salePrice: p.salePrice == null || p.salePrice === '' ? null : Number(p.salePrice),
      images: p.images.filter(Boolean),
      sizeLabel: p.sizeLabel || null,
      shortDescription: p.shortDescription || null,
      material: p.material || null,
      color: p.color || null,
      availability: p.availability || 'In Stock',
      sku: p.sku || null,
      isNew: !!p.isNew,
      trackInventory: !!p.trackInventory,
      stockQuantity: p.stockQuantity == null || p.stockQuantity === '' ? 0 : Math.max(0, Math.round(Number(p.stockQuantity))),
      lowStockThreshold: p.lowStockThreshold == null || p.lowStockThreshold === '' ? 5 : Math.max(0, Math.round(Number(p.lowStockThreshold))),
      extra: {
        dimensions: p.dimensions || null,
        finish: p.finish || null,
        finishes: p.finishes || null,
        collection: Array.isArray(p.collection) ? p.collection : [],
        rooms: Array.isArray(p.rooms) ? p.rooms : [],
        extraCategories,
        _provisional: Array.isArray(p._provisional) ? p._provisional : []
      }
    }
  };
}

module.exports = { rowToProduct, validateProduct };
