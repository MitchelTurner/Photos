import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  LEGACY_REDIRECTS,
  LEGACY_PHOTO_PAGES,
  normalizeLegacyPath,
  slugFromLegacyFilename,
} from '../src/legacy/legacy-redirects';
import { LegacyService } from '../src/legacy/legacy.service';

function mockPrisma(overrides: {
  bySlug?: { id: number } | null;
  photos?: { id: number; title: string }[];
} = {}) {
  return {
    photo: {
      findFirst: async () => overrides.bySlug ?? null,
      findMany: async () => overrides.photos ?? [],
    },
    legacyRedirectHit: {
      create: async () => ({}),
    },
  } as unknown as ConstructorParameters<typeof LegacyService>[0];
}

describe('normalizeLegacyPath', () => {
  it('lowercases and strips trailing slash', () => {
    assert.equal(
      normalizeLegacyPath('/Wildlife/Bald-Eagle-swimming.html/'),
      '/wildlife/bald-eagle-swimming.html',
    );
  });

  it('handles INDEX.HTML', () => {
    assert.equal(normalizeLegacyPath('/INDEX.HTML'), '/index.html');
  });
});

describe('LEGACY_REDIRECTS map', () => {
  it('maps index.html to root', () => {
    assert.equal(LEGACY_REDIRECTS['/index.html'], '/');
  });

  it('maps both eagle swimming variants to the recovered photo page', () => {
    assert.equal(
      LEGACY_REDIRECTS['/wildlife/bald-eagle-swimming-100_0181.html'],
      '/photo/bald-eagle-swimming',
    );
    assert.equal(
      LEGACY_REDIRECTS['/wildlife/bald-eagle-swimming.html'],
      '/photo/bald-eagle-swimming',
    );
  });

  it('maps sea lemon to recovered photo page', () => {
    assert.equal(
      LEGACY_REDIRECTS['/intertidal-life/sea-lemon.html'],
      '/photo/sea-lemon',
    );
  });

  it('has a content page for every photo destination in the map', () => {
    for (const dest of Object.values(LEGACY_REDIRECTS)) {
      if (!dest.startsWith('/photo/')) continue;
      const slug = dest.slice('/photo/'.length);
      assert.ok(LEGACY_PHOTO_PAGES[slug], `missing LEGACY_PHOTO_PAGES[${slug}]`);
    }
  });
});

describe('LegacyService.resolve', () => {
  const service = new LegacyService(mockPrisma());

  it('redirects /index.html and preserves query string', async () => {
    const out = await service.resolve('/index.html', '?utm_source=test');
    assert.equal(out.kind, 'redirect');
    if (out.kind === 'redirect') {
      assert.equal(out.location, '/?utm_source=test');
      assert.equal(out.matched, 'explicit-map');
    }
  });

  it('is case-insensitive for INDEX.HTML', async () => {
    const out = await service.resolve('/INDEX.HTML', '');
    assert.equal(out.kind, 'redirect');
    if (out.kind === 'redirect') assert.equal(out.location, '/');
  });

  it('redirects bald eagle swimming paths', async () => {
    const a = await service.resolve(
      '/Wildlife/Bald-Eagle-swimming-100_0181.html',
      '',
    );
    const b = await service.resolve('/Wildlife/Bald-Eagle-swimming.html', '');
    assert.equal(a.kind, 'redirect');
    assert.equal(b.kind, 'redirect');
    if (a.kind === 'redirect') assert.equal(a.location, '/photo/bald-eagle-swimming');
    if (b.kind === 'redirect') assert.equal(b.location, '/photo/bald-eagle-swimming');
  });

  it('redirects sea lemon path', async () => {
    const out = await service.resolve('/Intertidal-Life/Sea-Lemon.html', '');
    assert.equal(out.kind, 'redirect');
    if (out.kind === 'redirect') assert.equal(out.location, '/photo/sea-lemon');
  });

  it('serves moon jelly as an image file', async () => {
    const out = await service.resolve(
      '/images/ketchikan-photos/Moon-Jelly-DSC3948.jpg',
      '',
    );
    assert.equal(out.kind, 'image');
    if (out.kind === 'image') {
      assert.ok(existsSync(out.absolutePath));
      assert.match(out.contentType, /^image\//);
      const buf = readFileSync(out.absolutePath);
      assert.ok(buf[0] === 0xff && buf[1] === 0xd8, 'JPEG magic');
    }
  });

  it('404s unmapped wildlife html without redirecting home', async () => {
    const out = await service.resolve('/Wildlife/Does-Not-Exist.html', '');
    assert.equal(out.kind, 'not-found');
  });

  it('uses db legacySlug when present', async () => {
    const svc = new LegacyService(
      mockPrisma({ bySlug: { id: 42 }, photos: [] }),
    );
    // Path not in explicit map
    const out = await svc.resolve('/Wildlife/Custom-Legacy-Frame.html', '');
    assert.equal(out.kind, 'redirect');
    if (out.kind === 'redirect') {
      assert.equal(out.location, '/?photo=42');
      assert.equal(out.matched, 'db-legacy-slug');
    }
  });

  it('slugifies filenames', () => {
    assert.equal(
      slugFromLegacyFilename('Bald-Eagle-swimming-100_0181.html'),
      'bald-eagle-swimming-100-0181',
    );
  });
});

describe('recovered legacy image assets', () => {
  const dir = join(process.cwd(), 'public', 'legacy-images');
  for (const name of [
    'Moon-Jelly-DSC3948.jpg',
    'Bald-Eagle-Swimming-100_0181.jpg',
    'Sea-Lemon.jpg',
  ]) {
    it(`includes ${name}`, () => {
      assert.ok(existsSync(join(dir, name)), join(dir, name));
    });
  }
});
