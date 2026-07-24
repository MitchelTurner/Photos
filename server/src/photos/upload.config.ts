/**
 * =============================================================================
 * Upload / media URL helpers
 * =============================================================================
 *
 * Multer writes each admin upload to UPLOAD_DIR as:
 *   {timestamp}-{randomHex}.jpg|png|webp
 *
 * That disk path is a CACHE. PhotosService also stores the same bytes in
 * Postgres (PhotoBlob) so Railway redeploys without a volume do not erase the
 * gallery. MediaController serves disk first, then falls back to the blob.
 *
 * PUBLIC_API_URL must be the public HTTPS origin of this API (e.g.
 * https://phot-api.up.railway.app). Gallery JSON embeds absolute media URLs
 * built from that origin — wrong PUBLIC_API_URL = broken <img> tags for
 * cross-origin hosts (SiteGround).
 *
 * Limits: 40 MB per file (print-ready). Allowed types: JPEG, PNG, WebP.
 * =============================================================================
 */
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomBytes } from 'crypto';

/** Local directory for uploaded files (optional Railway volume). */
export function uploadDir(): string {
  const dir =
    process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Public origin used when building absolute /media/... URLs for the gallery. */
export function publicApiUrl(): string {
  return (
    process.env.PUBLIC_API_URL?.replace(/\/$/, '') ||
    `http://localhost:${process.env.PORT || 3000}`
  );
}

export function mediaUrl(filename: string): string {
  return `${publicApiUrl()}/media/${filename}`;
}

const ALLOWED = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export const photoMulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir()),
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase() || '.jpg';
      const safe = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)
        ? ext === '.jpeg'
          ? '.jpg'
          : ext
        : '.jpg';
      // Opaque name — never trust the client's original filename on disk.
      cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${safe}`);
    },
  }),
  limits: { fileSize: 40 * 1024 * 1024 }, // 40 MB — print-ready files are large
  fileFilter: (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (!ALLOWED.has(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, or WebP images are allowed'), false);
      return;
    }
    cb(null, true);
  },
};
