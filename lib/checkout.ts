import { STORE_URL } from './config';

export interface Line { variantId: number; quantity: number }

/**
 * Shopify "cart permalink": opens the store's own checkout with these items.
 * No API token is needed; orders, payment and stock all stay in Shopify.
 * https://help.shopify.com/en/manual/products/details/cart-permalink
 */
export function checkoutUrl(lines: Line[]) {
  const items = lines.filter((l) => l.quantity > 0).map((l) => `${l.variantId}:${l.quantity}`).join(',');
  const u = new URL(`${STORE_URL}/cart/${items}`);
  u.searchParams.set('ref', 'enrji-web');
  return u.toString();
}
