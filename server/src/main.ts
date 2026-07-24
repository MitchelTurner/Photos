/**
 * =============================================================================
 * Ketchikan Photos API — bootstrap (main.ts)
 * =============================================================================
 *
 * WHAT THIS PROCESS SERVES
 *   1. NestJS JSON API  — /photos, /checkout, /webhook/stripe, /admin/photos, …
 *   2. Image media      — /media/:filename  (disk cache, else Postgres PhotoBlob)
 *   3. Static site UI   — / , /admin/ , /order/success/  from server/public/
 *
 * WHY THE API ALSO SERVES THE WEBSITE
 *   SiteGround (ketchikanphotos.com) has historically lagged behind GitHub and
 *   served an old index.html that never called GET /photos. Serving the gallery
 *   from Railway (PUBLIC_API_URL) means uploads show up immediately after admin
 *   upload, without waiting on a static-host sync.
 *
 * CRITICAL ENV VARS (Railway)
 *   DATABASE_URL          Postgres (Prisma)
 *   PUBLIC_API_URL        Public origin of THIS service (used in media src URLs)
 *   SITE_URL              Browser origin allowed for CORS / Stripe redirects
 *   UPLOAD_DIR            Disk cache for images (default /data/uploads)
 *   ADMIN_EMAIL / ADMIN_PASSWORD   Admin login (prefer plain password over hash)
 *   STRIPE_* / PRODIGI_*  Payments + print fulfillment
 *   CORS_ALLOW_ANY=true   Temporary: allow any Origin while testing
 *
 * PHOTO PERSISTENCE (read this before debugging an empty gallery)
 *   Uploads write (a) a file under UPLOAD_DIR and (b) bytes into PhotoBlob.
 *   GET /photos only returns rows that HAVE a PhotoBlob. If health.media.withBlob
 *   is 0, the gallery is empty until someone re-uploads in /admin.
 *   Disk alone is NOT durable on Railway without a volume — DB blobs are.
 *
 * STRIPE WEBHOOKS
 *   Nest is created with rawBody: true so POST /webhook/stripe can verify the
 *   Stripe-Signature header. Do not parse that route as JSON beforehand.
 * =============================================================================
 */
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { uploadDir } from './photos/upload.config';

function stripSlash(url: string): string {
  return url.replace(/\/$/, '');
}

/** Locate server/public (gallery + admin HTML) in both nest start and dist layouts. */
function resolvePublicDir(): string | null {
  return [
    join(process.cwd(), 'public'),
    join(__dirname, '..', 'public'),
  ].find((p) => existsSync(join(p, 'index.html'))) || null;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Required so Stripe can verify webhook signatures against the raw body.
    rawBody: true,
  });

  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());

  // ---- CORS -----------------------------------------------------------------
  // Admin UI and gallery may be hosted on a different origin than the API
  // (SiteGround vs Railway). Browsers send Origin on credentialed fetches;
  // we reflect allowlisted origins. Same-host Railway admin needs no CORS.
  const siteUrl = process.env.SITE_URL || 'http://localhost:5500';
  const publicApi = process.env.PUBLIC_API_URL || '';
  const extra = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowlist = new Set(
    [
      siteUrl,
      publicApi,
      ...extra,
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://ketchikanphotos.com',
      'https://www.ketchikanphotos.com',
    ]
      .filter(Boolean)
      .map(stripSlash),
  );

  // If SITE_URL still looks like a local placeholder, open CORS so first-time
  // Railway testing does not get blocked. Set CORS_ALLOW_ANY=false in prod once
  // SITE_URL is the real public site origin.
  const siteIsPlaceholder =
    !process.env.SITE_URL ||
    /localhost|127\.0\.0\.1/i.test(process.env.SITE_URL);
  const allowAny =
    process.env.CORS_ALLOW_ANY === 'true' ||
    (process.env.CORS_ALLOW_ANY !== 'false' && siteIsPlaceholder);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        // curl / server-to-server / same-origin navigation — no Origin header
        callback(null, true);
        return;
      }
      const o = stripSlash(origin);
      if (allowAny || allowlist.has(o)) {
        callback(null, true);
        return;
      }
      try {
        if (publicApi && new URL(o).host === new URL(stripSlash(publicApi)).host) {
          callback(null, true);
          return;
        }
      } catch {
        /* ignore */
      }
      callback(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token'],
    credentials: true,
  });

  // ---- Media disk cache -----------------------------------------------------
  // Optional Railway volume at /data/uploads speeds /media responses and gives
  // Prodigi a warm file path, but PhotoBlob in Postgres is the source of truth.
  const mediaDir = uploadDir();
  mkdirSync(mediaDir, { recursive: true });
  let mediaCount = 0;
  try {
    mediaCount = readdirSync(mediaDir).filter((f) => !f.startsWith('.')).length;
  } catch {
    /* ignore */
  }
  // eslint-disable-next-line no-console
  console.log(`Upload dir ${mediaDir} (${mediaCount} files)`);

  // Static fallback under /media/; MediaController also handles the route and
  // can hydrate missing disk files from PhotoBlob.
  app.useStaticAssets(mediaDir, { prefix: '/media/' });

  // ---- Static marketing / admin UI ------------------------------------------
  const publicDir = resolvePublicDir();
  if (publicDir) {
    app.useStaticAssets(publicDir, { index: 'index.html' });
    // eslint-disable-next-line no-console
    console.log(`Site UI from ${publicDir}`);
  } else {
    // eslint-disable-next-line no-console
    console.warn('public/index.html not found — gallery not served from API');
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Ketchikan Photos API listening on :${port}`);
}

bootstrap();
