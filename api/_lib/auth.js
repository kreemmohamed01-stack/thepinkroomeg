/* ============================================================
   THE PINK ROOM — dashboard authentication
   Single admin account (no user table — one shop, one login), a
   signed cookie carries the session so there's no sessions table
   either. No new dependency: everything here is Node's built-in
   `crypto` module.

   Required environment variables:
     ADMIN_USERNAME        the dashboard login username
     ADMIN_PASSWORD        the dashboard login password (plaintext env
                            var — same trust model as GMAIL_APP_PASSWORD /
                            CALLMEBOT_APIKEY already in this project;
                            protected by Vercel's own env var access
                            control, not stored anywhere in the repo)
     ADMIN_SESSION_SECRET   a long random string used to sign session
                            cookies so they can't be forged — generate
                            once with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   ============================================================ */

const crypto = require('crypto');

const COOKIE_NAME = 'tpr_admin_session';
const SESSION_DAYS = 7;

function b64url(buf){ return Buffer.from(buf).toString('base64url'); }

function sign(payloadB64){
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not configured.');
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

function createSessionCookie(username){
  const payload = JSON.stringify({ u: username, exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000 });
  const payloadB64 = b64url(payload);
  const token = payloadB64 + '.' + sign(payloadB64);
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function clearSessionCookie(){
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function parseCookies(req){
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i === -1) return;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

/* Verifies the request's session cookie. Returns the session payload
   ({u, exp}) if valid, or null if missing/forged/expired. */
function verifySession(req){
  try {
    const token = parseCookies(req)[COOKIE_NAME];
    if (!token) return null;
    const [payloadB64, sig] = token.split('.');
    if (!payloadB64 || !sig) return null;

    const expectedSig = sign(payloadB64);
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

/* Constant-time username+password check against the env vars. */
function checkCredentials(username, password){
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;
  if (!expectedUser || !expectedPass) return false;
  if (typeof username !== 'string' || typeof password !== 'string') return false;

  const safeEq = (a, b) => {
    const ba = Buffer.from(a), bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  };
  return safeEq(username, expectedUser) && safeEq(password, expectedPass);
}

/* Drop-in guard for any /api/admin/* handler:
     const session = requireAuth(req, res); if (!session) return;
   Already sends the 401 response when it returns null. */
function requireAuth(req, res){
  const session = verifySession(req);
  if (!session) {
    res.status(401).json({ ok: false, error: 'Not signed in.' });
    return null;
  }
  return session;
}

module.exports = { createSessionCookie, clearSessionCookie, verifySession, checkCredentials, requireAuth };
