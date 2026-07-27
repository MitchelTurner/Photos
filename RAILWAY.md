# Deploy the API on Railway

## Recommended settings (Dockerfile)

1. **Root Directory:** `server`
2. **Config file:** `/server/railway.toml` (builder = `DOCKERFILE`)
3. Redeploy

The API image is built from `server/Dockerfile` (Node 22 + OpenSSL + Prisma).

The API also serves the gallery UI from `server/public/` (`/`, `/admin/`, `/order/success/`).

---

## Why photos disappeared (and the fix)

Older deploys stored image **files on disk** only. Without a Railway volume, every redeploy wiped `/data/uploads`, so the gallery went empty.

**Current behavior:** each upload also stores image bytes in Postgres (`PhotoBlob`). Media is served from disk cache when present, otherwise from the database — so redeploys no longer erase the gallery.

After upgrading, open `/admin/`, delete any rows marked **file missing** (old uploads with no blob), and **re-upload once**. Those new uploads will stick.

Optional: still mount a volume at `/data/uploads` as a local cache (`UPLOAD_DIR=/data/uploads`).

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
| `STRIPE_SECRET_KEY` | **Secret** key only (`sk_test_…` / `sk_live_…`). A publishable `pk_…` key will break checkout. |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (`whsec_…`) |
| `PRODIGI_API_KEY` | Prodigi key |
| `PRODIGI_API_BASE` | Sandbox or live API base |
| `PRODIGI_SHIPPING_METHOD` | `Standard` |
| `UPLOAD_DIR` | `/data/uploads` |
| `ADMIN_EMAIL` | Admin login |
| `ADMIN_PASSWORD` | Admin password (prefer this over a stale `ADMIN_PASSWORD_HASH`) |
| `ADMIN_SESSION_SECRET` | `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | Claude Vision for photo descriptions + SEO (`/admin` → AI describe) |
| `ANTHROPIC_MODEL` | Optional; default `claude-sonnet-4-5` |

## 3. After deploy

- Gallery: `https://YOUR-SERVICE.up.railway.app/`
- Health: `https://YOUR-SERVICE.up.railway.app/health`
- Admin: `https://YOUR-SERVICE.up.railway.app/admin/`
- Stripe webhook: `https://YOUR-SERVICE.up.railway.app/webhook/stripe`

### Claude photo SEO

With `ANTHROPIC_API_KEY` set, open `/admin/` and use **AI describe** on a photo (or
**AI enrich missing** for the library). Claude looks at the image and fills
title, category, description, alt text, SEO title/description, and keywords.
Those fields show in the lightbox and as ImageObject JSON-LD on the gallery.

## 4. Why photos show on Railway but not ketchikanphotos.com

**Working gallery:** `https://phot-api.up.railway.app/` (serves current `index.html` + `/photos`)

**Broken domain:** `https://ketchikanphotos.com` still serves a **July 2026 SiteGround file**
with hardcoded `const PHOTOS = […]` and empty `src:""`. That page never calls the API, so
admin uploads cannot appear there until you sync or move DNS.

Quick check — View Source on the domain. You want `bootGallery` / `apiBase`. If you see
`const PHOTOS = [` with `src:""`, SiteGround is stale.

### Option A — Point the domain at Railway (recommended)

1. Railway → service → **Settings → Networking → Custom Domain** → `ketchikanphotos.com` + `www`
2. At DNS, add the CNAME/ALIAS Railway shows (replace the SiteGround A record `35.215.126.117`)
3. Set Railway `SITE_URL=https://ketchikanphotos.com`

### Option B — Manual SiteGround upload (fastest if you keep SiteGround hosting)

1. From GitHub `main`, download:
   - `index.html`
   - `admin/` (folder)
   - `order/` (folder)
2. SiteGround → **Site Tools → File Manager** → `public_html`
3. Replace those files (overwrite `index.html`)
4. Hard-refresh (`Cmd+Shift+R` / Ctrl+Shift+R)

The synced `index.html` loads photos from `https://phot-api.up.railway.app/photos`.

### Option C — Auto-deploy SiteGround over FTP (GitHub Actions)

Workflow: `.github/workflows/deploy-siteground.yml`

Add repo secrets:

| Secret | Example |
|--------|---------|
| `SITEGROUND_FTP_SERVER` | `ftp.ketchikanphotos.com` |
| `SITEGROUND_FTP_USERNAME` | from Site Tools → FTP |
| `SITEGROUND_FTP_PASSWORD` | FTP password |
| `SITEGROUND_FTP_SERVER_DIR` | `public_html/` (optional) |

Then **Actions → Deploy static site to SiteGround → Run workflow**, or push changes to
`index.html` / `admin/` / `order/` on `main`.

## Why not Nixpacks alone?

Custom `nixpacks.toml` that set `nixPkgs = ["openssl"]` **replaced** Node with only OpenSSL, so `npm` was missing. The Dockerfile avoids that class of failure.
