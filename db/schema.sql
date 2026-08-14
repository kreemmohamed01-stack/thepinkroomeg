-- THE PINK ROOM — database schema
-- Run once via `node db/migrate.js` (uses the direct/unpooled connection,
-- per Neon's guidance: pooled connections aren't for schema changes).

CREATE TABLE IF NOT EXISTS orders (
  id                text PRIMARY KEY,              -- e.g. 'PR-552420', generated client-side today
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- nested objects kept as JSONB rather than normalized tables — the shape
  -- already matches exactly what checkout.js / receipt.html / the emails
  -- expect, so nothing on the frontend has to change to read it back.
  customer          jsonb NOT NULL,                -- { name, email, phone }
  shipping_address  jsonb NOT NULL,                -- { country, street, apt, city, governorate, postal }
  shipping_method   jsonb NOT NULL,                -- { id, label, sub, price }
  billing_address   jsonb,                         -- { sameAsShipping } or a full address
  payment_method    jsonb NOT NULL,                -- { id, label }
  notes             text,
  items             jsonb NOT NULL,                 -- [{ id, name, variant, price, img, qty }]
  pricing           jsonb NOT NULL,                 -- { subtotal, discount, shipping, tax, total }
  promo             jsonb,                          -- { code, pct, label } or null
  payment_status    text NOT NULL,                  -- pending | processing | paid | failed | cancelled
  payment_note      text,
  order_status      text NOT NULL,                  -- confirmed | processing | shipped | delivered | cancelled
  delivery          jsonb,                          -- { minDate, maxDate, label, days }

  -- flat, indexed copies of fields buried in the JSONB above, purely so a
  -- future dashboard can search/filter without JSONB path queries
  customer_email    text,
  customer_phone    text
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at    ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders (customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders (customer_phone);


-- ------------------------------------------------------------
-- products — replaces the hardcoded arrays in catalog.js. Every
-- field the site's pages already read is a real column; anything
-- rarer/product-specific (dimensions, finish variants, room tags,
-- which fields are still placeholder data) lives in `extra` so this
-- table doesn't need a new column every time one product needs one
-- more optional attribute.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id                text PRIMARY KEY,
  slug              text UNIQUE NOT NULL,
  name              text NOT NULL,
  category          text NOT NULL,               -- matches CATEGORIES keys in catalog.js
  category_name     text NOT NULL,
  subcategory       text,
  subcategory_name  text,
  price             numeric,                      -- null = price to be confirmed, never fake
  sale_price        numeric,
  images            jsonb NOT NULL DEFAULT '[]',   -- ['path/or/url', ...], lifestyle image first
  size              text,                          -- Small | Medium | Large — the filter bucket
  size_label        text,                          -- the real client-facing size string
  short_description text,
  material          text,
  color             text,
  availability      text NOT NULL DEFAULT 'In Stock',
  sku               text,
  is_new            boolean NOT NULL DEFAULT false,
  sort_order        integer NOT NULL DEFAULT 0,     -- lets the dashboard reorder within a category later
  extra             jsonb NOT NULL DEFAULT '{}',    -- dimensions, finish, finishes, collection, rooms, _provisional
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
-- (see below for the coupons/inventory/settings tables added after launch)

CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_slug     ON products (slug);

-- Inventory (added after the initial launch — kept as plain ALTERs
-- rather than rewriting the CREATE TABLE above, so re-running this file
-- against the existing production table is safe/idempotent).
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_inventory     boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity      integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold integer NOT NULL DEFAULT 5;

-- ------------------------------------------------------------
-- inventory_log — every stock change, whether from an order being
-- placed (reason='order') or a manual adjustment made in the dashboard
-- (reason='manual'/'restock'). Append-only audit trail; current stock
-- always lives on products.stock_quantity, this is just the history.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_log (
  id           bigserial PRIMARY KEY,
  product_id   text NOT NULL,
  change       integer NOT NULL,       -- negative = stock removed, positive = added
  reason       text NOT NULL,          -- order | manual | restock
  order_id     text,                   -- set when reason = 'order'
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventory_log_product ON inventory_log (product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_log_created ON inventory_log (created_at DESC);


-- ------------------------------------------------------------
-- coupons — real, server-validated promo codes. Replaces the old
-- PROMO_CODES object that used to live in checkout.js (client-only,
-- never touched the server). api/orders.js re-validates the code and
-- recomputes the discount itself at order time — nothing about the
-- discount amount is ever trusted from the browser.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupons (
  code              text PRIMARY KEY,          -- stored uppercase
  type              text NOT NULL,              -- percent | fixed
  value             numeric NOT NULL,           -- percent: 0-100, fixed: EGP amount
  label             text,                       -- customer-facing text, auto-derived if null
  min_order_total   numeric,                    -- null = no minimum
  max_discount      numeric,                    -- caps a percent discount's EGP value, null = uncapped
  usage_limit       integer,                    -- total redemptions allowed, null = unlimited
  usage_count       integer NOT NULL DEFAULT 0,
  starts_at         timestamptz,
  expires_at        timestamptz,
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);


-- ------------------------------------------------------------
-- analytics_events — every pageview / product view / category view /
-- add-to-cart, sent by analytics.js on every page. session_id is an
-- anonymous id generated client-side (localStorage), not tied to any
-- identity — it's what lets us count unique visitors instead of just
-- raw hits.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_events (
  id             bigserial PRIMARY KEY,
  session_id     text NOT NULL,
  type           text NOT NULL,   -- pageview | product_view | category_view | add_to_cart
  path           text,
  product_id     text,
  product_name   text,
  category       text,
  category_name  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  device_type    text,            -- mobile | tablet | desktop — parsed server-side from the request's own User-Agent header
  browser        text,
  country        text,            -- from Vercel's edge geo headers, not client-reported
  city           text
);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_session    ON analytics_events (session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_type       ON analytics_events (type);
CREATE INDEX IF NOT EXISTS idx_analytics_product    ON analytics_events (product_id);
CREATE INDEX IF NOT EXISTS idx_analytics_category   ON analytics_events (category);
-- older databases created before these columns existed
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS device_type text;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS browser     text;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS country     text;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS city        text;

-- ------------------------------------------------------------
-- active_sessions — upserted by every pageview/heartbeat (~every 25s
-- while a tab is open and visible). "Active right now" = last_seen
-- within the last few minutes. Kept separate from analytics_events so
-- the heartbeat spam doesn't bloat the events table — this table only
-- ever holds one row per currently-or-recently-open tab, and
-- self-prunes (see api/track.js) instead of needing a cron job.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS active_sessions (
  session_id  text PRIMARY KEY,
  last_seen   timestamptz NOT NULL DEFAULT now(),
  path        text,
  device_type text,
  country     text
);
CREATE INDEX IF NOT EXISTS idx_active_sessions_last_seen ON active_sessions (last_seen DESC);
ALTER TABLE active_sessions ADD COLUMN IF NOT EXISTS device_type text;
ALTER TABLE active_sessions ADD COLUMN IF NOT EXISTS country     text;


-- ------------------------------------------------------------
-- settings — generic admin-editable key/value store, used for shipping
-- methods now and store-general/SEO/social/notification-template
-- settings in later phases, so those don't each need their own table.
-- `value` holds whatever shape that key needs (an object, array,
-- string...); readers know the shape for the key they're asking for.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed defaults once — ON CONFLICT DO NOTHING so re-running this file
-- never clobbers values the admin has already edited.
INSERT INTO settings (key, value) VALUES (
  'shipping_methods',
  '{
    "standard": { "id":"standard", "label":"Standard Delivery", "sub":"3 – 5 Business Days", "price":80,  "minDays":3, "maxDays":5 },
    "express":  { "id":"express",  "label":"Express Delivery",  "sub":"1 – 2 Business Days", "price":150, "minDays":1, "maxDays":2 }
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- Catalog structure (categories/rooms/top-sellers) — dashboard-editable
-- (Catalog Structure page); these seed rows are the same values that used
-- to be hardcoded in catalog.js, so nothing changes on first deploy.
INSERT INTO settings (key, value) VALUES (
  'categories',
  '{"paintings":{"name":"Paintings","description":"Explore our curated collection of paintings, selected to bring character and artistic expression into every space.","hero":"categ photos/painting-upscaled-2x.png","subcategories":[]},"accessories":{"name":"Accessories","description":"Refined objects and finishing touches, chosen to bring warmth and personality to every corner of your home.","hero":"categ photos/accessories-upscaled-2x.png","subcategories":[{"slug":"vases","name":"Vases"}]},"lighting":{"name":"Lighting","description":"Sculptural lighting designed to shape the mood of a room, from soft ambient glow to considered statement pieces.","hero":"categ photos/lighting-upscaled-2x.png","subcategories":[{"slug":"table-lamps","name":"Table Lamps"}]},"furniture":{"name":"Furniture","description":"Timeless furniture with quiet presence, made to anchor a space and last well beyond a season.","hero":"categ photos/furniture-upscaled-2x.png","subcategories":[{"slug":"side-tables","name":"Side Tables"},{"slug":"coffee-tables","name":"Coffee Tables"}]},"wall-art":{"name":"Wall Art","description":"Considered wall pieces that give a room its focal point, selected for texture, tone and composition.","hero":"categ photos/wall art-upscaled-2x.png","subcategories":[]},"sale-offers":{"name":"Sale","description":"Selected pieces at limited prices — a rotating edit of favourites, available while stocks last.","hero":"categ photos/sale-upscaled-2x.png","subcategories":[{"slug":"flower-pots","name":"Flower Pots"},{"slug":"ornaments","name":"Ornaments"}]},"plants":{"name":"Plants","description":"Living greenery and botanical pieces, chosen to bring life and texture into every room.","hero":"categ photos/plants-upscaled-2x.png","subcategories":[]}}'::jsonb
) ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value) VALUES (
  'rooms',
  '{"living-room":{"name":"Living Room","description":"Pieces that set the tone of the room you share — sculptural lighting, soft textures and quiet statement objects.","hero":"rooms/livingroom-upscaled-4x.png"},"bedroom":{"name":"Bedroom","description":"Calm, tactile pieces chosen to make the most personal room in the home feel considered and restful.","hero":"rooms/bedroom-upscaled-4x.png"},"dining-area":{"name":"Dining Area","description":"Tableware, lighting and centrepieces made for long evenings and the table everyone gathers around.","hero":"rooms/diningarea-upscaled-4x.png"},"entrance-console":{"name":"Entrance Console","description":"The first impression of your home — consoles, mirrors and objects styled for the entryway.","hero":"rooms/entrance-upscaled-4x.png"},"bathroom":{"name":"Bathroom","description":"Refined everyday essentials that turn a functional space into something quietly luxurious.","hero":"rooms/bathroom-upscaled-4x.png"},"outdoor-space":{"name":"Outdoor Space","description":"Planters, greenery and durable accents designed to extend your interior beyond the walls.","hero":"rooms/outdoor-upscaled-4x.png"}}'::jsonb
) ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value) VALUES (
  'top_sellers',
  '["wa-golden-fan-leaf","acc-marble-effect-ginger-jar-set","lit-ornate-crystal-urn-table-lamp","fur-round-walnut-pedestal-coffee-table","pnt-colorful-horses-painting","sal-azure-eye-ginger-jar-set"]'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- Homepage hero content — dashboard-editable (Content page).
INSERT INTO settings (key, value) VALUES (
  'homepage_content',
  '{"heroTitle":"The Art of Fine Living","heroSubtitle":"Curated Elegance For Every Home","heroButtonText":"SHOP NOW","heroButtonLink":"shop.html"}'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- Store contact/social/SEO — dashboard-editable (Store Settings page).
INSERT INTO settings (key, value) VALUES (
  'store_settings',
  '{"storeName":"The Pink Room","contactEmail":"thepinkroomeg@gmail.com","whatsapp":"+201207803666","instagramUrl":"https://www.instagram.com/thepinkroom_eg?igsh=dnZrbW9xazV2dGp5","facebookUrl":"","mapsUrl":"https://maps.app.goo.gl/s7NcLQyFgrmkZEms6?g_st=ac","seoTitle":"The Pink Room | Home Accessories","seoDescription":"Curated home accessories, paintings, lighting and furniture — The Pink Room, an Egyptian home decor brand."}'::jsonb
) ON CONFLICT (key) DO NOTHING;


-- ------------------------------------------------------------
-- reviews — customer product reviews, moderated before showing
-- publicly (status starts 'pending'; only 'approved' ones are ever
-- returned by the public read). No accounts system, so no FK to a
-- customer — name/email are just what the reviewer typed in.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id           bigserial PRIMARY KEY,
  product_id   text NOT NULL,
  name         text NOT NULL,
  email        text,
  rating       integer NOT NULL,
  title        text,
  body         text NOT NULL,
  status       text NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews (product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status  ON reviews (status);


-- ------------------------------------------------------------
-- newsletter_subscribers — the homepage "Stay Inspired" form. Emailed
-- when the admin adds a new product/offer and ticks "notify
-- subscribers" (api/admin/products.js); every email includes an
-- unsubscribe link (api/products.js?action=newsletter-unsubscribe).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id                bigserial PRIMARY KEY,
  email             text UNIQUE NOT NULL,
  subscribed_at     timestamptz NOT NULL DEFAULT now(),
  unsubscribed      boolean NOT NULL DEFAULT false,
  unsubscribed_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_newsletter_unsubscribed ON newsletter_subscribers (unsubscribed);
