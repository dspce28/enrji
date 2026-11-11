/**
 * Builds the Trial Room (VirtualFit) pictures from the store's own photography:
 *  - public/fit/model/<handle>.webp   the model cut out (public/store/<handle>.jpg + -mask.png), scaled and
 *                                     placed so every photo of the same person lines up (head top, head size,
 *                                     centre). That is what lets the scan swap outfits without the body jumping.
 *  - public/fit/garment/<handle>.webp the garment from public/garments/<handle>.jpg with its white backdrop
 *                                     made transparent. A piece needs both photos to be listed in data/fit.json.
 * Run: node scripts/fit-assets.mjs   (re-run after changing data/fit.json)
 */
import sharp from 'sharp';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const FIT = JSON.parse(readFileSync(ROOT + 'data/fit.json', 'utf8'));
const OUT_W = 900, OUT_H = 1200;            // 3:4, the model's frame
const HEAD_TOP = 0.055;                     // head top at 5.5% of the frame
// Head size (crown to neck, as a share of the frame) is set per person, so that every one of their photos
// reaches the bottom of the frame: the body runs off the bottom of the screen, as in a fitting-room mirror.

async function rgbaOf(file, mask, w, h) {
  const rgb = await sharp(file).removeAlpha().resize(w, h).raw().toBuffer();
  const out = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) { out[p * 4] = rgb[p * 3]; out[p * 4 + 1] = rgb[p * 3 + 1]; out[p * 4 + 2] = rgb[p * 3 + 2]; out[p * 4 + 3] = mask[p]; }
  return out;
}

/** Crown, neck and head centre from the person mask. */
function headOf(mask, w, h) {
  const width = (y) => { let n = 0; for (let x = 0; x < w; x++) if (mask[y * w + x] > 127) n++; return n; };
  let top = 0; while (top < h && width(top) < w * 0.01) top++;
  // The neck is the narrowest row between the head's widest point and the shoulders.
  let headMax = 0, headY = top;
  for (let y = top; y < Math.min(h, top + h * 0.2); y++) { const n = width(y); if (n > headMax) { headMax = n; headY = y; } }
  let neck = headY, neckW = Infinity;
  for (let y = headY; y < Math.min(h, top + h * 0.3); y++) { const n = width(y); if (n < neckW) { neckW = n; neck = y; } if (n > headMax * 1.6) break; }
  let sx = 0, c = 0;
  for (let y = top; y < neck; y++) for (let x = 0; x < w; x++) if (mask[y * w + x] > 127) { sx += x; c++; }
  return { top, neck, cx: c ? sx / c : w / 2 };
}

async function measure(handle) {
  const src = `${ROOT}public/store/${handle}.jpg`;
  const { width: w, height: h } = await sharp(src).metadata();
  const mask = await sharp(`${ROOT}public/store/${handle}-mask.png`).toColourspace('b-w').resize(w, h).blur(0.6).raw().toBuffer();
  const head = headOf(mask, w, h);
  // Where the photo's bottom edge lands for a head unit of 1 (it scales linearly with the unit).
  const reach = (h - head.top) / Math.max(1, head.neck - head.top);
  return { src, w, h, mask, head, reach };
}

async function model(handle, m, unit) {
  const { src, w, h, mask, head } = m;
  const scale = (unit * OUT_H) / Math.max(1, head.neck - head.top);
  const sw = Math.round(w * scale), sh = Math.round(h * scale);
  const left = Math.round(OUT_W / 2 - head.cx * scale), top = Math.round(HEAD_TOP * OUT_H - head.top * scale);
  const scaled = await sharp(await rgbaOf(src, mask, w, h), { raw: { width: w, height: h, channels: 4 } }).resize(sw, sh).png().toBuffer();
  // Place on the frame (parts outside are cropped).
  const cl = Math.max(0, -left), ct = Math.max(0, -top);
  const cw = Math.min(sw - cl, OUT_W - Math.max(0, left)), ch = Math.min(sh - ct, OUT_H - Math.max(0, top));
  const part = await sharp(scaled).extract({ left: cl, top: ct, width: cw, height: ch }).toBuffer();
  await sharp({ create: { width: OUT_W, height: OUT_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: part, left: Math.max(0, left), top: Math.max(0, top) }])
    .webp({ quality: 82, alphaQuality: 90, effort: 6 }).toFile(`${ROOT}public/fit/model/${handle}.webp`);
  return { scale: +scale.toFixed(3), bottom: +((top + sh) / OUT_H).toFixed(3) };
}

/** Garment on white → transparent: flood the backdrop in from the edges, so white garments keep their body. */
async function garment(handle) {
  const src = `${ROOT}public/garments/${handle}.jpg`;
  if (!existsSync(src)) return false;
  const { width: w, height: h } = await sharp(src).metadata();
  const rgb = await sharp(src).removeAlpha().raw().toBuffer();
  const white = (p) => Math.min(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]) >= 247;
  const bg = new Uint8Array(w * h), stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop();
    if (bg[p] || !white(p)) continue;
    bg[p] = 1;
    const x = p % w, y = (p - x) / w;
    if (x > 0) stack.push(p - 1); if (x < w - 1) stack.push(p + 1); if (y > 0) stack.push(p - w); if (y < h - 1) stack.push(p + w);
  }
  const alpha = Buffer.alloc(w * h);
  for (let p = 0; p < w * h; p++) alpha[p] = bg[p] ? 0 : 255;
  const soft = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } }).blur(0.8).extractChannel(0).raw().toBuffer();
  const rgba = await rgbaOf(src, soft, w, h);
  const png = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  await sharp(png).trim({ threshold: 1 }).resize(640, 640, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 82, alphaQuality: 90, effort: 6 }).toFile(`${ROOT}public/fit/garment/${handle}.webp`);
  return true;
}

const report = {};
for (const [who, set] of Object.entries(FIT.models)) {
  const ms = Object.fromEntries(await Promise.all(set.pieces.map(async (h) => [h, await measure(h)])));
  // The smallest unit at which even the shortest photo reaches 2% past the bottom of the frame.
  const unit = Math.max(...Object.values(ms).map((m) => (1.02 - HEAD_TOP) / m.reach));
  for (const handle of set.pieces) {
    const m = await model(handle, ms[handle], unit);
    if (!(await garment(handle))) throw new Error(`${handle}: no garment photo in public/garments; take it out of data/fit.json`);
    report[handle] = { who, unit: +unit.toFixed(3), ...m };
  }
}
await sharp(`${ROOT}scripts/fit-room-source.webp`).resize(2400).webp({ quality: 80 }).toFile(`${ROOT}public/fit/room.webp`).catch(() => {});
console.table(report);
