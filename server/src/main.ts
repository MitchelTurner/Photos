import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { uploadDir } from './photos/upload.config';

function stripSlash(url: string): string {
  return url.replace(/\/$/, '');
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
    [siteUrl, publicApi, ...extra, 'http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3000', 'http://127.0.0.1:3000']
      .filter(Boolean)
      .map(stripSlash),
  );

  // Reflect allowed Origins so credentialed admin/login works from the static site.
  // Set SITE_URL (and optional CORS_ORIGINS) to your SiteGround origin(s).
  // CORS_ALLOW_ANY=true reflects every Origin (handy while wiring the domain).
  const allowAny = process.env.CORS_ALLOW_ANY === 'true';

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
      // Always allow the API host itself (admin served from /admin on Railway).
      try {
        if (publicApi && new URL(o).host === new URL(stripSlash(publicApi)).host) {
          callback(null, true);
          return;
        }
      } catch {
        /* ignore bad PUBLIC_API_URL */
      }
      callback(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token'],
    credentials: true,
  });

  // Public media for gallery + Prodigi asset download
  app.useStaticAssets(uploadDir(), { prefix: '/media/' });

  // Host /admin on the API (preferred login URL — same origin as /auth/login)
  const adminDir = [
    join(process.cwd(), 'public', 'admin'),
    join(__dirname, '..', 'public', 'admin'),
    join(process.cwd(), 'admin'),
    join(process.cwd(), '..', 'admin'),
  ].find((p) => existsSync(join(p, 'index.html')));
  if (adminDir) {
    app.useStaticAssets(adminDir, { prefix: '/admin/' });
    // eslint-disable-next-line no-console
    console.log(`Admin UI at /admin/ (from ${adminDir})`);
  } else {
    // eslint-disable-next-line no-console
    console.warn('Admin UI not found — expected server/public/admin/index.html');
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
