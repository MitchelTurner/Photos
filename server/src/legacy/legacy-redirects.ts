/**
 * Explicit legacy backlink redirect map (Part 2).
 *
 * Keys are lowercased paths without trailing slash.
 * Values are path+optional query on the canonical host (one hop to a 200).
 *
 * Image hotlinks under /images/ketchikan-photos/* are NOT listed here —
 * they are served as image bytes (see legacy-images middleware).
 */
export const LEGACY_REDIRECTS: Readonly<Record<string, string>> = {
  '/index.html': '/',

  // Bald eagle swimming — recovered archive frame at /photo/bald-eagle-swimming
  '/wildlife/bald-eagle-swimming-100_0181.html': '/photo/bald-eagle-swimming',
  '/wildlife/bald-eagle-swimming.html': '/photo/bald-eagle-swimming',

  // Sea lemon / nudibranch — recovered archive frame
  '/intertidal-life/sea-lemon.html': '/photo/sea-lemon',
};

/** Legacy category segment → gallery filter (or a dedicated photo page). */
export const LEGACY_CATEGORIES: Readonly<Record<string, string>> = {
  wildlife: '/?cat=Wildlife',
  'intertidal-life': '/photo/sea-lemon',
  'harbor-fleet': '/?cat=Harbor%20%26%20Fleet',
  harbor: '/?cat=Harbor%20%26%20Fleet',
  'creek-street': '/?cat=Creek%20Street',
  'misty-fjords': '/?cat=Misty%20Fjords',
  mountains: '/?cat=Mountains',
  aurora: '/?cat=Aurora',
  'weather-light': '/?cat=Weather%20%26%20Light',
  planes: '/?cat=Planes',
};

/** Recovered legacy detail pages (slug → content). Served as 200 HTML. */
export type LegacyPhotoPage = {
  slug: string;
  title: string;
  category: string;
  description: string;
  /** Path under /images/ketchikan-photos/ (legacy URL space) */
  imagePath: string;
  keywords: string;
};

export const LEGACY_PHOTO_PAGES: Readonly<Record<string, LegacyPhotoPage>> = {
  'bald-eagle-swimming': {
    slug: 'bald-eagle-swimming',
    title: 'Bald Eagle Swimming',
    category: 'Wildlife',
    description:
      'A bald eagle swimming in Southeast Alaska waters near Ketchikan — a classic frame from the original Ketchikan Photos wildlife gallery.',
    imagePath: '/images/ketchikan-photos/Bald-Eagle-Swimming-100_0181.jpg',
    keywords: 'bald eagle, swimming, wildlife, ketchikan, alaska',
  },
  'sea-lemon': {
    slug: 'sea-lemon',
    title: 'Sea Lemon',
    category: 'Intertidal Life',
    description:
      'Sea Lemon is a nudibranch, or sea slug. The Sea Lemon has a fruity smell, which is thought to repel predators. Photographed in the intertidal zone near Ketchikan, Alaska.',
    imagePath: '/images/ketchikan-photos/Sea-Lemon.jpg',
    keywords: 'sea lemon, nudibranch, intertidal life, sea slug, ketchikan, alaska',
  },
};

export function normalizeLegacyPath(rawPath: string): string {
  let p = rawPath.split('?')[0] || '/';
  try {
    p = decodeURIComponent(p);
  } catch {
    /* keep raw */
  }
  p = p.replace(/\/+$/, '') || '/';
  return p.toLowerCase();
}

export function slugFromLegacyFilename(name: string): string {
  return name
    .replace(/\.html$/i, '')
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
