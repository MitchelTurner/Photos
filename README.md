# Ketchikan Photos — Stripe + Prodigi print orders

Static gallery storefront (`index.html`) plus a NestJS API (`server/`) that:

1. Turns the cart into a **Stripe Checkout** session (server-owned prices)
2. Records the paid order in **Postgres**
3. Submits the job to the **Prodigi Print API** for fulfillment

The browser never sees a price or a secret key — it sends only
`{ photoId, title, sizeKey, qty }`, and the server re-derives every price and
Prodigi SKU from `server/src/catalog.ts`.

## Flow

```
browser cart ──POST /checkout──▶ NestJS ──stripe.checkout.sessions.create──▶ Stripe
     ▲                                                                          │
     └───────────────── redirect to session.url ◀──────────────────────────────┘

Stripe ──POST /webhook/stripe (checkout.session.completed)──▶ NestJS
         ├── mark Order paid (shipping + email from session)
         └── POST Prodigi /v4.0/Orders  →  store prodigiOrderId
```

## Setup

```bash
cd server
npm install
cp .env.example .env         # Stripe, Prodigi, SITE_URL, DATABASE_URL
npx prisma migrate deploy    # or: npm run prisma:migrate:dev
npm run start:dev
```

Point the site at the API — in `index.html`:

```js
const CONFIG = {
  apiBase: "http://localhost:3000",
  checkoutEndpoint: "http://localhost:3000/checkout",
  licenseEmail: "hello@ketchikanphotos.com",
};
```

And in `order/success/index.html`, set the same host (no `/checkout`):

```js
const API_BASE = "http://localhost:3000";
```

### Upload photos for sale

1. Open admin on the **API host** (avoids login 404s from the static site):
   `https://<your-railway-api>/admin/`
2. Confirm the API base URL field shows that same Railway origin (green “API connected”).
3. Sign in with `ADMIN_EMAIL` + `ADMIN_PASSWORD`.
3. Upload a print-ready JPEG/PNG with title + category.
4. Published photos appear in the gallery via `GET /photos` and are what
   Stripe/Prodigi fulfill after checkout.

Auth API:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/auth/login` | Email/password → session cookie + token |
| `GET` | `/auth/me` | Current session |
| `POST` | `/auth/logout` | Clear session |
| `GET` | `/health` | Liveness check |

On Railway, mount a persistent volume at `UPLOAD_DIR` (e.g. `/data/uploads`)
so files survive redeploys, and set `PUBLIC_API_URL` to the public API origin.

## Environment

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Signing secret from CLI or Dashboard webhook |
| `SITE_URL` | Public site origin for success/cancel URLs |
| `DATABASE_URL` | Postgres connection string |
| `PRODIGI_API_KEY` | Prodigi REST API key (`X-API-Key`) |
| `PRODIGI_API_BASE` | Default sandbox: `https://api.sandbox.prodigi.com/v4.0` · live: `https://api.prodigi.com/v4.0` |
| `PRODIGI_SHIPPING_METHOD` | e.g. `Standard`, `Budget` |
| `PRINT_ASSET_BASE_URL` | Optional base for `{base}/{photoId}.jpg` (legacy; prefer /admin uploads) |
| `PRODIGI_FALLBACK_ASSET_URL` | Sandbox fallback image if per-photo URLs aren’t set yet |
| `PUBLIC_API_URL` | Public API origin used in `/media/...` URLs for Prodigi |
| `UPLOAD_DIR` | Disk path for uploads (use a Railway volume in prod) |
| `ADMIN_EMAIL` | Admin login email |
| `ADMIN_PASSWORD` | Admin login password (or use `ADMIN_PASSWORD_HASH`) |
| `ADMIN_SESSION_SECRET` | HMAC secret for session tokens/cookies |
| `ADMIN_TOKEN` | Optional legacy raw Bearer token |

Print-ready image URLs are resolved in this order
(`server/src/photos.ts` → env base → fallback).

## Test the whole loop locally

1. Use Stripe **test** keys and Prodigi **sandbox** (`PRODIGI_API_BASE` above).
2. Forward webhooks: `stripe listen --forward-to localhost:3000/webhook/stripe`
   — copy the `whsec_...` into `STRIPE_WEBHOOK_SECRET`.
3. Serve the static site (any static server) with `CONFIG.checkoutEndpoint` set.
4. Add a print, checkout, pay with `4242 4242 4242 4242`.
5. You should land on `/order/success/`, see an `Order` row with `status=fulfilled`,
   and a `prodigiOrderId` from the sandbox.

## Catalog ↔ Prodigi SKUs

Keep these in sync:

| `sizeKey` | Customer label | Stripe amount | Prodigi SKU |
|-----------|----------------|---------------|-------------|
| `8x12` | archival matte | $45 | `GLOBAL-FAP-8X12` |
| `16x24` | archival matte | $120 | `GLOBAL-FAP-16X24` |
| `24x36` | metal / acrylic | $280 | `GLOBAL-MET-24X36` |

- Prices / SKUs: `server/src/catalog.ts` (authoritative)
- UI labels: `PRINT_OPTIONS` in `index.html`
- Confirm SKUs with `GET {PRODIGI_API_BASE}/products/{sku}` before going live.
  Metal (`GLOBAL-MET-*`) is typically US ship-from / US ship-to — adjust the
  catalog or `shipping_address_collection` if you need Canada for that size.

## Deploy (Railway)

- Deploy `server/` as a service. Add env vars from `.env.example`.
- Railway Postgres → `DATABASE_URL`.
- Build: `npm install && npx prisma migrate deploy && npm run build`
- Start: `npm run start`
- Stripe Dashboard → webhook `https://<your-api>/webhook/stripe` for
  `checkout.session.completed` (and optionally
  `checkout.session.async_payment_succeeded`).
- Host the static files (`index.html`, `order/success/`) with
  `CONFIG.checkoutEndpoint` / `API_BASE` pointing at the API.

## Notes

- Shipping address + phone are collected in Stripe Checkout.
- The webhook is the source of truth for “paid” — never mark an order paid from
  the success redirect alone. The success page may call `GET /order/status` as a
  fast path, but webhooks cover customers who never load it.
- Fulfillment errors after a successful charge set `Order.status=failed` and
  `fulfillError` without failing the Stripe webhook (so Stripe doesn’t retry
  endlessly). Fix assets/SKU/address and re-submit from ops.
- Optional: enable `automatic_tax: { enabled: true }` on the Checkout Session
  once Stripe Tax is configured.
