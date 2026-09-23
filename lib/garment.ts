/**
 * Draws an ENRJI tee or sweatshirt on a canvas: garment in its colour, shading, and the print.
 * The print is the real artwork when /prints/<handle>.png exists, otherwise the slogan typeset
 * in the brand face. Used by the Trial Room as the overlay.
 *
 * Geometry is in a 400 x 440 box. Shoulder seams sit at (78,58) and (322,58) for both garments,
 * so shoulder auto-fit works the same way for each.
 */

export type GarmentKind = 'tee' | 'sweatshirt';

export const GARMENT_BOX = { w: 400, h: 440, span: 244, shoulderY: 58 };
export const PRINT_BOX = { cx: 200, cy: 190, w: 176, h: 150 };

const TEE = 'M150 38 Q200 82 250 38 L322 58 Q362 74 396 140 L348 174 L312 150 L314 420 Q200 434 86 420 L88 150 L52 174 L4 140 Q38 74 78 58 Z';
const SWEAT = 'M150 38 Q200 80 250 38 L322 58 Q352 66 364 112 L394 390 L352 400 L318 176 L318 402 Q200 414 82 402 L82 176 L48 400 L6 390 L36 112 Q48 66 78 58 Z';

export const GARMENT_COLORS: Record<string, string> = {
  navy: '#1b2240', black: '#141414', blue: '#1d4a63', white: '#ecebe6', grey: '#6e6e70', maroon: '#4a1520',
};

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** Wrap a slogan into at most 3 balanced lines. */
function wrap(text: string) {
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length <= 2) return words.length === 2 && words.join(' ').length > 9 ? words : [words.join(' ')];
  const target = Math.ceil(words.join(' ').length / Math.min(3, Math.ceil(words.length / 2)));
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > target + 2 && lines.length < 2) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  lines.push(cur);
  return lines;
}

export interface GarmentSpec {
  kind: GarmentKind;
  color: string;      // hex
  ink: string;        // print colour when typesetting
  slogan: string;
  artwork?: HTMLImageElement | null;
}

/** Render the garment at `scale` × (400×440) px, transparent background. */
export function drawGarment(spec: GarmentSpec, scale = 2.5, printOnly = false): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const box = printOnly ? { w: PRINT_BOX.w, h: PRINT_BOX.h } : GARMENT_BOX;
  c.width = Math.round(box.w * scale);
  c.height = Math.round(box.h * scale);
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  if (printOnly) g.translate(-(PRINT_BOX.cx - PRINT_BOX.w / 2), -(PRINT_BOX.cy - PRINT_BOX.h / 2));

  const body = new Path2D(spec.kind === 'tee' ? TEE : SWEAT);
  if (!printOnly) {
    g.fillStyle = spec.color;
    g.fill(body);
    g.save();
    g.clip(body);
    // Side shadows and a soft chest highlight give the flat shape some volume.
    const side = g.createLinearGradient(0, 0, 400, 0);
    side.addColorStop(0, 'rgba(0,0,0,.38)'); side.addColorStop(.2, 'rgba(0,0,0,0)'); side.addColorStop(.8, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,.38)');
    g.fillStyle = side; g.fillRect(0, 0, 400, 440);
    const hl = g.createRadialGradient(190, 150, 10, 190, 170, 240);
    hl.addColorStop(0, 'rgba(255,255,255,.10)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl; g.fillRect(0, 0, 400, 440);
    g.strokeStyle = 'rgba(0,0,0,.14)'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(92, 160); g.quadraticCurveTo(124, 270, 106, 400); g.moveTo(308, 160); g.quadraticCurveTo(278, 260, 296, 400); g.stroke();
    if (spec.kind === 'sweatshirt') {
      // Ribbed hem and cuffs.
      g.fillStyle = shade(spec.color, -0.06);
      g.fillRect(70, 382, 260, 34);
      g.save(); g.translate(373, 395); g.rotate(-0.1); g.fillRect(-22, -24, 44, 26); g.restore();
      g.save(); g.translate(27, 395); g.rotate(0.1); g.fillRect(-22, -24, 44, 26); g.restore();
      g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1;
      for (let x = 74; x < 330; x += 5) { g.beginPath(); g.moveTo(x, 384); g.lineTo(x, 414); g.stroke(); }
    }
    g.restore();
    // Collar.
    g.strokeStyle = shade(spec.color, -0.12); g.lineWidth = 9;
    g.beginPath(); g.moveTo(150, 38); g.quadraticCurveTo(200, 82, 250, 38); g.stroke();
  }

  // Print.
  g.save();
  if (spec.artwork) {
    const a = spec.artwork;
    const k = Math.min(PRINT_BOX.w / a.naturalWidth, PRINT_BOX.h / a.naturalHeight);
    const w = a.naturalWidth * k, h = a.naturalHeight * k;
    g.drawImage(a, PRINT_BOX.cx - w / 2, PRINT_BOX.cy - h / 2, w, h);
  } else {
    const lines = wrap(spec.slogan);
    const font = (px: number) => `800 ${px}px Unbounded, "Arial Black", Impact, sans-serif`;
    let size = 46;
    g.font = font(size);
    const widest = () => Math.max(...lines.map((l) => g.measureText(l).width));
    while (widest() > PRINT_BOX.w && size > 12) { size -= 1; g.font = font(size); }
    while (size * 1.08 * lines.length > PRINT_BOX.h && size > 12) { size -= 1; g.font = font(size); }
    g.fillStyle = spec.ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lh = size * 1.08;
    const top = PRINT_BOX.cy - (lh * (lines.length - 1)) / 2 - 8;
    lines.forEach((l, i) => g.fillText(l, PRINT_BOX.cx, top + i * lh));
    // Small brand mark under the slogan.
    g.font = `600 ${Math.max(8, size * 0.24)}px Inter, sans-serif`;
    g.globalAlpha = 0.7;
    g.fillText('E N R J I', PRINT_BOX.cx, top + lines.length * lh + 4);
  }
  g.restore();
  return c;
}
