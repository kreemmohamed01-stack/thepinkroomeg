# Moving The Pink Room to a new Vercel account

Follow this in order. Nothing here touches the live site until the very
last step, so you can stop at any point and the current site keeps
running exactly as it does now.

Run `node db/check-env.js` whenever you want to know where you stand.

---

## Before you start: what does NOT move

These live outside Vercel and keep working untouched. Do not recreate them.

| Service | Holds | Action |
|---|---|---|
| **Neon** | products, orders, customers, analytics | none — reuse the same connection string |
| **Cloudinary** | all product images | none — reuse the same credentials |
| **Gmail** | order notification sender | none |
| **CallMeBot** | WhatsApp order alerts | none |
| **Meta** | pixel / conversions API | none |

Only the *hosting* moves. Your data stays where it is, which is why no
products or orders can be lost in this migration.

---

## Step 1 — Collect the values you cannot re-read later

**This is the step that matters most.** Vercel will not show a secret's
value again after it is saved — `vercel env pull` returns `[SENSITIVE]`
for them. Collect these before you delete anything.

Copy each value from the **old** project's dashboard
(Settings → Environment Variables → click the eye icon) into a
temporary local file `.env.production.local`. That filename is already
gitignored, and you should delete it when the migration is done.

Secrets you must copy by hand:

```
ADMIN_USERNAME=
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
GMAIL_USER=
GMAIL_APP_PASSWORD=
SHOP_NOTIFY_EMAIL=
CALLMEBOT_APIKEY=
SHOP_WHATSAPP_TO=
META_PIXEL_ID=
META_CAPI_ACCESS_TOKEN=
```

The database values are **not** secret and can be pulled automatically:

```bash
vercel env pull .env.production.local
```

Then verify you have everything, including a live database connection:

```bash
node db/check-env.js
```

Do not continue until it prints **"All required settings present."**

> If `ADMIN_PASSWORD` or `ADMIN_SESSION_SECRET` is lost, it is not a
> disaster — set a new value on the new account and use that to log in.
> Everything else must be the original value.

---

## Step 2 — Create the project on the new account

```bash
vercel logout
vercel login            # sign in as the NEW account
cd <this folder>
rm -rf .vercel          # forget the old project link
vercel link             # create/link a project on the new account
```

Say **no** to overriding build settings — this is a static site with
serverless functions and needs no build step.

---

## Step 3 — Add the environment variables

For each variable, add it to Production, Preview and Development:

```bash
vercel env add DATABASE_URL production
# paste the value when prompted, then repeat for each name
```

Faster, if you have them all in `.env.production.local`:

```bash
while IFS='=' read -r k v; do
  case "$k" in ''|\#*) continue;; esac
  printf '%s' "${v%\"}" | sed 's/^"//' | vercel env add "$k" production
done < .env.production.local
```

Then confirm nothing is missing:

```bash
vercel env pull .env.production.local && node db/check-env.js
```

**Required** (site or dashboard breaks without them):
`DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`,
`ADMIN_SESSION_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET`

**Optional** (a feature switches off, the store still sells):
Gmail, CallMeBot, Meta, Paymob.

> Paymob is currently **not configured** on the live site — card payment
> is off and orders come through cash on delivery. Moving accounts does
> not change that. If you want cards later, add `PAYMOB_API_KEY`,
> `PAYMOB_INTEGRATION_ID` and `PAYMOB_HMAC_SECRET`.

---

## Step 4 — Deploy and test on the temporary URL

```bash
vercel --prod
```

You get a `*.vercel.app` URL. The real domain still points at the old
account, so customers are unaffected. Test on this URL first:

- [ ] Homepage loads, hero video plays
- [ ] Categories and a product page open
- [ ] Add to cart, and the cart survives a page refresh
- [ ] Search returns results
- [ ] Arabic toggle switches the site over
- [ ] **Dashboard login works** (`/dashboard-login`)
- [ ] Dashboard shows the **85 products and 8 orders** — if it shows
      zero, `DATABASE_URL` is pointing at the wrong database, stop here
- [ ] Place a test order end to end
- [ ] The order email and WhatsApp alert both arrive
- [ ] The test order appears in the dashboard, then delete it

---

## Step 5 — Move the domain

Only after every box above is ticked.

1. On the **old** account: Settings → Domains → remove `thepinkroomeg.com`
   and `www.thepinkroomeg.com`.
2. On the **new** account: Settings → Domains → add both. Vercel will
   show the DNS records it expects.
3. Update the records at your DNS provider if they differ.

Propagation is usually minutes. A short window where the domain resolves
to neither account is normal — no data is at risk during it.

---

## Step 6 — Verify the live domain

```bash
# pages
for u in / /shop.html /wishlist /checkout; do
  curl -s -o /dev/null -w "$u %{http_code}\n" https://www.thepinkroomeg.com$u
done

# caching must be immutable on assets, no-store on the API
curl -sI "https://www.thepinkroomeg.com/logo-beige.png" | grep -i cache-control
curl -sI -X POST "https://www.thepinkroomeg.com/api/track" | grep -i cache-control

# the crawler filter: browser passes, scraper is refused
curl -s -o /dev/null -w "browser %{http_code}\n" -A "Mozilla/5.0 Chrome/120" https://www.thepinkroomeg.com/
curl -s -o /dev/null -w "GPTBot  %{http_code}\n" -A "GPTBot/1.0"            https://www.thepinkroomeg.com/
```

Expect `200` for pages and the browser, `max-age=31536000, immutable` on
the image, `no-store` on the API, and `403` for GPTBot.

---

## Step 7 — Clean up

- Delete `.env.production.local` from this folder.
- Keep the old project for about a week as a fallback, then delete it so
  its bandwidth is not counted against you.
- Update `SITE_URL`/canonical references only if the domain changed —
  it should not have.

---

## If something goes wrong

Nothing here is irreversible. Re-add the domain to the old project and
the previous site is live again within minutes; its deployments are all
still there. The database is untouched throughout, so no products,
orders or customers can be lost by anything in this document.
