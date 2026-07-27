import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { LEGACY_PHOTO_PAGES } from './legacy-redirects';
import { LegacyService } from './legacy.service';

const CANONICAL_HOST =
  (process.env.CANONICAL_HOST || 'ketchikanphotos.com').toLowerCase();

/**
 * Runs before Nest controllers / static assets when applied via AppModule.
 *
 * 1) Canonical host + HTTPS in one 301 hop (www + http → https://apex…)
 * 2) Legacy path map / images / pattern fallback / honest 404
 */
@Injectable()
export class LegacyMiddleware implements NestMiddleware {
  constructor(private readonly legacy: LegacyService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    void this.handle(req, res, next);
  }

  private async handle(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    // Only GET/HEAD matter for backlinks and hotlinks
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }

    if (this.maybeCanonicalRedirect(req, res)) {
      return;
    }

    // Skip API + current app routes that are not legacy HTML shapes
    const pathOnly = (req.path || '/').split('?')[0];
    if (shouldSkip(pathOnly)) {
      next();
      return;
    }

    try {
      const result = await this.legacy.resolve(
        pathOnly,
        req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '',
      );

      if (result.kind === 'pass') {
        next();
        return;
      }

      const referrer = String(req.headers.referer || req.headers.referrer || '');

      if (result.kind === 'redirect') {
        await this.legacy.logHit({
          path: pathOnly,
          referrer,
          matched: result.matched,
          resolvedTo: result.location,
          statusCode: 301,
        });
        res.redirect(301, result.location);
        return;
      }

      if (result.kind === 'image') {
        await this.legacy.logHit({
          path: pathOnly,
          referrer,
          matched: result.matched,
          resolvedTo: result.absolutePath,
          statusCode: 200,
        });
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        if (req.method === 'HEAD') {
          res.status(200).end();
          return;
        }
        res.sendFile(result.absolutePath);
        return;
      }

      if (result.kind === 'legacy-page') {
        const page = LEGACY_PHOTO_PAGES[result.slug];
        await this.legacy.logHit({
          path: pathOnly,
          referrer,
          matched: result.matched,
          resolvedTo: `/photo/${result.slug}`,
          statusCode: 200,
        });
        res
          .status(200)
          .type('html')
          .send(renderLegacyPhotoHtml(page, canonicalOrigin(req)));
        return;
      }

      // Honest 404 for unmapped legacy shapes — never soft-404 to homepage
      await this.legacy.logHit({
        path: pathOnly,
        referrer,
        matched: result.matched,
        resolvedTo: '404',
        statusCode: 404,
      });
      res.status(404).type('html').send(renderNotFoundHtml(pathOnly));
    } catch (err) {
      next(err);
    }
  }

  /**
   * Single-hop canonicalization: http://www.host/path?q → https://host/path?q
   * Only for the production domain family; leaves Railway *.up.railway.app alone.
   */
  private maybeCanonicalRedirect(req: Request, res: Response): boolean {
    const hostHeader = String(
      req.headers['x-forwarded-host'] || req.headers.host || '',
    )
      .split(',')[0]
      .trim()
      .toLowerCase();
    const host = hostHeader.split(':')[0];
    const proto = String(
      req.headers['x-forwarded-proto'] || req.protocol || 'http',
    )
      .split(',')[0]
      .trim()
      .toLowerCase();

    const wwwHost = `www.${CANONICAL_HOST}`;
    const isProdFamily = host === CANONICAL_HOST || host === wwwHost;
    if (!isProdFamily) return false;

    const needsHost = host !== CANONICAL_HOST;
    const needsHttps = proto !== 'https';
    if (!needsHost && !needsHttps) return false;

    const target = `https://${CANONICAL_HOST}${req.originalUrl || req.url || '/'}`;
    void this.legacy.logHit({
      path: req.path || '/',
      referrer: String(req.headers.referer || ''),
      matched: 'canonical-host',
      resolvedTo: target,
      statusCode: 301,
    });
    res.redirect(301, target);
    return true;
  }
}

function shouldSkip(path: string): boolean {
  const p = path.toLowerCase();
  if (p === '/' || p === '') return true;
  // Legacy photo detail + image hotlinks + *.html shapes must not be skipped.
  if (p.startsWith('/photo/') || p.startsWith('/images/ketchikan-photos/')) {
    return false;
  }
  if (p.endsWith('.html')) return false;
  const prefixes = [
    '/photos',
    '/media/',
    '/admin',
    '/auth',
    '/checkout',
    '/webhook',
    '/health',
    '/order/',
    '/assets/',
    '/favicon',
    '/legacy-images/',
  ];
  return prefixes.some((pre) => p === pre.replace(/\/$/, '') || p.startsWith(pre));
}

function canonicalOrigin(req: Request): string {
  const proto = String(
    req.headers['x-forwarded-proto'] || req.protocol || 'https',
  )
    .split(',')[0]
    .trim();
  const host = String(
    req.headers['x-forwarded-host'] || req.headers.host || CANONICAL_HOST,
  )
    .split(',')[0]
    .trim();
  return `${proto}://${host}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderLegacyPhotoHtml(
  page: (typeof LEGACY_PHOTO_PAGES)[string],
  origin: string,
): string {
  const url = `${origin}/photo/${page.slug}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(page.title)} — Ketchikan Photos</title>
  <meta name="description" content="${escapeHtml(page.description)}" />
  <meta name="keywords" content="${escapeHtml(page.keywords)}" />
  <link rel="canonical" href="${escapeHtml(url)}" />
  <meta property="og:title" content="${escapeHtml(page.title)}" />
  <meta property="og:description" content="${escapeHtml(page.description)}" />
  <meta property="og:image" content="${escapeHtml(origin + page.imagePath)}" />
  <style>
    :root { --ink:#142428; --sea:#1f4d52; --fog:#f3f6f7; --salmon:#c45c3e; }
    body{margin:0;font-family:Georgia,serif;color:var(--ink);background:linear-gradient(165deg,#f5f8f9,#e4ecee 50%,#f7f2ed);min-height:100vh}
    main{width:min(920px,calc(100% - 2rem));margin:0 auto;padding:2.5rem 0 4rem}
    .brand{font-size:1.1rem;letter-spacing:.04em;text-transform:uppercase;color:var(--salmon);text-decoration:none}
    h1{font-size:clamp(1.8rem,4vw,2.6rem);color:var(--sea);margin:.6rem 0 .4rem}
    .cat{font-family:ui-monospace,monospace;font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;color:#5a7075}
    figure{margin:1.5rem 0;background:#071012;border-radius:4px;overflow:hidden}
    img{display:block;width:100%;height:auto}
    p{line-height:1.55;max-width:62ch;font-size:1.05rem}
    .actions{margin-top:1.75rem;display:flex;flex-wrap:wrap;gap:.75rem}
    a.btn{display:inline-block;background:var(--sea);color:#fff;text-decoration:none;padding:.7rem 1.1rem;border-radius:4px}
    a.btn.secondary{background:transparent;color:var(--sea);border:1px solid var(--sea)}
  </style>
</head>
<body>
  <main>
    <a class="brand" href="/">Ketchikan Photos</a>
    <p class="cat">${escapeHtml(page.category)}</p>
    <h1>${escapeHtml(page.title)}</h1>
    <figure>
      <img src="${escapeHtml(page.imagePath)}" alt="${escapeHtml(page.title)}, Ketchikan Alaska" />
    </figure>
    <p>${escapeHtml(page.description)}</p>
    <div class="actions">
      <a class="btn" href="/?cat=${encodeURIComponent(page.category === 'Intertidal Life' ? 'Wildlife' : page.category)}">Browse gallery</a>
      <a class="btn secondary" href="/">Home</a>
    </div>
  </main>
</body>
</html>`;
}

function renderNotFoundHtml(requested: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Page not found — Ketchikan Photos</title>
  <meta name="robots" content="noindex" />
  <style>
    body{margin:0;font-family:Georgia,serif;color:#142428;background:#f3f6f7;min-height:100vh;display:grid;place-items:center}
    main{width:min(560px,calc(100% - 2rem));padding:2rem 0}
    h1{color:#1f4d52;font-size:1.8rem}
    code{font-size:.85rem;word-break:break-all}
    a{color:#c45c3e}
    input{width:100%;padding:.65rem .75rem;border:1px solid #c5d4d8;border-radius:4px;font:inherit;margin:.5rem 0 1rem}
    button{background:#1f4d52;color:#fff;border:0;padding:.65rem 1rem;border-radius:4px;cursor:pointer;font:inherit}
  </style>
</head>
<body>
  <main>
    <h1>We could not find that photograph</h1>
    <p>The old gallery path <code>${escapeHtml(requested)}</code> is no longer mapped to a live frame.</p>
    <form action="/" method="get" role="search">
      <label for="q">Search the current gallery</label>
      <input id="q" name="q" type="search" placeholder="eagle, harbor, aurora…" />
      <button type="submit">Go to gallery</button>
    </form>
    <p><a href="/">Ketchikan Photos home</a> · <a href="/?cat=Wildlife">Wildlife</a> · <a href="/?cat=Harbor%20%26%20Fleet">Harbor &amp; Fleet</a></p>
  </main>
</body>
</html>`;
}
