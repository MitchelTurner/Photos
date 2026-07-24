# Deploy the API on Railway

## Recommended settings (Dockerfile)

1. **Root Directory:** `server`
2. **Config file:** `/server/railway.toml` (builder = `DOCKERFILE`)
3. Redeploy

The API image is built from `server/Dockerfile` (Node 22 + OpenSSL + Prisma).

---

## 1. Create the project

1. [railway.app](https://railway.app) → **New Project** → GitHub `MitchelTurner/Photos` (`main`)
2. Service **Settings**:
   - **Root Directory:** `server`
   - Config path: `/server/railway.toml` (optional if file is discovered)
3. **+ Database → PostgreSQL** and attach `DATABASE_URL`
4. **Volume** mount: `/data/uploads` · set `UPLOAD_DIR=/data/uploads`

## 2. Environment variables

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | From Postgres |
| `SITE_URL` | Static site origin |
| `PUBLIC_API_URL` | Railway HTTPS domain |
| `STRIPE_SECRET_KEY` | Stripe secret |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret |
| `PRODIGI_API_KEY` | Prodigi key |
| `PRODIGI_API_BASE` | Sandbox or live API base |
| `PRODIGI_SHIPPING_METHOD` | `Standard` |
| `UPLOAD_DIR` | `/data/uploads` |
| `ADMIN_EMAIL` | Admin login |
| `ADMIN_PASSWORD` | Admin password |
| `ADMIN_SESSION_SECRET` | `openssl rand -hex 32` |

## 3. After deploy

- Health: `https://YOUR-SERVICE.up.railway.app/health`
- Admin: `https://YOUR-SERVICE.up.railway.app/admin/`
- Stripe webhook: `https://YOUR-SERVICE.up.railway.app/webhook/stripe`

## 4. Static site

```js
apiBase: "https://YOUR-SERVICE.up.railway.app",
checkoutEndpoint: "https://YOUR-SERVICE.up.railway.app/checkout",
```

## Why not Nixpacks alone?

Custom `nixpacks.toml` that set `nixPkgs = ["openssl"]` **replaced** Node with only OpenSSL, so `npm` was missing. The Dockerfile avoids that class of failure.
