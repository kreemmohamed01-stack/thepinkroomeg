#!/usr/bin/env node
/* ============================================================
   THE PINK ROOM — environment checklist

   Run this after setting the environment variables on a new Vercel
   account, before pointing the domain at it. It reports which vars are
   present, which are missing, and — for the database — actually opens a
   connection and counts the rows, because a variable can be set and
   still be wrong.

   Usage:
     node db/check-env.js                 (checks the local .env file)
     vercel env pull .env.production.local && node db/check-env.js
   ============================================================ */

const fs = require('fs');
const path = require('path');

// Same env loading the other db/*.js scripts use.
for (const f of ['.env.production.local', '.env.local', '.env']) {
  const p = path.join(__dirname, '..', f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  console.log(`Loaded ${f}\n`);
  break;
}

/* what: label shown in the report
   breaks: what stops working when this is missing */
const GROUPS = [
  ['Database — the whole site reads products from here', true, [
    ['DATABASE_URL', 'products, orders, analytics: nothing loads without it'],
  ]],
  ['Dashboard login', true, [
    ['ADMIN_USERNAME', 'you cannot sign in to the dashboard'],
    ['ADMIN_PASSWORD', 'you cannot sign in to the dashboard'],
    ['ADMIN_SESSION_SECRET', 'login fails; must be a long random string'],
  ]],
  ['Product images (Cloudinary) — uploading new products', true, [
    ['CLOUDINARY_CLOUD_NAME', 'existing images still show; new uploads fail'],
    ['CLOUDINARY_API_KEY', 'new uploads fail'],
    ['CLOUDINARY_API_SECRET', 'new uploads fail'],
  ]],
  ['Online card payment (Paymob)', false, [
    ['PAYMOB_API_KEY', 'card payment unavailable; cash on delivery still works'],
    ['PAYMOB_INTEGRATION_ID', 'card payment unavailable'],
    ['PAYMOB_HMAC_SECRET', 'payment confirmations cannot be verified'],
  ]],
  ['Order notification email', false, [
    ['GMAIL_USER', 'no order emails are sent (orders are still saved)'],
    ['GMAIL_APP_PASSWORD', 'no order emails are sent'],
    ['SHOP_NOTIFY_EMAIL', 'order emails have no recipient'],
  ]],
  ['Order notification WhatsApp', false, [
    ['CALLMEBOT_APIKEY', 'no WhatsApp alerts (orders are still saved)'],
    ['SHOP_WHATSAPP_TO', 'no WhatsApp alerts'],
  ]],
  ['Facebook ads tracking', false, [
    ['META_PIXEL_ID', 'conversions are not reported to Facebook'],
    ['META_CAPI_ACCESS_TOKEN', 'conversions are not reported to Facebook'],
  ]],
];

let missingRequired = 0;
let missingOptional = 0;

for (const [title, required, vars] of GROUPS) {
  console.log(`${required ? '[REQUIRED]' : '[optional]'} ${title}`);
  for (const [name, breaks] of vars) {
    const v = process.env[name];
    if (v && v.trim()) {
      // Never print secrets — just enough to confirm the right value landed.
      const shown = v.length > 12 ? `${v.slice(0, 6)}…${v.slice(-4)}` : '••••';
      console.log(`   OK      ${name.padEnd(24)} (${shown})`);
    } else {
      console.log(`   MISSING ${name.padEnd(24)} -> ${breaks}`);
      required ? missingRequired++ : missingOptional++;
    }
  }
  console.log();
}

(async () => {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    console.log('Database: skipped, no connection string set.\n');
  } else {
    process.stdout.write('Database: connecting… ');
    try {
      const { neon } = require('@neondatabase/serverless');
      const sql = neon(url);
      const [p] = await sql`SELECT count(*)::int AS n FROM products`;
      const [o] = await sql`SELECT count(*)::int AS n FROM orders`;
      console.log(`OK — ${p.n} products, ${o.n} orders.\n`);
      if (p.n === 0) {
        console.log('   WARNING: 0 products. The new account is probably\n' +
                    '   pointing at an empty database rather than the live one.\n');
      }
    } catch (e) {
      console.log(`FAILED\n   ${e.message}\n`);
      missingRequired++;
    }
  }

  console.log('─'.repeat(58));
  if (missingRequired) {
    console.log(`${missingRequired} required setting(s) missing — fix before going live.`);
    process.exit(1);
  }
  console.log('All required settings present.' +
    (missingOptional ? ` ${missingOptional} optional feature(s) off.` : ''));
})();
