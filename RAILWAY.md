# Deploy the API on Railway

## Recommended settings (Dockerfile)

1. **Root Directory:** `server`
2. **Config file:** `/server/railway.toml` (builder = `DOCKERFILE`)
3. Redeploy

The API image is built from `server/Dockerfile` (Node 22 + OpenSSL + Prisma).

The API also serves the gallery UI from `server/public/` (`/`, `/admin/`, `/order/success/`).

---

## Why photos disappear (important)

Upload files live on disk at `UPLOAD_DIR` (default `/data/uploads`). Postgres only stores metadata.

If Railway has **no volume** at that path, every redeploy wipes the image files. The gallery then looks empty (or shows broken images), even though `/photos` still lists DB rows.

**Fix:**

1. Railway service → **Volumes** → mount path `/data/uploads`
2. Set `UPLOAD_DIR=/data/uploads`
3. Open `https://YOUR-SERVICE.up.railway.app/admin/`
4. Delete rows marked **file missing**, then **re-upload** each photo

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
| `SITE_URL` | Public site origin (e.g. `https://ketchikanphotos.com` or the Railway URL) — CORS |
| `PUBLIC_API_URL` | `https://phot-api.up.railway.app` |
| `CORS_ORIGINS` | Extra static origins, comma-separated |
| `CORS_ALLOW_ANY` | `true` while testing admin from any host (optional) |
| `STRIPE_SECRET_KEY` | Stripe secret |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret |
| `PRODIGI_API_KEY` | Prodigi key |
| `PRODIGI_API_BASE` | Sandbox or live API base |
| `PRODIGI_SHIPPING_METHOD` | `Standard` |
| `UPLOAD_DIR` | `/data/uploads` |
| `ADMIN_EMAIL` | Admin login |
| `ADMIN_PASSWORD` | Admin password (prefer this over a stale `ADMIN_PASSWORD_HASH`) |
| `ADMIN_SESSION_SECRET` | `openssl rand -hex 32` |

## 3. After deploy

- Gallery: `https://YOUR-SERVICE.up.railway.app/`
- Health: `https://YOUR-SERVICE.up.railway.app/health`
- Admin: `https://YOUR-SERVICE.up.railway.app/admin/`
- Stripe webhook: `https://YOUR-SERVICE.up.railway.app/webhook/stripe`

## 4. Your photos are on Railway — not old SiteGround HTML

**Working gallery right now:** `https://phot-api.up.railway.app/`

`https://ketchikanphotos.com` is still serving an **old** SiteGround `index.html` with
hardcoded placeholder frames (`src: ""`) and **no** call to `GET /photos`. Uploading in
`/admin` cannot fix that domain until the file is replaced or DNS points at Railway.

### Option A — Point the domain at Railway (recommended)

1. Railway service → **Settings → Networking → Custom Domain** → add `ketchikanphotos.com` and `www`
2. At your DNS host, set the records Railway shows (usually CNAME or ALIAS to `*.up.railway.app`)
3. Set `SITE_URL=https://ketchikanphotos.com` on Railway

### Option B — Replace SiteGround’s `index.html`

1. Download `index.html` from GitHub `main` (repo root)
2. SiteGround → **Site Tools → File Manager** → `public_html`
3. Replace `index.html` (and ideally `admin/`, `order/` too)
4. Hard-refresh the browser (`Cmd+Shift+R`)

Confirm the live file contains `bootGallery` and `apiBase` — if you still see
`const PHOTOS = [` with empty `src:""`, SiteGround was not updated.

## Why not Nixpacks alone?

Custom `nixpacks.toml` that set `nixPkgs = ["openssl"]` **replaced** Node with only OpenSSL, so `npm` was missing. The Dockerfile avoids that class of failure.
