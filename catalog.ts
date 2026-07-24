/**
 * Print catalog — the ONLY source of truth for prices.
 *
 * The browser sends { photoId, title, sizeKey, qty }. It never sends a price.
 * The server looks the price up here, so a tampered client can't change what
 * they're charged. Keep the sizeKeys identical to PRINT_OPTIONS in index.html.
 *
 * amount is in the smallest currency unit (US cents).
 */
export const CURRENCY = 'usd';

export const CATALOG = {
  '8x12':  { label: '8 × 12 in — archival matte',  amount: 4500 },
  '16x24': { label: '16 × 24 in — archival matte', amount: 12000 },
  '24x36': { label: '24 × 36 in — metal / acrylic', amount: 28000 },
} as const;

export type SizeKey = keyof typeof CATALOG;
export const isSizeKey = (k: string): k is SizeKey =>
  Object.prototype.hasOwnProperty.call(CATALOG, k);
