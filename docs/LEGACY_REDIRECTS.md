# Legacy backlink URL handling

Preserves inbound links to the old static site (`/{Category}/{Photo}.html` and `/images/ketchikan-photos/*`).

## Critical: `www` DNS

Production canonical host is **`https://ketchikanphotos.com`** (apex).

Many dofollow backlinks use `http://www.ketchikanphotos.com/...`. If `www` does not resolve to the Railway service, those links never reach this middleware.

**Railway:** service → Settings → Networking → Custom Domain → add `www.ketchikanphotos.com`  
**DNS:** CNAME `www` → the target Railway shows (same service as the apex).

Optional env: `CANONICAL_HOST=ketchikanphotos.com`

## Code map

| Piece | Path |
|-------|------|
| Explicit redirect map | `server/src/legacy/legacy-redirects.ts` → `LEGACY_REDIRECTS` |
| Middleware | `server/src/legacy/legacy.middleware.ts` (mounted in `main.ts` **before** static) |
| Resolver + logging | `server/src/legacy/legacy.service.ts` |
| Recovered images | `server/public/legacy-images/` |
| Photo alias column | `Photo.legacySlug` |
| Hit log table | `LegacyRedirectHit` |

## Known backlinks

| Legacy path | Destination |
|-------------|-------------|
| `/index.html` | `/` |
| `/Wildlife/Bald-Eagle-swimming-100_0181.html` | `/photo/bald-eagle-swimming` |
| `/Wildlife/Bald-Eagle-swimming.html` | `/photo/bald-eagle-swimming` |
| `/Intertidal-Life/Sea-Lemon.html` | `/photo/sea-lemon` |
| `/images/ketchikan-photos/Moon-Jelly-DSC3948.jpg` | **200** image bytes (not an HTML redirect) |

## Tests / smoke

```bash
cd server
npm test
BASE_URL=https://ketchikanphotos.com npm run smoke:legacy
```
