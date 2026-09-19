/* ============================================================
   THE PINK ROOM — Meta Conversions API (server-side)
   Sends the Purchase event straight from the server to Meta. This is the
   ONLY place Purchase is ever tracked — there is deliberately no
   fbq('track','Purchase') anywhere in the browser code, because that is
   what caused the phantom-purchase problem before: a bot fetching a link
   preview, a customer reopening the confirmation page on another device,
   or anyone loading order-success.html without a real order behind it
   used to fire a fake "purchase" with nothing to back it up.

   This call happens right after the order is durably saved to Postgres,
   inside createOrder(), so it fires exactly once per real order and
   cannot be triggered by a page view, a refresh, or a shared link.

   Required environment variable (Vercel → Project → Settings →
   Environment Variables, never committed to the repo):
     META_PIXEL_ID           same id used in the <head> pixel snippet on
                              every page — kept as an env var here so
                              it's not duplicated/hand-typed
     META_CAPI_ACCESS_TOKEN  a Conversions API access token, generated
                              in Events Manager → Settings → Conversions
                              API → "Generate access token"
   Both optional: if either is missing, sendPurchaseCAPI() is a no-op
   (resolves immediately) — never blocks or fails order creation.
   ============================================================ */

const crypto = require('crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

/* order: the same object createOrder() just inserted into Postgres.
   req: the incoming request, used only for the client IP/user-agent
   Meta wants for match quality — never anything sensitive. */
async function sendPurchaseCAPI(order, req) {
  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixelId || !token) return { ok: false, skipped: true, error: 'Meta CAPI env vars not set.' };

  try {
    const c = order.customer || {};
    const userData = {
      client_ip_address: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || undefined,
      client_user_agent: req.headers['user-agent'] || undefined
    };
    if (c.email) userData.em = [sha256(c.email)];
    if (c.phone) userData.ph = [sha256(String(c.phone).replace(/[^0-9]/g, ''))];

    const body = {
      data: [{
        event_name: 'Purchase',
        event_time: Math.floor((order.createdAt || Date.now()) / 1000),
        // the DB order id — a duplicate is rejected by Postgres' primary
        // key before this code can ever run twice for the same order
        event_id: String(order.id),
        action_source: 'website',
        event_source_url: `https://www.thepinkroomeg.com/order-success.html?order=${encodeURIComponent(order.id)}`,
        user_data: userData,
        custom_data: {
          currency: 'EGP',
          value: Number(order.pricing && order.pricing.total) || 0,
          content_type: 'product',
          contents: (order.items || []).map(i => ({ id: String(i.id), quantity: i.qty, item_price: i.price }))
        }
      }]
    };

    const resp = await fetch(`https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!resp.ok) return { ok: false, error: (data && data.error && data.error.message) || 'Meta CAPI request failed.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { sendPurchaseCAPI };
