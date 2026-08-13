/* ============================================================
   THE PINK ROOM — admin settings API (auth required)
   Generic key/value store: GET lists everything (or one ?key=),
   PUT/POST upserts one { key, value }. One file for every settings-like
   feature (shipping now; general/SEO/social/notification templates in
   later phases) instead of a new table + file per feature.
   ============================================================ */
const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');

async function listSettings(req, res) {
  if (req.query.key) {
    const rows = await sql`SELECT key, value, updated_at FROM settings WHERE key = ${req.query.key}`;
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Setting not found.' });
    return res.status(200).json({ ok: true, key: rows[0].key, value: rows[0].value, updatedAt: new Date(rows[0].updated_at).getTime() });
  }
  const rows = await sql`SELECT key, value, updated_at FROM settings ORDER BY key ASC`;
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  return res.status(200).json({ ok: true, settings });
}

async function saveSetting(req, res) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); } }
  const { key, value } = body || {};
  if (!key || !String(key).trim()) return res.status(400).json({ ok: false, error: 'Missing setting key.' });
  if (value === undefined) return res.status(400).json({ ok: false, error: 'Missing setting value.' });

  await sql`
    INSERT INTO settings (key, value, updated_at) VALUES (${key}, ${JSON.stringify(value)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(value)}::jsonb, updated_at = now()
  `;
  return res.status(200).json({ ok: true });
}

module.exports = async (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  if (!sql) return res.status(500).json({ ok: false, error: 'Database is not configured.' });

  try {
    if (req.method === 'GET') return await listSettings(req, res);
    if (req.method === 'POST' || req.method === 'PUT') return await saveSetting(req, res);
    res.setHeader('Allow', 'GET, POST, PUT');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  } catch (e) {
    console.error('[admin/settings] error:', e);
    return res.status(500).json({ ok: false, error: 'Something went wrong.' });
  }
};
