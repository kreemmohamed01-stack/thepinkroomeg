/* Run once (locally or in CI) to create/update the schema:
     node db/migrate.js
   Uses the DIRECT (unpooled) connection string, per Neon's own guidance —
   schema changes should not go through the pooled/transaction-mode
   connection used by the app's normal request traffic. */
const fs = require('fs');
const path = require('path');
const { Client } = require('@neondatabase/serverless');

// tiny manual .env.local loader (no extra dependency for a one-off script)
(function loadEnvLocal(){
  const file = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
})();

async function main() {
  const conn = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
  if (!conn) {
    console.error('No database connection string found. Run `vercel env pull .env.local` first.');
    process.exit(1);
  }

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const client = new Client(conn);
  await client.connect();
  try {
    await client.query(sql);
    console.log('✓ Schema applied successfully.');
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error('Migration failed:', e); process.exit(1); });
