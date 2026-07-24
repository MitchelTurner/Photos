# Deploy the API on Railway

## Quick fix if the build fails with `npm: command not found`

Nixpacks was detecting `index.html` and installing **nginx** instead of Node.
This repo now has a root `package.json` + `nixpacks.toml` so Node is forced.

**Recommended service settings**
- **Root Directory:** `/` (repo root) — simplest with current config  
  **or** `server` if you point Config File to `/server/railway.toml`
- Do **not** leave a custom build that assumes nginx

Redeploy after pulling `main`.

---

## 1. Create the project

1. Go to [railway.app](https://railway.app) → **New Project**
2. **Deploy from GitHub repo** → `MitchelTurner/Photos` (branch `main`)
3. Service **Settings**:
   - **Root Directory:** leave `/` (or set `server` + config `/server/railway.toml`)
4. **Add Postgres:** **+ Create** → **Database** → **PostgreSQL**  
   Connect it so `DATABASE_URL` is available on the API service.

## 2. Volume for uploads

1. API service → **Settings** → **Volumes**
2. Mount path: `/data/uploads`
3. Set `UPLOAD_DIR=/data/uploads`

## 3. Environment variables

| Variable | Example / notes |
|----------|-----------------|
| `DATABASE_URL` | From Postgres plugin (auto) |
| `PORT` | Leave unset — Railway sets it |
| `SITE_URL` | `https://your-static-site.com` |
| `PUBLIC_API_URL` | `https://YOUR-SERVICE.up.railway.app` |
| `CORS_ORIGINS` | Optional extras, comma-separated |
| `STRIPE_SECRET_KEY` | `sk_test_…` or `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `PRODIGI_API_KEY` | From Prodigi |
| `PRODIGI_API_BASE` | `https://api.sandbox.prodigi.com/v4.0` or live |
| `PRODIGI_SHIPPING_METHOD` | `Standard` |
| `UPLOAD_DIR` | `/data/uploads` |
| `ADMIN_EMAIL` | Login email |
| `ADMIN_PASSWORD` | Strong password |
| `ADMIN_SESSION_SECRET` | `openssl rand -hex 32` |

## 4. Public URL

1. **Settings → Networking → Generate Domain**
2. Set `PUBLIC_API_URL` to that HTTPS origin
3. Check `https://YOUR-SERVICE.up.railway.app/health`
4. Admin: `https://YOUR-SERVICE.up.railway.app/admin/`

## 5. Stripe webhook

- URL: `https://YOUR-SERVICE.up.railway.app/webhook/stripe`
- Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`

## 6. Point the static site at the API

```js
// index.html
apiBase: "https://YOUR-SERVICE.up.railway.app",
checkoutEndpoint: "https://YOUR-SERVICE.up.railway.app/checkout",
```

```js
// order/success/index.html
const API_BASE = "https://YOUR-SERVICE.up.railway.app";
```

## Build / start

- Build: `npm run build` → installs + builds `server/`
- Start: `npm run start:prod` → Prisma migrate + Nest
- Health: `GET /health`

## Checklist

- [ ] Deploy succeeds (Node, not nginx)
- [ ] Postgres attached
- [ ] Volume at `/data/uploads`
- [ ] Env vars set
- [ ] `/health` ok
- [ ] `/admin/` login works
- [ ] Stripe webhook configured
- [ ] Static site `CONFIG` updated
