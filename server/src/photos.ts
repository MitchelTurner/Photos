/**
 * Print-ready asset URLs for each gallery photo.
 *
 * Prodigi downloads these over HTTPS when fulfilling. Prefer 300 DPI files
 * matching the print size (e.g. 16×24" → ~4800×7200px).
 *
 * Resolution order in ProdigiService:
 * 1. Explicit entry in PHOTO_ASSETS
 * 2. `${PRINT_ASSET_BASE_URL}/{photoId}.jpg`
 * 3. PRODIGI_FALLBACK_ASSET_URL (sandbox / demo only)
 */
export const PHOTO_ASSETS: Record<number, string> = {
  // 1: 'https://cdn.ketchikanphotos.com/prints/1.jpg',
};

export function resolvePrintAssetUrl(photoId: number): string | null {
  if (PHOTO_ASSETS[photoId]) return PHOTO_ASSETS[photoId];

  const base = process.env.PRINT_ASSET_BASE_URL?.replace(/\/$/, '');
  if (base) return `${base}/${photoId}.jpg`;

  const fallback = process.env.PRODIGI_FALLBACK_ASSET_URL;
  return fallback || null;
}
