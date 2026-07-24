import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomBytes } from 'crypto';

export function uploadDir(): string {
  const dir =
    process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

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
