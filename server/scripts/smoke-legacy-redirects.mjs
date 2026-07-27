#!/usr/bin/env node
/**
 * Post-deploy smoke check for legacy backlink URLs.
 * Fails on 404, wrong content-type for images, or redirect chains > 1 hop.
 *
 * Usage:
 *   node scripts/smoke-legacy-redirects.mjs
 *   BASE_URL=https://ketchikanphotos.com node scripts/smoke-legacy-redirects.mjs
 */
const BASE = (process.env.BASE_URL || 'https://ketchikanphotos.com').replace(
  /\/$/,
  '',
);

const CASES = [
  { path: '/index.html', expect: { status: 301, locationEnds: '/' } },
  { path: '/INDEX.HTML', expect: { status: 301, locationEnds: '/' } },
  {
    path: '/Wildlife/Bald-Eagle-swimming-100_0181.html',
    expect: { status: 301, locationIncludes: '/photo/bald-eagle-swimming' },
  },
  {
    path: '/Wildlife/Bald-Eagle-swimming.html',
    expect: { status: 301, locationIncludes: '/photo/bald-eagle-swimming' },
  },
  {
    path: '/Intertidal-Life/Sea-Lemon.html',
    expect: { status: 301, locationIncludes: '/photo/sea-lemon' },
  },
  {
    path: '/images/ketchikan-photos/Moon-Jelly-DSC3948.jpg',
    expect: { status: 200, contentTypePrefix: 'image/' },
  },
  {
    path: '/Wildlife/Does-Not-Exist.html',
    expect: { status: 404, notLocation: '/' },
  },
  {
    path: '/index.html?utm_source=test',
    expect: { status: 301, locationIncludes: 'utm_source=test' },
  },
];

async function followOnce(url) {
  const res = await fetch(url, { redirect: 'manual' });
  const location = res.headers.get('location') || '';
  const contentType = res.headers.get('content-type') || '';
  return { status: res.status, location, contentType, url };
}

function resolveLocation(fromUrl, location) {
  return new URL(location, fromUrl).toString();
}

async function assertFinalOk(url, hops = 0) {
  if (hops > 1) throw new Error(`redirect chain longer than 1 hop at ${url}`);
  const hit = await followOnce(url);
  if (hit.status >= 300 && hit.status < 400) {
    if (!hit.location) throw new Error(`redirect without Location: ${url}`);
    const next = resolveLocation(url, hit.location);
    const second = await followOnce(next);
    if (second.status >= 300 && second.status < 400) {
      throw new Error(`multi-hop redirect: ${url} → ${next} → ${second.location}`);
    }
    if (second.status !== 200) {
      throw new Error(`after 1 hop expected 200, got ${second.status} for ${next}`);
    }
    return { ...hit, finalStatus: second.status, finalType: second.contentType };
  }
  return { ...hit, finalStatus: hit.status, finalType: hit.contentType };
}

let failed = 0;
for (const c of CASES) {
  const url = BASE + c.path;
  try {
    const hit = await followOnce(url);
    const exp = c.expect;
    if (exp.status && hit.status !== exp.status) {
      throw new Error(`status ${hit.status}, expected ${exp.status}`);
    }
    if (exp.locationEnds) {
      const loc = resolveLocation(url, hit.location);
      const path = new URL(loc).pathname + new URL(loc).search;
      if (!(path === exp.locationEnds || path.endsWith(exp.locationEnds))) {
        throw new Error(`Location ${hit.location} does not end with ${exp.locationEnds}`);
      }
    }
    if (exp.locationIncludes && !hit.location.includes(exp.locationIncludes)) {
      throw new Error(`Location ${hit.location} missing ${exp.locationIncludes}`);
    }
    if (exp.notLocation && hit.location) {
      const path = new URL(resolveLocation(url, hit.location)).pathname;
      if (path === exp.notLocation) {
        throw new Error(`soft-404 redirect to ${exp.notLocation}`);
      }
    }
    if (exp.contentTypePrefix) {
      if (!hit.contentType.startsWith(exp.contentTypePrefix)) {
        throw new Error(`content-type ${hit.contentType}`);
      }
    }
    // One-hop + final 200 for redirects
    if (hit.status >= 300 && hit.status < 400) {
      await assertFinalOk(url);
    }
    console.log(`OK  ${c.path} → ${hit.status} ${hit.location || hit.contentType}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${c.path}: ${err.message}`);
  }
}

// Canonical www check (informational if DNS missing)
try {
  const www = await followOnce('http://www.ketchikanphotos.com/');
  console.log(`www http check: ${www.status} ${www.location || ''}`);
  if (www.status === 301) {
    const loc = www.location;
    if (!/^https:\/\/ketchikanphotos\.com\/?(\?.*)?$/.test(loc) && !loc.includes('https://ketchikanphotos.com')) {
      console.error(`FAIL www canonical Location not apex https: ${loc}`);
      failed += 1;
    } else {
      console.log('OK  www → apex https (single hop target)');
    }
  }
} catch (err) {
  console.error(
    `WARN www.ketchikanphotos.com unreachable (${err.cause?.code || err.message}). Add www DNS/CNAME in Railway or all www backlinks stay dead.`,
  );
}

if (failed) {
  console.error(`\n${failed} smoke check(s) failed against ${BASE}`);
  process.exit(1);
}
console.log(`\nAll legacy smoke checks passed against ${BASE}`);
