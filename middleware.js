/* ============================================================
   THE PINK ROOM — edge bot filter

   robots.txt is a request, not a rule: the crawlers that cost the most
   bandwidth are exactly the ones most likely to ignore it. This runs at
   Vercel's edge before any file is served, so a blocked crawler costs a
   ~few-hundred-byte 403 instead of a 1MB page with its images.

   Deliberately narrow: it matches only well-known AI-training and
   SEO-tool crawlers by name. Anything unrecognised — including every
   real browser and every search engine that sends customers — passes
   through untouched. No IP heuristics and no rate limiting, so there is
   nothing here that can lock out a genuine shopper.
   ============================================================ */

export const config = {
  /* Skip static assets and API routes. Assets are immutable and cached at
     the edge (a blocked crawler never reaches them without first being
     turned away at an HTML request), and /api/* is already bot-filtered
     server-side in api/_lib/visitor.js. */
  matcher: ['/((?!api/|_next/|.*\\.(?:png|jpe?g|webp|avif|gif|svg|ico|mp4|css|js|woff2?|txt|xml)$).*)'],
};

/* Crawlers with no upside for a retail store: they train models or feed
   SEO dashboards, and send no shoppers back. Kept as one case-insensitive
   pattern so the check is a single regex test per request. */
const BLOCKED = new RegExp([
  // AI training / answer engines
  'gptbot', 'oai-searchbot', 'chatgpt-user', 'ccbot', 'claudebot', 'claude-web',
  'anthropic-ai', 'perplexitybot', 'bytespider', 'amazonbot',
  'diffbot', 'omgilibot', 'imagesiftbot', 'timpibot', 'cohere-ai', 'youbot',
  'applebot-extended', 'google-extended',
  // SEO / competitive-analysis crawlers
  'ahrefsbot', 'semrushbot', 'mj12bot', 'dotbot', 'dataforseobot', 'blexbot',
  'petalbot', 'seekportbot', 'serpstatbot', 'seznambot', 'megaindex',
  // Scrapers and mass scanners
  'scrapy', 'python-requests', 'python-urllib', 'go-http-client', 'libwww-perl',
  'zgrab', 'censys', 'shodan', 'masscan',
].join('|'), 'i');

/* Never block these, even if a substring above would otherwise match —
   Applebot vs Applebot-Extended, and Google's crawler vs Google-Extended,
   differ only by suffix, and losing the real one would cost real traffic. */
/* Meta's crawlers are allowed in full — this store runs paid ads, so
   anything Meta sends to verify the domain, read product metadata for the
   catalogue, or check an ad's landing page has to reach the site. Blocking
   one of these breaks ad delivery, which costs far more than the traffic
   saves. Everything matching here is allowed even if a pattern below would
   otherwise catch it (Applebot vs Applebot-Extended). */
const ALWAYS_ALLOW = /googlebot|bingbot|duckduckbot|yandexbot|applebot(?!-extended)|facebookexternalhit|facebookcatalog|facebookbot|meta-externalagent|meta-externalfetcher|adsbot|whatsapp|twitterbot|linkedinbot|telegrambot|slackbot|discordbot|pinterest|redditbot/i;

export default function middleware(request) {
  const ua = request.headers.get('user-agent') || '';

  if (ALWAYS_ALLOW.test(ua)) return;
  if (!BLOCKED.test(ua)) return;

  return new Response('Not available to automated crawlers.', {
    status: 403,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Don't let a 403 get cached and served to anyone else.
      'Cache-Control': 'no-store',
    },
  });
}
