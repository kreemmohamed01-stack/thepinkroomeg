/* ============================================================
   THE PINK ROOM — one-time migration: move product images off
   Vercel Blob (suspended, Hobby plan storage limit exceeded) onto
   Cloudinary, and rewrite the URLs stored in `products`.

   Run once, after CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY /
   CLOUDINARY_API_SECRET are set (locally in .env or pulled via
   `vercel env pull`) — and only useful once the old Blob URLs are
   reachable again long enough to download from (Vercel restores read
   access before storage access sometimes; if a URL still 403s this
   script leaves it untouched and reports it instead of erroring out).

   Usage:  node db/migrate-images-to-cloudinary.js [--dry-run]
   ============================================================ */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load env vars the same way the rest of db/*.js scripts do here —
// from a pulled .env.production.local if present, else process.env.
const envFile = path.join(__dirname, '..', '.env.production.local');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z_0-9]+)="?(.*?)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
}

const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

const DRY_RUN = process.argv.includes('--dry-run');
const BLOB_HOST_RE = /\.public\.blob\.vercel-storage\.com\//;

async function uploadToCloudinary(buffer, mime, publicId) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Missing CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET.');
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'products';
  const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(toSign).digest('hex');

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }));
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', folder);
  form.append('public_id', publicId);

  const resp = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: form });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || 'Cloudinary upload failed.');
  return data.secure_url;
}

async function migrateUrl(url, cache) {
  if (cache.has(url)) return cache.get(url);
  if (!BLOB_HOST_RE.test(url)) { cache.set(url, url); return url; } // not a Blob URL — leave as-is

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  [skip] still unreachable (${res.status}): ${url}`);
      cache.set(url, url);
      return url; // leave old URL in place — nothing to replace it with yet
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get('content-type') || 'image/jpeg';
    const publicId = url.split('/').pop().replace(/\.[a-z0-9]+$/i, '');
    const newUrl = DRY_RUN ? `[dry-run]${url}` : await uploadToCloudinary(buffer, mime, publicId);
    console.log(`  [ok] ${url} -> ${newUrl}`);
    cache.set(url, newUrl);
    return newUrl;
  } catch (e) {
    console.warn(`  [error] ${url}: ${e.message}`);
    cache.set(url, url);
    return url;
  }
}

async function main() {
  console.log(DRY_RUN ? 'DRY RUN — no writes will happen.\n' : 'LIVE RUN — products table will be updated.\n');
  const rows = await sql`SELECT id, images, extra FROM products`;
  console.log(`Scanning ${rows.length} products...\n`);

  const cache = new Map();
  let changedCount = 0;

  for (const row of rows) {
    let changed = false;

    const images = row.images || [];
    const newImages = [];
    for (const u of images) { newImages.push(await migrateUrl(u, cache)); }
    if (JSON.stringify(newImages) !== JSON.stringify(images)) changed = true;

    const extra = row.extra || {};
    const colors = extra.colors || [];
    const newColors = [];
    for (const c of colors) {
      const cImages = c.images || [];
      const newCImages = [];
      for (const u of cImages) { newCImages.push(await migrateUrl(u, cache)); }
      if (JSON.stringify(newCImages) !== JSON.stringify(cImages)) changed = true;
      newColors.push({ ...c, images: newCImages });
    }
    const newExtra = colors.length ? { ...extra, colors: newColors } : extra;

    if (changed) {
      changedCount++;
      if (!DRY_RUN) {
        await sql`UPDATE products SET images = ${JSON.stringify(newImages)}::jsonb, extra = ${JSON.stringify(newExtra)}::jsonb WHERE id = ${row.id}`;
      }
      console.log(`Updated product ${row.id}\n`);
    }
  }

  console.log(`\nDone. ${changedCount} product(s) ${DRY_RUN ? 'would be' : 'were'} updated.`);
  const stillBroken = [...cache.entries()].filter(([orig, out]) => BLOB_HOST_RE.test(orig) && out === orig);
  if (stillBroken.length) {
    console.log(`\n${stillBroken.length} Blob URL(s) still unreachable — re-run this script once they're accessible again:`);
    stillBroken.forEach(([u]) => console.log(`  ${u}`));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
