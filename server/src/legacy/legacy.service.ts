import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import {
  LEGACY_CATEGORIES,
  LEGACY_PHOTO_PAGES,
  LEGACY_REDIRECTS,
  normalizeLegacyPath,
  slugFromLegacyFilename,
} from './legacy-redirects';

export type LegacyResolveResult =
  | { kind: 'redirect'; location: string; matched: string }
  | { kind: 'image'; absolutePath: string; contentType: string; matched: string }
  | { kind: 'legacy-page'; slug: string; matched: string }
  | { kind: 'not-found'; matched: string }
  | { kind: 'pass' };

@Injectable()
export class LegacyService {
  private readonly log = new Logger(LegacyService.name);
  private readonly imageDir: string | null;
  private readonly imageIndex: Map<string, string>;

  constructor(private readonly prisma: PrismaService) {
    this.imageDir = this.resolveImageDir();
    this.imageIndex = this.buildImageIndex();
  }

  private resolveImageDir(): string | null {
    const candidates = [
      join(process.cwd(), 'public', 'legacy-images'),
      join(__dirname, '..', '..', 'public', 'legacy-images'),
    ];
    return candidates.find((p) => existsSync(p)) || null;
  }

  private buildImageIndex(): Map<string, string> {
    const map = new Map<string, string>();
    if (!this.imageDir) return map;
    for (const name of readdirSync(this.imageDir)) {
      if (name.startsWith('.')) continue;
      map.set(name.toLowerCase(), join(this.imageDir, name));
    }
    return map;
  }

  async resolve(
    rawPath: string,
    queryString: string,
  ): Promise<LegacyResolveResult> {
    const path = normalizeLegacyPath(rawPath);
    const qs = queryString
      ? queryString.startsWith('?')
        ? queryString
        : `?${queryString}`
      : '';

    // Part 3 — image hotlinks
    const imageMatch = path.match(/^\/images\/ketchikan-photos\/(.+)$/i);
    if (imageMatch) {
      const fileKey = imageMatch[1].toLowerCase();
      const abs = this.imageIndex.get(fileKey);
      if (abs) {
        return {
          kind: 'image',
          absolutePath: abs,
          contentType: contentTypeFor(fileKey),
          matched: 'legacy-image-file',
        };
      }
      return { kind: 'not-found', matched: 'legacy-image-missing' };
    }

    // Part 2 — explicit map
    const mapped = LEGACY_REDIRECTS[path];
    if (mapped) {
      return {
        kind: 'redirect',
        location: withQuery(mapped, qs),
        matched: 'explicit-map',
      };
    }

    // /photo/:id → current gallery deep link
    const numericPhoto = path.match(/^\/photo\/(\d+)$/);
    if (numericPhoto) {
      return {
        kind: 'redirect',
        location: withQuery(`/?photo=${numericPhoto[1]}`, qs),
        matched: 'photo-id',
      };
    }

    // Recovered detail pages (direct hit, no redirect)
    const photoPage = path.match(/^\/photo\/([a-z0-9-]+)$/);
    if (photoPage && LEGACY_PHOTO_PAGES[photoPage[1]]) {
      return {
        kind: 'legacy-page',
        slug: photoPage[1],
        matched: 'legacy-photo-page',
      };
    }
    if (photoPage) {
      // Unknown slug under /photo/ — honest 404, not homepage
      return { kind: 'not-found', matched: 'photo-slug-unknown' };
    }

    // Part 4 — /{Category}/{Photo-Name}.html
    const legacyHtml = path.match(/^\/([^/]+)\/([^/]+)\.html$/);
    if (legacyHtml) {
      const categorySeg = legacyHtml[1];
      const fileSlug = slugFromLegacyFilename(legacyHtml[2]);

      const byLegacySlug = await this.prisma.photo.findFirst({
        where: {
          published: true,
          legacySlug: fileSlug,
          blob: { isNot: null },
        },
        select: { id: true },
      });
      if (byLegacySlug) {
        return {
          kind: 'redirect',
          location: withQuery(`/?photo=${byLegacySlug.id}`, qs),
          matched: 'db-legacy-slug',
        };
      }

      const candidates = await this.prisma.photo.findMany({
        where: { published: true, blob: { isNot: null } },
        select: { id: true, title: true },
      });
      const titleHit = candidates.find(
        (p) => slugifyTitle(p.title) === fileSlug,
      );
      if (titleHit) {
        return {
          kind: 'redirect',
          location: withQuery(`/?photo=${titleHit.id}`, qs),
          matched: 'db-title-slug',
        };
      }

      if (LEGACY_PHOTO_PAGES[fileSlug]) {
        return {
          kind: 'redirect',
          location: withQuery(`/photo/${fileSlug}`, qs),
          matched: 'legacy-photo-slug',
        };
      }

      // Prefix match for "bald-eagle-swimming-100_0181" → bald-eagle-swimming page
      const pageSlug = Object.keys(LEGACY_PHOTO_PAGES).find(
        (s) => fileSlug === s || fileSlug.startsWith(`${s}-`),
      );
      if (pageSlug) {
        return {
          kind: 'redirect',
          location: withQuery(`/photo/${pageSlug}`, qs),
          matched: 'legacy-photo-prefix',
        };
      }

      // Category fallback only for index / category landing aliases — not random
      // missing filenames (those must be honest 404s, never soft-404 to `/`).
      const catDest = LEGACY_CATEGORIES[categorySeg];
      if (
        catDest &&
        (fileSlug === 'index' ||
          fileSlug === categorySeg ||
          fileSlug.endsWith('-index'))
      ) {
        return {
          kind: 'redirect',
          location: withQuery(catDest, qs),
          matched: 'legacy-category',
        };
      }

      return { kind: 'not-found', matched: 'legacy-html-unmapped' };
    }

    // Bare /Something.html at root (e.g. leftover index variants already mapped)
    if (/^\/[^/]+\.html$/.test(path) && path !== '/index.html') {
      return { kind: 'not-found', matched: 'legacy-root-html' };
    }

    return { kind: 'pass' };
  }

  async logHit(input: {
    path: string;
    referrer: string;
    matched: string;
    resolvedTo: string;
    statusCode: number;
  }): Promise<void> {
    this.log.log(
      JSON.stringify({
        type: 'legacy_redirect',
        path: input.path,
        referrer: input.referrer || null,
        matched: input.matched,
        resolvedTo: input.resolvedTo,
        statusCode: input.statusCode,
      }),
    );
    try {
      await this.prisma.legacyRedirectHit.create({
        data: {
          path: input.path.slice(0, 500),
          referrer: (input.referrer || '').slice(0, 500),
          matched: input.matched.slice(0, 80),
          resolvedTo: input.resolvedTo.slice(0, 500),
          statusCode: input.statusCode,
        },
      });
    } catch (err) {
      this.log.warn(
        `legacy hit persist failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

function withQuery(location: string, qs: string): string {
  if (!qs) return location;
  if (location.includes('?')) {
    return `${location}&${qs.replace(/^\?/, '')}`;
  }
  return `${location}${qs}`;
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function contentTypeFor(filename: string): string {
  if (filename.endsWith('.png')) return 'image/png';
  if (filename.endsWith('.gif')) return 'image/gif';
  if (filename.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}
