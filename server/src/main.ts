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

  const siteIsPlaceholder =
    !process.env.SITE_URL ||
    /localhost|127\.0\.0\.1/i.test(process.env.SITE_URL);
  const allowAny =
    process.env.CORS_ALLOW_ANY === 'true' ||
    (process.env.CORS_ALLOW_ANY !== 'false' && siteIsPlaceholder);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
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

  // Ensure upload directory exists (Railway volume should mount here)
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

  // Explicit /media/:file is also handled by MediaController; keep static as fallback
  app.useStaticAssets(mediaDir, { prefix: '/media/' });

  // Gallery + admin + success page (so the site works on Railway without SiteGround sync)
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
