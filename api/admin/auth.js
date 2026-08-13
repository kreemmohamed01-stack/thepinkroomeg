/* Combined admin auth endpoint — login / logout / session, routed by
   ?action=. Merged from three separate files (login.js, logout.js,
   session.js) to stay under the Hobby-plan serverless function cap;
   behavior of each action is unchanged from the originals. */
const { createSessionCookie, clearSessionCookie, verifySession, checkCredentials } = require('../_lib/auth');

async function login(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); }
  }
  const { username, password } = body || {};

  if (!checkCredentials(username, password)) {
    // deliberately vague — never reveal whether the username or the
    // password was the wrong part
    return res.status(401).json({ ok: false, error: 'Incorrect username or password.' });
  }

  res.setHeader('Set-Cookie', createSessionCookie(username));
  return res.status(200).json({ ok: true });
}

async function logout(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }
  res.setHeader('Set-Cookie', clearSessionCookie());
  return res.status(200).json({ ok: true });
}

async function session(req, res) {
  const s = verifySession(req);
  return res.status(200).json({ ok: true, signedIn: !!s, username: s ? s.u : null });
}

module.exports = async (req, res) => {
  const action = req.query.action;
  if (action === 'login') return login(req, res);
  if (action === 'logout') return logout(req, res);
  if (action === 'session' || !action) return session(req, res);
  return res.status(404).json({ ok: false, error: 'Unknown action.' });
};
