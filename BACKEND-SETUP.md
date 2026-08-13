# Backend Setup — Status & Reference

Live status as of the last deploy: **database + order notifications are
both configured and working** on `thepinkroom-4` (the project connected
to `https://thepinkroom-4.vercel.app`). This file is now a reference for
how it's wired, not a to-do list — keep it updated if anything changes.

---

## What happens when a customer places an order

1. `checkout.js` builds the order object client-side (same as before).
2. It POSTs the order to **`/api/orders`** (`api/orders.js`), which:
   - Saves the order to **Postgres** (Neon, connected via Vercel's
     marketplace integration — see "Database" below).
   - Sends **three notifications in parallel** (`api/_lib/notify.js`):
     1. Order-details email to the shop Gmail
     2. Order-confirmation email to the customer's own email
     3. Order-details WhatsApp message to the shop's WhatsApp number
   - One channel failing never blocks another, and a failed save/notify
     never blocks the sale — see "Resilience" below.
3. `order-success.html` and `receipt.html` fetch the order by id via
   `CO.getOrderAnywhere(id)` — this browser's `localStorage` first
   (instant), then `GET /api/orders?id=...` as a fallback. That fallback
   is what makes an emailed receipt link, or the same order opened on a
   different device, actually work now.

---

## Database (Postgres via Neon)

Provisioned through Vercel's own marketplace integration — **no manual
connection string was ever copied**. Vercel injected these into the
project automatically (Production + Preview + Development):

`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_URL`, plus several
`PG*`/`POSTGRES_*` variants. The app uses the **pooled** one
(`api/_lib/db.js` reads `DATABASE_URL` or `POSTGRES_URL`) for normal
request traffic; schema changes use the **unpooled** one instead
(`db/migrate.js` reads `DATABASE_URL_UNPOOLED`), per Neon's own guidance
that pooled/PgBouncer connections aren't for schema work.

**Schema**: `db/schema.sql` — one `orders` table, JSONB columns matching
the exact shape `checkout.js` already produces (no reshaping needed on
either side). Applied once via:
```
node db/migrate.js
```
Re-run this any time `db/schema.sql` changes (it's all `IF NOT EXISTS`,
safe to run repeatedly).

**To inspect the data**: `vercel.com` → the `thepinkroom-4` project →
**Storage** tab → the connected Neon resource → its dashboard has a SQL
editor and table browser (no separate Neon login needed, opens via SSO
from the Vercel project).

---

## Email — Gmail SMTP

Already configured. Reference if it ever needs to be redone:

1. On `thepinkroomeg@gmail.com`: **myaccount.google.com/security** → turn
   on 2-Step Verification if off.
2. **myaccount.google.com/apppasswords** → name it anything → Create →
   copy the 16-character password.
3. Env vars (Vercel → Settings → Environment Variables):
   - `GMAIL_USER` = `thepinkroomeg@gmail.com`
   - `GMAIL_APP_PASSWORD` = the 16-character password
   - `SHOP_NOTIFY_EMAIL` = `thepinkroomeg@gmail.com` (where the "new
     order" email goes; optional, defaults to `GMAIL_USER`)

---

## WhatsApp — CallMeBot

Already configured. Reference if the API key ever needs regenerating
(e.g. if it stops responding): free, no account, no expiry.

1. Save phone contact **+34 613 01 49 37**.
2. From the shop's WhatsApp (`+201207803666`), message it exactly:
   `I allow callmebot to send me messages`
3. It replies with an API key → `CALLMEBOT_APIKEY` in Vercel env vars.
4. `SHOP_WHATSAPP_TO` = `+201207803666` (must match the number that sent
   the activation message).

---

## Resilience — what happens when something fails

- **DB save fails, notifications still fire**: not currently possible —
  the order is only notified after a successful DB insert. If the insert
  fails, `placeOrder()` catches it and falls back to a **local-only**
  order (saved to `localStorage`, flagged `order._synced = false`) so the
  customer still sees a success page rather than a broken checkout. That
  order will not appear in the database or trigger any notification —
  check the browser console for `[order] never reached the server` if a
  customer ever reports a missing order.
- **One notification channel fails, others still fire**: yes — email and
  WhatsApp send in parallel (`Promise.allSettled`); a bad Gmail password
  never blocks the WhatsApp message or vice versa. Per-channel results
  are logged to the console on the success page as
  `[order notify] ... failed: <reason>` (never shown to the customer).
- **Network/deploy is fully down**: the order still saves to
  `localStorage` and the customer still sees success — it just won't be
  in the database or notified until someone notices `_synced:false` and
  investigates. There's no automatic retry/sync queue yet.

---

## Deploying changes

This project isn't connected to git — deploys are manual:
```
npx vercel --prod
```
Run from the project folder. This account has several **other**
`thepinkroom*` projects from earlier deploy attempts (`thepinkroom`,
`thepinkroom-1/2/3`, `thepinkroom888`, `thepinkroom1234`) — none of those
are the live site and none have the database connected. The live one is
**`thepinkroom-4`** (aliased at `thepinkroom-4.vercel.app`); the local
`.vercel/project.json` is linked to it, so plain `vercel --prod` from
this folder always targets the right one. Worth cleaning up the unused
ones eventually so they don't cause the same mix-up again.

---

## Dashboard

Live at `/dashboard-login` → `/dashboard`. It's now a **multi-page
dashboard** sharing one design/shell instead of a single tab-switching
file — each module is its own HTML page so it stays maintainable as
more modules get added:

- `dashboard.html` — **Overview/Home**: revenue this month (+% vs last
  month), orders/customers/products counts, pending-orders and
  pending-payments alerts, out-of-stock alert, quick-action links,
  recent orders, recent customers, best-sellers (last 90 days).
  Backed by `api/admin/overview.js`.
- `dashboard-orders.html` — order management (unchanged behavior from
  the original tab): stats, search + status filter, paginated table,
  detail drawer (customer, address, items, receipt link, WhatsApp
  link, a "view customer profile →" link into Customers), status/
  payment dropdowns. Backed by `api/admin/orders.js`.
- `dashboard-products.html` — product CRUD (unchanged behavior, plus
  the inventory checkbox/fields): table, add/edit drawer, image upload
  with client-side compression. Backed by `api/admin/products.js`
  (image upload and inventory are actions on this same file — see
  "Inventory" — not separate files).
- `dashboard-analytics.html` — traffic/sales analytics (unchanged
  behavior): visitor stats, live-now count, monthly sales chart,
  visitor trend chart, most-viewed products/categories, most-added-
  to-cart. Backed by `api/admin/analytics.js` (the live-now count is
  `?action=live` on this same file, not a separate one).
- `dashboard-customers.html` — customer list (search by name/email/
  phone) + profile view (contact info, total orders, total spent, AOV,
  first/last order date, new-vs-returning badge, full order history,
  WhatsApp/email shortcuts). Deep-linkable via `?email=`. Backed by
  `api/admin/customers.js`. There's no accounts/registration system
  (checkout is guest-only), so customers aren't a separate table —
  they're derived live from `orders` grouped by `customer_email`, which
  stays consistent with real order history by construction instead of
  risking drift.
- `dashboard-inventory.html` — stock levels, low/out-of-stock counts,
  manual adjustments, change history. See "Inventory" above.
- `dashboard-coupons.html` — promo code CRUD. See "Coupons" below.
- `dashboard-shipping.html` — shipping method editor. See "Shipping
  settings" below.
- `dashboard-catalog.html` — categories/rooms/Top Sellers editor. See
  "Catalog Structure" below.
- `dashboard-payments.html` — payment totals/methods/failures. See
  "Payments" below.
- `dashboard-notifications.html` — order email/WhatsApp wording editor.
  See "Notification templates" below.
- `dashboard-content.html` — homepage hero text editor. See "Content"
  below.
- `dashboard-reviews.html` — review moderation queue. See "Reviews"
  below.
- `dashboard-store-settings.html` — contact/social/SEO editor. See
  "Store Settings" below.

**Shared shell**: `dashboard-ui.css` (design system + sidebar layout,
responsive down to an off-canvas drawer on mobile) and `dashboard-ui.js`
(injects the sidebar/mobile topbar into `[data-dash-sidebar]` /
`[data-dash-mobile-topbar]` marker divs, exposes `DashUI.requireAuth()`,
`money()`, `fmtDate()`/`fmtDateShort()`, `escHtml()`, `toast()`). Every
page calls `DashUI.requireAuth(()=> ...)` once on load instead of
duplicating the auth-check/redirect logic.

**Function budget**: Vercel Hobby caps a deployment at 12 serverless
functions total (public + admin combined). Still 11 as of Payments —
the Paymob webhook and Catalog Structure both landed as `?action=`
routes on existing files (`orders`, `products`, `track` public;
`analytics`, `auth`, `coupons`, `customers`, `orders`, `overview`,
`products`, `settings` admin) rather than new ones, exactly as planned
— 1 free. The pattern going forward: **new admin features are actions
on an existing related file (`?action=...`) or a row in the generic
`settings` table read through `api/admin/settings.js`, not new files**,
unless a feature genuinely doesn't belong anywhere existing (coupons
got its own file for this reason — it's not naturally part of any other
resource). From here on,
anything settings-shaped (general store info, SEO, social, notification
templates) should be a new `settings` key, not a new table or file.

- **Auth**: single admin account, no user table. `ADMIN_USERNAME` /
  `ADMIN_PASSWORD` env vars, checked with a constant-time comparison
  (`api/_lib/auth.js`). A signed, HttpOnly cookie carries the 7-day
  session — signed with `ADMIN_SESSION_SECRET` (HMAC-SHA256, Node's
  built-in `crypto`, no extra dependency, no sessions table). Regenerate
  the secret any time with:
  ```
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  (changing it instantly invalidates every existing session — nothing
  else to clean up).
- **API**: `/api/admin/auth?action=login|logout|session` — login/logout/
  session were merged into one file (routed by `?action=`) to stay
  under Vercel Hobby's 12-serverless-function-per-deployment cap once
  `overview.js` and `customers.js` were added; behavior of each action
  is byte-for-byte the same as when they were separate files. Every
  route in `api/admin/*` requires the session cookie except
  `auth?action=login` and `auth?action=session` (session's whole job is
  telling you if you're signed in, so it can't itself require auth).
- **Not linked from the public site anywhere** (intentional) — it's only
  reachable by knowing the URL, on top of the real login.
- **Known gaps**: no login rate-limiting (no KV/Redis wired up yet — a
  brute-force attempt isn't currently slowed down beyond the password's
  own strength), no "forgot password" flow (rotate `ADMIN_PASSWORD` in
  Vercel directly if it's ever lost), and no audit log of who changed
  what yet (planned — see "Next up").

---

## Products (database-backed, full CRUD from the dashboard)

All 24 products live in the `products` table now, not hardcoded in
`catalog.js` — `catalog.js` fetches them from `/api/products` on every
page load instead (see "How the site loads products" below).

- **Storage**: Vercel Blob (public store `thepinkroom-images`, connected
  to the project the same way Neon was — no manual token copying).
  Images are compressed/resized client-side (canvas, max 1600px edge,
  JPEG q0.85) before upload, so a phone photo never blows past Vercel's
  request body limit.
- **API**: `/api/products` (public, returns everything, cached 60s at
  the edge). `/api/admin/products` (auth required — GET list with
  search/category filter, GET `?id=` for one, POST create, PATCH update,
  DELETE) and `/api/admin/products?action=upload` (auth required — takes
  a base64 image, returns its Blob URL; folded into this file rather
  than its own to stay under Vercel's function cap — see "Dashboard").
- **Dashboard**: `dashboard-products.html` — table with thumbnail/name/
  category/price/sale price/stock/availability, search + category
  filter, and an Add/Edit drawer with the image uploader and every field
  the storefront reads (name, category + subcategory, price, sale
  price, size bucket, size label, material, color, availability, SKU,
  description, "new" flag, plus the inventory fields below).
- **Seeding/re-seeding**: `node db/migrate-products.js` reads whatever
  is currently in `catalog.js`'s arrays and upserts it into the table —
  this was a one-time migration; the dashboard is the real source of
  truth going forward, this script is just kept around in case it's
  ever needed again.
- **Not editable from the dashboard**: categories/subcategories
  themselves (`CATEGORIES` in `catalog.js` — still a fixed structural
  list, mirrored as `CATEGORY_OPTIONS` in `dashboard-products.html`'s own
  script) and Shop-by-Room assignments.

### How the site loads products now

`catalog.js` exposes `PRODUCTS` (starts empty, `let` not `const`) and
`PRODUCTS_READY` (a promise). It fetches `/api/products` immediately and
fills `PRODUCTS` **in place** (`.length = 0; .push(...)`) rather than
reassigning it — that's deliberate: anything that captured a reference
to that exact array early (like `shared-ui.js`'s search, `const
catalogue = PRODUCTS`) automatically sees the real data once the fetch
resolves, without its own fetch logic. Every page that *renders*
products on load (`category.html`, `product.html`, `wishlist.html`)
awaits `PRODUCTS_READY` first; reactive code (search-as-you-type) reads
the same live array lazily and needs no extra handling.
`checkout.html`/`order-success.html`/`receipt.html` never touch
`catalog.js` at all — the cart already stores its own name/price/image
snapshot per item, independent of the live catalogue.

---

## Inventory

Stock is opt-in per product (`products.track_inventory`, default
`false`) — most items in a home-decor boutique are one-off/made-to-order
and don't have a meaningful "units in stock" concept, so nothing is
forced to track it.

- **Schema**: `products.track_inventory` (boolean), `stock_quantity`
  (integer), `low_stock_threshold` (integer, default 5). `inventory_log`
  — append-only history of every change (`reason`: `order` | `manual` |
  `restock`, `order_id` when relevant, `note`).
- **Stock is taken automatically when an order is placed** —
  `api/orders.js`'s `reserveStock()` runs one atomic conditional
  `UPDATE ... WHERE stock_quantity >= qty` per tracked item before the
  order row is even inserted. If any item doesn't have enough left, the
  whole order is rejected (`409`) and whatever was already reserved for
  that same order is put back — so two customers racing for the last
  unit can't both succeed, and stock can never go negative. Untracked
  products (the default) are skipped entirely, so this changes nothing
  for the vast majority of the catalogue.
- **Cancelling an order gives stock back**; reinstating a cancelled
  order takes it again — handled in `api/admin/orders.js`'s
  `updateOrder()`, both directions logged to `inventory_log`.
- **API**: all folded into `/api/admin/products.js` (inventory is
  product-scoped by nature, and this avoids a 4th admin file just for
  it): `?action=inventory` (GET — every tracked product with a
  computed `ok`/`low`/`out` status), `?action=stock-adjust` (POST —
  manual `{ id, change, note }`, used for restocks/corrections),
  `?action=inventory-log` (GET, optional `?id=` — last 100 changes).
- **Dashboard**: `dashboard-inventory.html` — stock/low-stock/
  out-of-stock counts, a table of every tracked product with quick
  &plusmn;1 buttons and a custom-amount adjustment, and a recent-changes
  feed. The product Add/Edit drawer has a "track stock" checkbox that
  reveals quantity + threshold fields when on.

---

## Coupons

Real, server-validated promo codes — replaces the old `PROMO_CODES`
object that used to live in `checkout.js` and never touched the server
at all (any code from that list "worked" purely client-side; nothing
stopped a customer from just editing the JS console).

- **Schema**: `coupons` (`code` PK, `type`: percent|fixed, `value`,
  `label`, `min_order_total`, `max_discount` — caps a percent coupon's
  EGP value, `usage_limit`, `usage_count`, `starts_at`, `expires_at`,
  `active`).
- **Two-step validation, same logic both times** (`api/_lib/coupons.js`'s
  `validateCoupon(code, subtotal)`):
  1. **Preview** — `POST /api/orders?action=validate-coupon` (public),
     called when the customer clicks "Apply" at checkout. Tells them if
     it worked and roughly what it's worth.
  2. **Authoritative** — re-run again inside `createOrder()` itself,
     against a subtotal recomputed from the database's *own* current
     product prices (`recomputePricing()`), not whatever the client
     sent. A coupon that previews as valid but fails at the real check
     (expired in between, someone else used the last redemption, cart
     total changed) fails the order with a clear `400` — the discount
     actually charged is never taken from the browser. `usage_count` is
     incremented only after the order successfully saves.
  3. This same recompute also fixes item prices — if a product's price
     changed (or the item was removed from the shop) between it being
     added to the cart and the order being placed, the order is priced
     using the database's number, not the stale client one. (Shipping
     price is the one piece still client-trusted for now — it's still a
     hardcoded constant with no server-side mirror yet; closing that is
     Phase 4, "Shipping settings".)
- **API**: `/api/admin/coupons` (auth required — full CRUD).
- **Dashboard**: `dashboard-coupons.html` — table (code, discount,
  minimum order, usage vs. limit, expiry, status), add/edit drawer.
- **`checkout.js`**: `checkPromo(code, subtotal)` is now `async` and
  calls the preview endpoint instead of checking a local object;
  `calculatePricing()` uses the server-returned `promo.discount`
  (an absolute EGP amount) directly rather than recomputing from a
  percentage, since fixed-amount coupons don't have one.

---

## Shipping settings

Closes the one pricing gap Coupons left open: shipping price used to be
a hardcoded constant the client fully controlled (an order's
`shippingMethod.price` was whatever the browser sent). Now it's a real,
admin-editable setting the server looks up itself.

- **Schema**: generic `settings` key/value table (`key` PK, `value`
  jsonb) — built generic on purpose, so later phases (Store Settings'
  general/SEO/social tabs, notification templates) reuse it instead of
  each getting their own table. Seeded with a `shipping_methods` row
  (`standard`/`express`, matching the old hardcoded values) so checkout
  never breaks on a fresh deploy even before an admin edits anything.
- **`api/orders.js` now looks up the real price itself** —
  `recomputePricing()` fetches `shipping_methods` from `settings` and
  prices the order off of `methods[order.shippingMethod.id].price`, not
  the client's number. An unrecognized method id fails the order with a
  clear `400` instead of silently defaulting to free/wrong shipping.
- **API**: `GET /api/orders?action=shipping-methods` (public — what
  checkout.js reads). `GET/POST /api/admin/settings` (auth required —
  generic; `?key=shipping_methods` for one, no `?key=` lists everything;
  POST/PUT body `{ key, value }` upserts).
- **Dashboard**: `dashboard-shipping.html` — a card per method (label,
  customer-facing delivery-window text, price, min/max business days),
  add/remove methods, one Save button writes the whole set back.
- **`checkout.js`**: `SHIPPING_METHODS` still starts as the same
  hardcoded defaults (so the page renders instantly, nothing about
  first paint changed), then `SHIPPING_METHODS_READY` fetches the real
  settings and mutates that same object **in place** — the established
  PRODUCTS-in-`catalog.js` pattern — so anything already holding a
  reference sees the update without extra plumbing. `placeOrder()`
  `await`s it before pricing, and `checkout.html` re-renders the
  shipping option cards and summary once it resolves (usually
  near-instant; never blocks the page).

---

## Catalog Structure (categories, rooms, Top Sellers)

Out-of-band request from the client: the Products page only let you
*assign* a product to one of the 6 hardcoded categories — you couldn't
add a new category/room, or control what shows in the homepage's Top
Sellers section, without a code change. All three are now real,
dashboard-editable settings.

- **Schema**: three more `settings` keys — `categories` (same shape as
  the old hardcoded `CATEGORIES` in `catalog.js`: name, description,
  hero image path, subcategories), `rooms` (same shape as `ROOMS`:
  name, description, hero), `top_sellers` (an ordered array of product
  ids). Seeded with the exact values that used to be hardcoded, so nothing
  changes on the site until an admin actually edits something.
- **API**: no new files — `GET /api/products?action=site-structure`
  (public, cached, folded into the existing public products file)
  returns all three; `GET/POST /api/admin/settings` (already built for
  Shipping) reads/writes them, same as any other settings key.
- **Dashboard**: `dashboard-catalog.html` — three tabs:
  - **Categories** — add/remove/edit categories (name, description,
    hero image, subcategories), used by the Products page's Category
    dropdown, which now loads this list instead of a hardcoded array.
  - **Shop by Rooms** — same, for rooms. The product Add/Edit drawer
    now has a "Shop by Room" checklist (writes to the product's
    `rooms` field, which already existed end-to-end — `extra.rooms` in
    the DB — it just had no UI to set it from before this).
  - **Top Sellers** — search-and-add product picker with reorder/
    remove, backing the homepage section. The product drawer also has
    a one-click "Feature in homepage Top Sellers" checkbox that
    updates this same list as a side effect of saving the product.
  - **Known limitation, told to the client directly**: a brand-new
    category/room is assignable to products and (for categories) shows
    up in `category.html` immediately, but doesn't automatically get a
    homepage card or nav-menu link — those are still small hardcoded
    spots (`index.html`'s "Shop by Category"/nav, `shared-ui.js`'s room
    links) that need a manual addition once a *new* category/room
    actually needs a customer-facing entry point, as opposed to one of
    the 6+6 that already have one.
- **`index.html`'s Top Sellers section is now rendered, not
  hardcoded** — the 6 static `<a class="ts-card">` blocks were replaced
  with an empty `#tsGrid` that `catalog.js`'s `PRODUCTS_READY` +
  `SITE_STRUCTURE_READY` render into (same card markup, SALE tag,
  wishlist heart, mobile carousel dots — all preserved, just built from
  data now). If `TOP_SELLER_IDS` is ever empty, the whole section
  hides instead of showing nothing awkwardly.
- **`catalog.js`**: `CATEGORIES`/`ROOMS` (existing) and the new
  `TOP_SELLER_IDS` are refreshed from the real settings via
  `SITE_STRUCTURE_READY`, mutated in place — same PRODUCTS pattern used
  throughout. Pages that read `CATEGORIES`/`ROOMS` synchronously very
  early (`category.html`'s initial resolution, `shared-ui.js`'s nav
  room links) still use the hardcoded defaults on first paint, since
  restructuring those specific call sites to await a fetch first was
  judged higher-risk than the benefit for data that changes rarely —
  see the limitation above.

---

## Payments

A read-only, payment-focused view over `orders` (no new table — every
number here is the same data the Orders page has, just sliced
differently), plus the real architecture for Paymob so connecting it
later is "flip a switch," not "build it then."

- **API**: `GET /api/admin/orders?action=payments` (folded into the
  existing orders file) — totals collected/pending/processing/failed,
  a breakdown by payment method, and the 10 most recent failed
  payments. `GET /api/admin/orders` also now accepts `?payment=` and
  `?method=` filters (in addition to the existing `?status=`/`?q=`), so
  the Payments page's order table reuses the same list endpoint Orders
  uses, filtered differently.
- **Dashboard**: `dashboard-payments.html` — stat cards, by-method
  breakdown, recent failures, filterable order table, and a banner
  stating plainly whether Paymob is configured or not.
- **Paymob — architecture ready, integration intentionally NOT faked**:
  - `checkout.js` already had a `paymob` provider, `enabled:false`,
    with a comment describing what a real integration needs. Unchanged
    by this phase — still disabled.
  - **New**: `POST /api/orders?action=paymob-webhook` — the receiving
    end for Paymob's "Transaction Processed" callback. Verifies the
    HMAC signature (SHA-512 over Paymob's documented field order) using
    `PAYMOB_HMAC_SECRET`, then updates the order's `payment_status` to
    `paid`/`failed`. **Returns `501` and does nothing else if
    `PAYMOB_HMAC_SECRET` isn't set** — it never pretends to verify or
    process a payment without real credentials configured.
  - **Env vars** (not set — nothing to configure until there's a real
    Paymob account): `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID`,
    `PAYMOB_HMAC_SECRET`. All server-side only, never referenced from
    any frontend file.
  - **Honesty note**: the HMAC field-order implementation follows
    Paymob's published docs but hasn't been exercised against a real
    Paymob sandbox transaction (no account exists yet) — treat it as
    "should be correct per the spec," verify with a real test
    transaction before trusting it in production once Paymob is
    actually connected.
  - **To actually go live with Paymob later**: create a Paymob
    account, set the three env vars above in Vercel, point Paymob's
    webhook URL at `/api/orders?action=paymob-webhook`, flip
    `paymob.enabled` to `true` in `checkout.js`, and implement
    `paymob.process()` to call Paymob's "intention" API and return the
    iframe URL — the receiving/verification half is already done.

---

## Notification templates

Order emails and the shop's WhatsApp alert (`api/_lib/notify.js`) had
their wording hardcoded — rewording anything meant a code change and a
redeploy. The safe/valuable parts are editable now; the branded HTML
layout itself isn't (see below for why).

- **Schema**: one more `settings` key, `notification_templates` — 5
  string fields: `shopEmailSubject`, `customerEmailSubject`,
  `customerEmailIntro`, `customerEmailFooter`, `whatsappTemplate`.
  `{placeholder}` substitution (`fillTemplate()`), no template engine
  dependency. Falls back to the exact original hardcoded strings if
  nothing's configured — `notifyOrder()` merges saved values over
  `DEFAULT_TEMPLATES` field-by-field, so a template saved before a new
  placeholder existed still works.
- **Deliberately NOT editable**: the emails' full HTML layout (tables,
  colors, the branded header). Editable subjects/intro/footer/WhatsApp
  text are plain strings — impossible to break rendering. A free-text
  HTML editor risks a malformed email (unclosed tag, broken table) with
  no easy way to preview it before it goes out on a real order, which
  outweighs the value of full re-theming from the dashboard.
- **API**: no new file — reads/writes through the existing
  `api/admin/settings.js` like Shipping and Catalog Structure.
- **Dashboard**: `dashboard-notifications.html` — one form per channel,
  a documented list of available `{placeholders}` under each field, and
  a "reset to defaults" button.
- **Verified locally** (not by sending a real email/WhatsApp/creating a
  test order in production, to avoid spamming the shop's real inbox and
  polluting the orders table): rendered `whatsappText()`,
  `shopEmailHtml()` and `customerEmailHtml()` against a fake order with
  and without a discount/note, confirming output matches the original
  hardcoded formatting exactly and the optional lines (`{discountLine}`,
  `{notesLine}`) collapse cleanly when empty instead of leaving blank
  lines.

---

## Content

The homepage hero (title, subtitle, button text/link over the top
video) is dashboard-editable now — used to be hardcoded in `index.html`.
Product-facing "content" (which products are featured, what categories/
rooms exist) already lives in Catalog Structure, so this stays scoped
to genuinely page-copy content.

- **Schema**: one more `settings` key, `homepage_content` — 4 string
  fields (`heroTitle`, `heroSubtitle`, `heroButtonText`,
  `heroButtonLink`). Seeded with the exact text that used to be
  hardcoded.
- **API**: no new file — `?action=site-structure` on the existing
  public products file now also returns `homepageContent`, and
  `api/admin/settings.js` reads/writes it like any other key.
- **`catalog.js`**: `HOMEPAGE_CONTENT` (defaults matching the seed),
  refreshed in place by the same `SITE_STRUCTURE_READY` promise
  Categories/Rooms/Top Sellers use.
- **`index.html`**: the hero's `<h1>`/`<p>`/button already render the
  hardcoded defaults first (so first paint is instant and correct), then
  get overwritten in place once `SITE_STRUCTURE_READY` resolves — same
  "defaults now, refine shortly after" pattern as Shipping and Top
  Sellers, not a template re-render.
- **Dashboard**: `dashboard-content.html` — one small form.
- **Deliberately out of scope for now**: the hero video/poster image
  itself (re-uploading video is a heavier feature than this phase's
  text-only scope), and any other homepage section's copy (category
  card labels, section headings) — flag if any of those should be
  editable too and it's the same small pattern to extend.

---

## Reviews

Customer product reviews — new end-to-end (schema, public submit/read,
admin moderation, storefront UI). Moderated: nothing shows publicly
until an admin approves it.

- **Schema**: `reviews` (`product_id`, `name`, `email` optional,
  `rating` 1-5, `title` optional, `body`, `status`: `pending` (default)
  | `approved` | `rejected`). No accounts system, so no FK to a
  customer — same reasoning as guest checkout.
- **API**:
  - Public, folded into `api/products.js`: `GET ?action=reviews&productId=`
    (approved reviews + average rating for one product — what
    `product.html` reads), `POST ?action=review` (submit — validated
    server-side: name/rating(1-5)/body required, product must exist,
    body capped at 3000 chars — always saved as `pending`, a submitter
    can never make their own review appear).
  - Admin, folded into `api/admin/products.js`: `GET ?action=reviews[&status=]`
    (moderation queue + counts per status), `POST ?action=review-moderate`
    (`{ id, status }`), `DELETE ?action=review-delete&id=`.
- **Dashboard**: `dashboard-reviews.html` — Pending/Approved/Rejected
  tabs with counts, approve/reject/delete per review.
- **Storefront**: `product.html` — average rating + star breakdown,
  the approved review list, and a "Write a Review" form (star-rating
  picker, name, optional title, body) under a new Customer Reviews
  section. Loads after the page's own product data — never blocks
  first paint, fails quietly ("Reviews are unavailable right now") if
  the request errors rather than breaking the page.
- **Verified live** (real submit → confirmed hidden while pending →
  test data deleted immediately after) rather than only unit-tested,
  since this is a new public-write endpoint.

---

## Analytics (visitor tracking + dashboard charts)

- **Client**: `analytics.js`, loaded on every customer-facing page
  (not the dashboard). Generates an anonymous `sessionId`
  (`localStorage`, not tied to any identity), sends a `pageview` on
  load, a `heartbeat` every ~25s while the tab is open *and visible*
  (paused via the Page Visibility API otherwise — a backgrounded tab
  doesn't count as "active"), and exposes
  `window.TPRAnalytics.trackEvent(type, extra)`.
- **Specific events wired up**: `category_view` (`category.html`, real
  categories only — not "all", not a room), `product_view`
  (`product.html`, once the product resolves), `add_to_cart`
  (`shared-ui.js`'s `TPR.addToCart`, the single place every "add to bag"
  button already funnels through, so nothing else needed touching).
- **Storage**: `analytics_events` (one row per event) +
  `active_sessions` (one row per session, upserted on every event/
  heartbeat, self-pruning — rows older than 1 hour get deleted on ~5% of
  writes, no cron job needed). `receipt.html` is deliberately **not**
  tracked — it's a document view, sometimes reopened repeatedly from an
  email, and would skew visitor counts.
- **API**: `/api/track` (public — a bad/malformed beacon is silently
  ignored rather than erroring, analytics must never break the site).
  `/api/admin/analytics` (auth required — one call returns visitors
  today/this week/this month, page views last 30 days, monthly sales
  for the last 12 months, daily unique visitors for the last 14 days,
  and top 6 each of most-viewed products, most-viewed categories, and
  most-added-to-cart products, all last 90 days). `?action=live` on the
  same file (auth required, separate and cheap — active sessions in the
  last 3 minutes — so the dashboard can poll it every 10s without
  re-running the heavier aggregate queries; this used to be its own
  `api/admin/live.js`, merged in early on to stay under the function
  cap — see "Function budget").
- **Dashboard**: Analytics page — live "active now" counter (polling,
  pulsing dot), visitor stat cards, two hand-rolled SVG bar charts
  (monthly sales, 14-day visitor trend — no charting library dependency,
  consistent with the rest of the project), three ranked lists (top
  products/categories/cart-adds) with proportional mini-bars, and the
  Business Metrics section below.

### Advanced Analytics (date-range business metrics)

A second, date-scoped view under the same page — the traffic charts
above are always "last N days/months"; this section answers "how did
we do in a specific period" instead.

- **API**: `GET /api/admin/analytics?action=range&range=today|7d|30d|this_month|last_month|custom[&from=&to=]`
  (folded into the same file). Returns revenue, order count, average
  order value, an estimated conversion rate, new-vs-returning customer
  counts, best/slowest sellers, and order/payment status breakdowns —
  all scoped to the chosen range.
  - **New vs. returning**: for every customer with an order in the
    range, compares that email's all-time first order date against the
    range start — first order inside the range = new, otherwise
    returning. Correct by construction (derived from `orders`, not a
    separate counter that could drift).
  - **Conversion rate is explicitly labeled an estimate** — it's
    `orders ÷ unique pageview sessions` in the same window, not a real
    per-session purchase funnel (nothing links a specific visit to a
    specific order). Useful as a trend line, not a precise rate — said
    plainly in both the code comment and the API response shape isn't
    oversold with a bare "conversionRate" that looks more precise than
    it is.
  - **Slowest sellers** shows products with the *lowest* quantity sold
    in the range, among products that had at least one sale — i.e.
    "what barely moved," not "what's never been ordered at all" (the
    latter would just be most of an early-stage catalogue and not
    actionable).
- **Dashboard**: a "Business Metrics" section on the Analytics page —
  range dropdown (+ a custom from/to picker), 5 stat cards, best-seller/
  slowest-seller ranked lists, and a mixed order+payment status
  breakdown using the same badge colors as the Orders/Payments pages.
- **Verified**: `resolveRange()`'s date math checked locally against
  every range option (today/7d/this_month/last_month/custom, plus the
  invalid-custom-range rejection) before deploying.

---

## Store Settings

Contact info, social links and SEO basics — used to be scattered as
hardcoded strings across `shared-ui.js` (nav/menu/floating WhatsApp
button — loaded on **every** page) and `index.html`'s footer. One
settings key now drives all of it.

- **Schema**: one more `settings` key, `store_settings` — `storeName`,
  `contactEmail`, `whatsapp`, `mapsUrl`, `instagramUrl`, `facebookUrl`
  (empty by default — wasn't linked anywhere before), `seoTitle`,
  `seoDescription`.
- **API**: no new file — `?action=site-structure` on the public
  products file now also returns `storeSettings`; `api/admin/settings.js`
  reads/writes it like any other key.
- **`catalog.js`**: `STORE_SETTINGS` (defaults matching what was
  hardcoded), refreshed in place by `SITE_STRUCTURE_READY` — same
  pattern as Categories/Rooms/Top Sellers/Content.
- **`shared-ui.js`** (every page, since this file is loaded everywhere):
  the nav menu's Contact link, the 3 footer-drawer social icons
  (Instagram/Maps/WhatsApp) get their `href`s patched once the real
  settings arrive — same "hardcoded default renders first, then
  refines" approach as everything else, so nothing about first paint
  changed. This was the highest-blast-radius change in this phase (one
  file, every page) and was verified live across the homepage, category,
  product and checkout pages after deploying.
- **`index.html`** (the homepage specifically, since it has its own
  bigger footer + floating WhatsApp button beyond what `shared-ui.js`
  injects): footer Instagram/Maps/WhatsApp/email links and labels,
  the floating WhatsApp button, and `<title>`/`<meta name="description">`
  all patched the same way.
- **Dashboard**: `dashboard-store-settings.html` — General/Social/SEO
  tabs.
- **Deliberately out of scope**: propagating the same patch to every
  other page's own footer copy if they have one, and to `<title>`/meta
  tags on non-homepage pages (each page currently sets its own,
  page-specific title — e.g. a product's own name — which should stay
  that way; only the homepage's generic title/description come from
  Store Settings).

---

## Next up

Working through a larger dashboard expansion (customer's own spec),
in this order:

1. ~~Dashboard shell split + Overview home + Customers module~~ done.
2. ~~Inventory~~ done — stock quantity / low-stock threshold on
   `products`, `inventory_log`, atomic stock reservation inside order
   creation, restock on cancel, dashboard page + manual adjustments.
3. ~~Coupons~~ done — real `coupons` table, server-side validation +
   authoritative price/discount recompute in `api/orders.js`, admin CRUD,
   `checkout.js`'s `PROMO_CODES` demo fully replaced.
4. ~~Shipping settings~~ done.
4b. ~~Catalog Structure~~ done (out-of-band client request) — categories,
   rooms and Top Sellers all dashboard-editable now.
5. ~~Payments view~~ done — totals/methods/failures view, plus the
   Paymob webhook + HMAC verification built and ready (still disabled,
   returns 501 until real credentials are configured — not faked).
6. ~~Notification templates~~ done — order email subjects/intro/footer
   and the WhatsApp message are dashboard-editable now; the HTML layout
   itself stays fixed (see "Notification templates" for why).
7. ~~Content management~~ done — homepage hero text.
8. ~~Reviews~~ done — schema, public submit/read, admin moderation
   queue, storefront UI on `product.html`.
9. ~~Advanced Analytics~~ done — date-range business metrics (revenue,
   orders, AOV, estimated conversion, new/returning, best/slowest
   sellers, status breakdowns).
10. ~~Store Settings~~ done — contact/social/SEO, patched into
    `shared-ui.js` (every page) and the homepage's footer/floating
    button/meta tags.
11. **Admin roles**, **Activity log** — roughly in that order.
12. **Paymob** (actual gateway wiring) and **Domain + SEO** — deliberately
    last, per the customer's own stated priority.
