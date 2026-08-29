/* ============================================================
   THE PINK ROOM — catalog data
   CATEGORIES / ROOMS below are dashboard-editable now (Catalog
   Structure page) — the objects here are just the starting defaults so
   every page still renders instantly and correctly even before the
   real settings arrive. SITE_STRUCTURE_READY (bottom of this file)
   fetches the admin-edited versions and mutates these same objects
   IN PLACE, same pattern as PRODUCTS/PRODUCTS_READY below. New
   categories/rooms added from the dashboard show up in things that
   read CATEGORIES/ROOMS *after* that promise resolves (e.g. the
   product form's dropdowns, category.html visited directly by URL);
   they won't automatically get a homepage card or nav link — those
   still need to be added by hand when a brand-new category/room goes
   from "exists in the data" to "customers can discover it".
   TOP_SELLER_IDS is which products show in the homepage's Top Sellers
   section — also dashboard-editable, also refreshed the same way.
   HOMEPAGE_CONTENT is the hero title/subtitle/button — same story.
   STORE_SETTINGS is contact/social/SEO info — same story, patched onto
   the DOM by shared-ui.js since this file only holds the data.
   FILTER_GROUPS is unrelated static structure and isn't editable.
   PRODUCTS is loaded from the database (see /api/products.js) instead
   of being hardcoded here — the dashboard's Products page is what
   actually creates/edits/deletes them.
   ============================================================ */

/* Product photos are hosted on Cloudinary at their original upload
   resolution — fine for the full-size gallery view, wasteful for a
   ~300px card thumbnail. Cloudinary can resize/re-encode on the fly
   just by inserting a transform segment into the existing URL (no
   re-upload, no separate asset) — this is used only for card-grid
   thumbnails; the full-resolution URL is left untouched everywhere
   else (product page gallery, structured data, etc). Non-Cloudinary
   URLs (e.g. local fallback images) pass through unchanged. */
function tprThumb(url, width){
  if (!url || typeof url !== 'string') return url;
  const marker = '/image/upload/';
  const i = url.indexOf(marker);
  if (i === -1) return url;
  const w = width || 400;
  return url.slice(0, i + marker.length) + `f_auto,q_auto,c_limit,w_${w}/` + url.slice(i + marker.length);
}
window.tprThumb = tprThumb;

const CATEGORIES = {
  'paintings': {
    name: 'Paintings',
    description: 'Explore our curated collection of paintings, selected to bring character and artistic expression into every space.',
    hero: 'categ photos/painting-upscaled-2x.jpg',
    subcategories: []
  },
  'accessories': {
    name: 'Accessories',
    description: 'Refined objects and finishing touches, chosen to bring warmth and personality to every corner of your home.',
    hero: 'categ photos/accessories-upscaled-2x.jpg',
    subcategories: [
      { slug: 'vases', name: 'Vases' }
    ]
  },
  'lighting': {
    name: 'Lighting',
    description: 'Sculptural lighting designed to shape the mood of a room, from soft ambient glow to considered statement pieces.',
    hero: 'categ photos/lighting-upscaled-2x.jpg',
    subcategories: [
      { slug: 'table-lamps', name: 'Table Lamps' }
    ]
  },
  'furniture': {
    name: 'Furniture',
    description: 'Timeless furniture with quiet presence, made to anchor a space and last well beyond a season.',
    hero: 'categ photos/furniture-upscaled-2x.jpg',
    subcategories: [
      { slug: 'side-tables',   name: 'Side Tables' },
      { slug: 'coffee-tables', name: 'Coffee Tables' }
    ]
  },
  'wall-art': {
    name: 'WallArt',
    description: 'Considered wall pieces that give a room its focal point, selected for texture, tone and composition.',
    hero: 'categ photos/wall art-upscaled-2x.jpg',
    subcategories: []
  },
  'sale-offers': {
    name: 'Sale',
    description: 'Selected pieces at limited prices — a rotating edit of favourites, available while stocks last.',
    hero: 'categ photos/sale-upscaled-2x.jpg',
    subcategories: [
      { slug: 'flower-pots', name: 'Flower Pots' },
      { slug: 'ornaments',   name: 'Ornaments' }
    ]
  },
  'plants': {
    name: 'Artificial Plants',
    description: 'Living greenery and botanical pieces, chosen to bring life and texture into every room.',
    hero: 'categ photos/plants-upscaled-2x.jpg',
    subcategories: []
  }
};

/* Shop by Room — a second browsing axis, each with its own page.
   No products are assigned to any room yet; every product's `rooms`
   array is empty until the client supplies room-specific picks. */
const ROOMS = {
  'living-room': {
    name: 'Living Room',
    description: 'Pieces that set the tone of the room you share — sculptural lighting, soft textures and quiet statement objects.',
    hero: 'rooms/livingroom-upscaled-4x.jpg'
  },
  'bedroom': {
    name: 'Bedroom',
    description: 'Calm, tactile pieces chosen to make the most personal room in the home feel considered and restful.',
    hero: 'rooms/bedroom-upscaled-4x.jpg'
  },
  'dining-area': {
    name: 'Dining Area',
    description: 'Tableware, lighting and centrepieces made for long evenings and the table everyone gathers around.',
    hero: 'rooms/diningarea-upscaled-4x.jpg'
  },
  'entrance-console': {
    name: 'Entrance Console',
    description: 'The first impression of your home — consoles, mirrors and objects styled for the entryway.',
    hero: 'rooms/entrance-upscaled-4x.jpg'
  },
  'bathroom': {
    name: 'Bathroom',
    description: 'Refined everyday essentials that turn a functional space into something quietly luxurious.',
    hero: 'rooms/bathroom-upscaled-4x.jpg'
  },
  'outdoor-space': {
    name: 'Outdoor Space',
    description: 'Planters, greenery and durable accents designed to extend your interior beyond the walls.',
    hero: 'rooms/outdoor-upscaled-4x.jpg'
  }
};

/* Homepage "Top Sellers" picks, in order — product ids. Dashboard-
   editable (Catalog Structure page); these are just the launch
   defaults so the section still renders before the real list arrives. */
let TOP_SELLER_IDS = [
  'wa-golden-fan-leaf', 'acc-marble-effect-ginger-jar-set', 'lit-ornate-crystal-urn-table-lamp',
  'fur-round-walnut-pedestal-coffee-table', 'pnt-colorful-horses-painting', 'sal-azure-eye-ginger-jar-set'
];

/* Homepage hero text/button — dashboard-editable (Content page). Same
   defaults as what used to be hardcoded in index.html, refreshed in
   place by SITE_STRUCTURE_READY below. */
let HOMEPAGE_CONTENT = {
  heroTitle: 'The Art of Fine Living',
  heroSubtitle: 'Curated Elegance For Every Home',
  heroButtonText: 'SHOP NOW',
  heroButtonLink: 'shop.html'
};

/* Store contact/social/SEO — dashboard-editable (Store Settings page).
   Same defaults as what's hardcoded across shared-ui.js/index.html
   today; shared-ui.js patches the nav/menu/footer links from this once
   SITE_STRUCTURE_READY resolves. */
let STORE_SETTINGS = {
  storeName: 'The Pink Room',
  contactEmail: 'thepinkroomeg@gmail.com',
  whatsapp: '+201207803666',
  instagramUrl: 'https://www.instagram.com/thepinkroom_eg?igsh=dnZrbW9xazV2dGp5',
  facebookUrl: '',
  mapsUrl: 'https://maps.app.goo.gl/s7NcLQyFgrmkZEms6?g_st=ac',
  seoTitle: 'The Pink Room | Home Accessories',
  seoDescription: 'Curated home accessories, paintings, lighting and furniture — The Pink Room, an Egyptian home decor brand.'
};

/* Active "sale campaign" promotions — dashboard-editable (Coupons page,
   Sale Campaigns section). Just [{ id, label, value }, ...] for
   whichever campaigns are currently live; shared-ui.js reads this to
   render the shiny top banner. Empty by default so a fresh page load
   shows no banner until SITE_STRUCTURE_READY resolves with the real
   list (never a placeholder/fake campaign). */
let ACTIVE_PROMOTIONS = [];

/* Refreshes CATEGORIES / ROOMS / TOP_SELLER_IDS from the dashboard's
   real settings, mutating each IN PLACE (never reassigned) so anything
   holding a reference to these exact objects/array sees the update —
   same pattern as PRODUCTS/PRODUCTS_READY below. Never blocks first
   paint; every consumer either reads the (correct-by-default) values
   synchronously or awaits this promise if it needs the very latest. */
const SITE_STRUCTURE_READY = fetch('/api/products?action=site-structure')
  .then(r => r.json())
  .then(data => {
    if (data && data.ok) {
      if (data.categories && Object.keys(data.categories).length) {
        Object.keys(CATEGORIES).forEach(k => delete CATEGORIES[k]);
        Object.assign(CATEGORIES, data.categories);
      }
      if (data.rooms && Object.keys(data.rooms).length) {
        Object.keys(ROOMS).forEach(k => delete ROOMS[k]);
        Object.assign(ROOMS, data.rooms);
      }
      if (Array.isArray(data.topSellers) && data.topSellers.length) {
        TOP_SELLER_IDS.length = 0;
        TOP_SELLER_IDS.push(...data.topSellers);
      }
      if (data.homepageContent && Object.keys(data.homepageContent).length) {
        Object.assign(HOMEPAGE_CONTENT, data.homepageContent);
      }
      if (data.storeSettings && Object.keys(data.storeSettings).length) {
        Object.assign(STORE_SETTINGS, data.storeSettings);
      }
      if (Array.isArray(data.activePromotions)) {
        ACTIVE_PROMOTIONS.length = 0;
        ACTIVE_PROMOTIONS.push(...data.activePromotions);
      }
    }
    return true;
  })
  .catch(e => {
    console.error('Failed to load site structure:', e);
    return true;
  });

/* Patches any footer/contact links a page happens to have, from the real
   Store Settings (dashboard-editable) once they arrive. index.html has
   always done this patch itself inline; every other page's footer was a
   plain static copy that never picked up a changed WhatsApp number/email/
   Instagram/Maps link — this makes it automatic for any page that reuses
   the same element ids, index.html included (redundant there, harmless).
   Every lookup is a no-op if the page doesn't have that element. */
SITE_STRUCTURE_READY.then(()=>{
  const s = STORE_SETTINGS;
  if (!s) return;
  const $ = id => document.getElementById(id);
  const waHref = s.whatsapp ? 'https://wa.me/' + String(s.whatsapp).replace(/[^0-9]/g, '') : null;

  ['footWA', 'footWAContact', 'floatWA', 'pdpWhatsApp'].forEach(id => {
    const el = $(id);
    if (el && waHref) el.href = waHref;
  });
  const waLabelEl = $('footWAContactLabel');
  if (waLabelEl && s.whatsapp) waLabelEl.textContent = s.whatsapp;

  const igEl = $('footIG');
  if (igEl && s.instagramUrl) igEl.href = s.instagramUrl;

  ['footMap', 'footMapContact'].forEach(id => {
    const el = $(id);
    if (el && s.mapsUrl) el.href = s.mapsUrl;
  });

  const emailEl = $('footEmailContact');
  if (emailEl && s.contactEmail) emailEl.href = 'mailto:' + s.contactEmail;
  const emailLabelEl = $('footEmailLabel');
  if (emailLabelEl && s.contactEmail) emailLabelEl.textContent = s.contactEmail;
});

/* Filter vocabularies — the client's requested facets. Any colour or
   material that isn't listed here still shows up in the filters
   automatically (see optionsFor() in category.html); this list only
   fixes the display order for the values it knows about. */
const FILTER_GROUPS = {
  color:        ['Beige', 'White', 'Black', 'Gold', 'Silver', 'Green', 'Blue', 'Brown'],
  material:     ['Glass', 'Metal', 'Porcelain', 'Ceramic', 'Wood', 'Marble', 'Acrylic', 'Fabric', 'Canvas'],
  size:         ['Small', 'Medium', 'Large'],
  availability: ['In Stock', 'Out of Stock', 'Made to Order'],
  collection:   ['New Arrivals', 'Best Sellers', 'Summer', 'Hand-Painted', 'Sale']
};

/* ------------------------------------------------------------
   PRODUCTS — loaded from the database.
   `PRODUCTS` starts empty and is filled in place (never reassigned —
   `.length = 0; .push(...)` — so anything that captured a reference to
   this exact array early, like shared-ui.js's search, automatically
   sees the real data once the fetch resolves, without needing its own
   fetch logic). Every page that RENDERS products on load must
   `await PRODUCTS_READY` first; code that only runs later in response
   to a user action (typing in search, etc.) doesn't need to, since by
   then the fetch has almost always already resolved — but awaiting is
   harmless (already-resolved promises resolve on the next microtask).
   ------------------------------------------------------------ */
let PRODUCTS = [];

const PRODUCTS_READY = fetch('/api/products')
  .then(r => r.json())
  .then(data => {
    if (data && data.ok && Array.isArray(data.products)) {
      PRODUCTS.length = 0;
      PRODUCTS.push(...data.products);
    }
    return PRODUCTS;
  })
  .catch(e => {
    console.error('Failed to load products:', e);
    return PRODUCTS;
  });

/* Look a product up by its slug — used by the product page. Only
   meaningful after PRODUCTS_READY has resolved. */
function getProductBySlug(slug){
  return PRODUCTS.find(p => p.slug === slug) || null;
}

/* ------------------------------------------------------------
   Multi-category placement.
   Every product has ONE primary category (the one in its breadcrumb,
   its id prefix, the label on the product page) and, optionally, any
   number of EXTRA categories picked in the dashboard — so a piece that
   lives in Sale can also be listed under Accessories, Lighting, etc.
   `productPlacements()` returns them in one uniform shape, primary
   first, and everything that asks "is this product in this category?"
   goes through `productInCategory()` so both kinds count equally.
   Older products simply have no extraCategories and behave as before.
   ------------------------------------------------------------ */
function productPlacements(p){
  const primary = {
    category: p.category,
    categoryName: p.categoryName,
    subcategory: p.subcategory || null,
    subcategoryName: p.subcategoryName || null
  };
  const extras = Array.isArray(p.extraCategories) ? p.extraCategories : [];
  return [primary].concat(extras);
}

function productInCategory(p, catSlug, subSlug){
  return productPlacements(p).some(pl =>
    pl.category === catSlug && (!subSlug || pl.subcategory === subSlug));
}
