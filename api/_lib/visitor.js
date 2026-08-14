/* Server-side visitor parsing for analytics — never trusts anything the
   client claims about itself. Everything here is derived from the
   request's own headers (User-Agent, and Vercel's edge geo headers),
   which a normal browser can't fake without deliberately spoofing them.

   Bot filtering is intentionally conservative (name/keyword matching
   against well-known crawlers and scripted HTTP clients) — it won't
   catch every automated hit, but it keeps the obvious ones (search
   engines, SEO tools, uptime monitors, curl/requests/scrapy scripts,
   headless browsers) out of the "real visitor" counts. */

const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|discordbot|slackbot|headless|phantomjs|puppeteer|playwright|selenium|curl\/|wget\/|python-requests|python-urllib|scrapy|go-http-client|okhttp|libwww-perl|node-fetch|axios\/|postmanruntime|uptimerobot|pingdom|statuscake|lighthouse|gptbot|ccbot|claude-web|anthropic|perplexity|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|yandex|baidu|censys|shodan|zgrab/i;

function isBot(ua) {
  if (!ua || String(ua).trim().length < 10) return true; // real browsers always send a real UA string
  return BOT_UA.test(ua);
}

function parseDevice(ua) {
  if (!ua) return 'unknown';
  if (/iPad|Android(?!.*Mobile)|Tablet|Silk/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android.*Mobile/i.test(ua)) return 'mobile';
  return 'desktop';
}

function parseBrowser(ua) {
  if (!ua) return 'Unknown';
  if (/EdgA|EdgiOS|Edg\//i.test(ua)) return 'Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/CriOS|Chrome/i.test(ua)) return 'Chrome';
  if (/FxiOS|Firefox/i.test(ua)) return 'Firefox';
  if (/Safari/i.test(ua)) return 'Safari';
  return 'Other';
}

/* Vercel's edge network stamps these on every request — free, no
   external geo-IP service needed. Absent when running locally. */
function parseGeo(headers) {
  const country = headers['x-vercel-ip-country'] || null;
  const cityRaw = headers['x-vercel-ip-city'] || null;
  let city = null;
  if (cityRaw) { try { city = decodeURIComponent(cityRaw); } catch (e) { city = cityRaw; } }
  return { country, city };
}

function describeVisitor(req) {
  const ua = req.headers['user-agent'] || '';
  const { country, city } = parseGeo(req.headers || {});
  return {
    bot: isBot(ua),
    deviceType: parseDevice(ua),
    browser: parseBrowser(ua),
    country,
    city
  };
}

module.exports = { isBot, parseDevice, parseBrowser, parseGeo, describeVisitor };
