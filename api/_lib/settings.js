/* Generic key/value settings store, shared between the public read used
   at checkout (shipping methods) and the admin CRUD. One table backs
   every settings-like feature (shipping now, general/SEO/social/
   notification templates in later phases) so those don't each need a
   new table or a new serverless function. */
const { sql } = require('./db');

async function getSetting(key, fallback) {
  const rows = await sql`SELECT value FROM settings WHERE key = ${key}`;
  if (!rows.length) return fallback;
  return typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
}

async function setSetting(key, value) {
  await sql`
    INSERT INTO settings (key, value, updated_at) VALUES (${key}, ${JSON.stringify(value)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(value)}::jsonb, updated_at = now()
  `;
}

module.exports = { getSetting, setSetting };
