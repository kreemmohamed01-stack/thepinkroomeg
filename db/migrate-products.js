/* One-time (but safe to re-run — it's an upsert) seed: reads every
   product currently hardcoded in catalog.js and inserts it into the
   `products` table, so the live site can be switched over to reading
   from the database without losing any of the real client data already
   entered. Run:
     node db/migrate-products.js
   Uses the pooled connection — this is normal write traffic, not a
   schema change. */
const fs = require('fs');
const path = require('path');
const { Client } = require('@neondatabase/serverless');

(function loadEnvLocal(){
  const file = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
})();

// catalog.js is a plain browser script (no module.exports) — evaluate it
// in a throwaway function scope, same trick used for every validation
// script earlier in this project, then read PRODUCTS back off it.
const catalogSrc = fs.readFileSync(path.join(__dirname, '..', 'catalog.js'), 'utf8');
const sandbox = {};
new Function('exports', catalogSrc + '\nexports.PRODUCTS = PRODUCTS;')(sandbox);
const PRODUCTS = sandbox.PRODUCTS;

async function main(){
  const conn = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!conn) { console.error('No DATABASE_URL/POSTGRES_URL found. Run `vercel env pull .env.local` first.'); process.exit(1); }
  if (!PRODUCTS || !PRODUCTS.length) { console.error('catalog.js produced no PRODUCTS — nothing to migrate.'); process.exit(1); }

  const client = new Client(conn);
  await client.connect();

  let inserted = 0;
  try {
    for (const p of PRODUCTS) {
      const extra = {
        dimensions: p.dimensions || null,
        finish: p.finish || null,
        finishes: p.finishes || null,
        collection: p.collection || [],
        rooms: p.rooms || [],
        _provisional: p._provisional || []
      };
      await client.query(
        `INSERT INTO products (
           id, slug, name, category, category_name, subcategory, subcategory_name,
           price, sale_price, images, size, size_label, short_description,
           material, color, availability, sku, is_new, extra, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, to_timestamp($20))
         ON CONFLICT (id) DO UPDATE SET
           slug=$2, name=$3, category=$4, category_name=$5, subcategory=$6, subcategory_name=$7,
           price=$8, sale_price=$9, images=$10, size=$11, size_label=$12, short_description=$13,
           material=$14, color=$15, availability=$16, sku=$17, is_new=$18, extra=$19, updated_at=now()`,
        [
          p.id, p.slug, p.name, p.category, p.categoryName, p.subcategory, p.subcategoryName,
          p.price, p.salePrice, JSON.stringify(p.images || []), p.size, p.sizeLabel || null, p.shortDescription || null,
          p.material || null, p.color || null, p.availability || 'In Stock', p.sku || null, !!p.isNew,
          JSON.stringify(extra), (p.createdAt || Date.now()) / 1000
        ]
      );
      inserted++;
      console.log('  ✓', p.slug);
    }
    console.log(`\n✓ Migrated ${inserted} products into the database.`);
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error('Product migration failed:', e); process.exit(1); });
