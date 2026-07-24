# Deploy the API on Railway

## 1. Create the project

1. Go to [railway.app](https://railway.app) → **New Project**
2. **Deploy from GitHub repo** → `MitchelTurner/Photos` (branch `main`)
3. After the service appears, open **Settings**:
   - **Root Directory:** `server`
   - **Config-as-code path:** `/server/railway.toml` (optional if Root Directory is `server`)
4. **Add Postgres:** project canvas → **+ Create** → **Database** → **PostgreSQL**  
   Railway injects `DATABASE_URL` into the API service (use **Variable Reference** / connect if needed).

## 2. Volume for uploads

1. Open the API service → **Settings** → **Volumes**
2. Mount path: `/data/uploads`
3. Keep `UPLOAD_DIR=/data/uploads` in variables (below)

## 3. Environment variables

In the API service → **Variables**, set:

| Variable | Example / notes |
|----------|-----------------|
| `DATABASE_URL` | From Postgres plugin (auto) |
| `PORT` | Leave unset — Railway sets it |
| `SITE_URL` | `https://your-static-site.com` (SiteGround origin, no trailing slash) |
| `PUBLIC_API_URL` | `https://YOUR-SERVICE.up.railway.app` (set after first deploy + domain) |
| `CORS_ORIGINS` | Optional extra origins, comma-separated |
| `STRIPE_SECRET_KEY` | `sk_test_…` or `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (after webhook is created) |
| `PRODIGI_API_KEY` | From Prodigi dashboard |
| `PRODIGI_API_BASE` | Sandbox: `https://api.sandbox.prodigi.com/v4.0` · Live: `https://api.prodigi.com/v4.0` |
| `PRODIGI_SHIPPING_METHOD` | `Standard` |
| `PRODIGI_FALLBACK_ASSET_URL` | Optional sandbox image URL |
| `UPLOAD_DIR` | `/data/uploads` |
| `ADMIN_EMAIL` | Your login email |
| `ADMIN_PASSWORD` | Strong password |
| `ADMIN_SESSION_SECRET` | Long random string (`openssl rand -hex 32`) |

Generate a session secret locally:

```bash
openssl rand -hex 32
```

## 4. Public URL

1. API service → **Settings** → **Networking** → **Generate Domain**
2. Copy it into `PUBLIC_API_URL` (and redeploy if needed)
3. Health check: open `https://YOUR-SERVICE.up.railway.app/health` → `{ "ok": true, ... }`
4. Admin: `https://YOUR-SERVICE.up.railway.app/admin/`

## 5. Stripe webhook

1. [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks) → **Add endpoint**
2. URL: `https://YOUR-SERVICE.up.railway.app/webhook/stripe`
3. Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`
4. Copy the signing secret → Railway `STRIPE_WEBHOOK_SECRET`

## 6. Point the static site at the API

In `index.html`:

```js
const CONFIG = {
  apiBase: "https://YOUR-SERVICE.up.railway.app",
  checkoutEndpoint: "https://YOUR-SERVICE.up.railway.app/checkout",
  licenseEmail: "hello@ketchikanphotos.com",
};
```

In `order/success/index.html`:

```js
const API_BASE = "https://YOUR-SERVICE.up.railway.app";
```

## Build / start (already in repo)

- **Build:** `npm ci && npm run build` (generates Prisma client + Nest build)
- **Start:** `npm run start:prod` → runs `prisma migrate deploy` then `node dist/main.js`
- **Health:** `GET /health`

## Checklist

- [ ] Root Directory = `server`
- [ ] Postgres attached (`DATABASE_URL`)
- [ ] Volume at `/data/uploads`
- [ ] All env vars set
- [ ] Domain generated → `PUBLIC_API_URL`
- [ ] `/health` returns ok
- [ ] `/admin/` login works
- [ ] Stripe webhook pointing at `/webhook/stripe`
- [ ] Static site `CONFIG.apiBase` / `checkoutEndpoint` updated
