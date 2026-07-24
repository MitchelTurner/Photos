/**
 * =============================================================================
 * Print catalog — ONLY source of truth for prices and Prodigi SKUs
 * =============================================================================
 *
 * Browser checkout payload: { photoId, sizeKey, qty }  — never a price.
 * CheckoutService looks amount + sku up here so a tampered client cannot change
 * what they're charged. Keep sizeKeys identical to PRINT_OPTIONS in index.html
 * (and server/public/index.html).
 *
 * amount  = US cents
 * sku     = Prodigi product code used after Stripe payment succeeds
 *
 * Verify SKUs with: GET {PRODIGI_API_BASE}/products/{sku}
 *   GLOBAL-FAP-*  enhanced matte fine art paper
 *   GLOBAL-MET-*  ChromaLuxe aluminium metal (often US ship-from / US ship-to)
 *
 * Changing a price here affects NEW checkouts only — OrderItem rows freeze the
 * amount/sku at session-create time.
 * =============================================================================
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
