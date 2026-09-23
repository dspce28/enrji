/** Colour and print artwork for rendering a product (Trial Room, 360° view, virtual store). */
export interface GarmentLook {
  defaultColor: string;               // garment colour when there's no colour option
  colorHex: Record<string, string>;   // garment colour per colour option
  ink: string;                        // print colour for the typeset fallback
  artwork: Record<string, string>;    // print PNG per colour option, '*' for all colours
}

/** Resolve the garment hex and artwork for one colour choice. */
export function resolveLook(look: GarmentLook, color: string | null) {
  return {
    color: (color && look.colorHex[color]) || look.defaultColor,
    artwork: (color && look.artwork[color]) || look.artwork['*'] || null,
  };
}
