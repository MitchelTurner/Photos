# Ketchikan Photos — print order backend

A small NestJS service that turns the site's cart into a **Stripe Checkout**
session and records paid orders. The browser never sees a price or a secret key
— it sends only `{ photoId, title, sizeKey, qty }`, and this server re-derives
every price from `src/catalog.ts`.

## Flow

```
browser cart ──POST /checkout──▶ NestJS ──stripe.checkout.sessions.create──▶ Stripe
     ▲                                                                          │
     └───────────────── redirect to session.url ◀──────────────────────────────┘

Stripe ──POST /webhook/stripe (checkout.session.completed)──▶ NestJS ──▶ Order row
```

## Setup

```bash
cd server
npm install
cp .env.example .env         # fill in your Stripe keys, SITE_URL, DATABASE_URL
npx prisma migrate dev --name init
npm run start:dev
```

Then point the site at it — in `index.html`:

```js
const CONFIG = {
  checkoutEndpoint: "http://localhost:3000/checkout",  // your API + /checkout
  licenseEmail: "hello@ketchikanphotos.com",
};
```

## Test the whole loop locally

1. Use your Stripe **test** keys.
2. Forward webhooks: `stripe listen --forward-to localhost:3000/webhook/stripe`
   — copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET`.
3. Add a print in the site, hit checkout, pay with card `4242 4242 4242 4242`,
   any future date / any CVC.
4. You should land on your `success_url` and see a new `Order` row.

## Deploy on Railway

- Push `server/` as a service. Add the env vars from `.env.example`.
- Railway provisions Postgres → set `DATABASE_URL`.
- Build: `npm run build && npm run prisma:migrate` · Start: `npm run start`.
- In the Stripe dashboard, add a webhook endpoint at
  `https://<your-api>/webhook/stripe` for `checkout.session.completed`, and put
  that signing secret in `STRIPE_WEBHOOK_SECRET`.

## Two things to keep in sync

- **Prices** live in `src/catalog.ts`. The `PRINT_OPTIONS` array in `index.html`
  is display-only; if you change a price, change it in `catalog.ts` (that's what
  actually charges) and mirror it in the HTML for the label.
- **sizeKeys** (`8x12`, `16x24`, `24x36`) must match on both sides.

## Notes

- Shipping address + phone are collected at checkout (`shipping_address_collection`).
- Add `automatic_tax: { enabled: true }` to the session once you've set up Stripe
  Tax, if you want tax handled automatically.
- The webhook is the source of truth for "paid" — never mark an order paid from
  the success redirect alone (users can hit it without paying).

---

## No-backend alternative (if you don't want to run a server)

If you'd rather not host anything, use **Stripe Payment Links** or the
**Buy Button** — both are dashboard-created and work from static HTML. Trade-off:
each is tied to a pre-made product/price, so you'd create one per size (or per
photo × size), and you lose the single dynamic cart. Fine for a handful of
best-sellers; the NestJS route above is better once the catalog grows.
