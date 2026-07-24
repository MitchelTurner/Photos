/**
 * Print catalog — the ONLY source of truth for prices and Prodigi SKUs.
 *
 * The browser sends { photoId, title, sizeKey, qty }. It never sends a price.
 * The server looks the price up here, so a tampered client can't change what
 * they're charged. Keep the sizeKeys identical to PRINT_OPTIONS in index.html.
 *
 * amount is in the smallest currency unit (US cents).
 * sku is the Prodigi product code for fulfillment after payment.
 *
 * SKU notes (verify in your Prodigi dashboard / GET /v4.0/products/{sku}):
 * - GLOBAL-FAP-*  = enhanced matte fine art paper
 * - GLOBAL-MET-*  = ChromaLuxe aluminium metal (typically US ship-from / US ship-to)
 */
export const CURRENCY = 'usd';

export const CATALOG = {
  '8x12': {
    label: '8 × 12 in — archival matte',
    amount: 4500,
    sku: 'GLOBAL-FAP-8X12',
  },
  '16x24': {
    label: '16 × 24 in — archival matte',
    amount: 12000,
    sku: 'GLOBAL-FAP-16X24',
  },
  '24x36': {
    label: '24 × 36 in — metal / acrylic',
    amount: 28000,
    sku: 'GLOBAL-MET-24X36',
  },
} as const;

export type SizeKey = keyof typeof CATALOG;
export const isSizeKey = (k: string): k is SizeKey =>
  Object.prototype.hasOwnProperty.call(CATALOG, k);
