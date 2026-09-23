/**
 * Trial Room settings per product (by Shopify handle).
 *   color: garment colour when the product has no Colour option (hex). Default: navy.
 *   ink:   print colour used for the typeset preview. Default: off-white.
 * Real print artwork overrides the typeset preview: save it as public/prints/<handle>.png
 * (transparent background, trimmed to the print).
 */
export const TRYON: Record<string, { color?: string; ink?: string }> = {
  believe: { ink: '#d9ab52' },
  'surrender-smile-rise': { ink: '#f4efe6' },
  'selling-is-serving-tee': { ink: '#f4efe6' },
  'selling-is-serving-sweatshirt': { ink: '#f4efe6' },
};
