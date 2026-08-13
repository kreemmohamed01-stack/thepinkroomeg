/* Shared DB client for every /api/*.js function.
   Uses the pooled connection (POSTGRES_URL / DATABASE_URL, both point at
   the same "-pooler" endpoint) — this is normal request traffic, not a
   schema migration, so pooled is correct here (see db/migrate.js for why
   migrations use the unpooled string instead). */
const { neon } = require('@neondatabase/serverless');

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
  // Fails loudly at call time (not at import time) so a single missing env
  // var doesn't take down every function's cold start — see callers.
  console.error('DATABASE_URL / POSTGRES_URL is not set.');
}

const sql = connectionString ? neon(connectionString) : null;

module.exports = { sql };
