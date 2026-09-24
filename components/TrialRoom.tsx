'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { drawGarment, loadHeavyFont, GARMENT_COLORS, type GarmentKind } from '@/lib/garment';
import { aiTryOn, type TryOnStatus } from '@/lib/hfTryon';
import { buildMask, padTo34, preloadMaskModels, type TryOnMask } from '@/lib/tryonMask';
import { overlayPrint } from '@/lib/printOverlay';
import { cdn, inr, titleCase } from '@/lib/format';
import { useCart } from './cart';

export interface TryProduct {
  handle: string;
  title: string;
  baseName: string;
  kind: GarmentKind;
  image: string | null;
  colors: string[];
  colorHex: Record<string, string>; // garment colour per colour option
  defaultColor: string;             // garment colour when there's no colour option
  ink: string;                      // print colour for the typeset fallback
  artwork: Record<string, string>;  // print PNG per colour option, '*' for all colours
  garmentPhoto: { src: string; color: string } | null;   // clean garment photo (public/garments)
  variants: { id: number; size: string; color: string | null; available: boolean; price: number; compareAt: number | null; image: string | null }[];
}

export interface SamplePhoto { src: string; label: string }

const MAX_SIDE = 1536;   // working size of the shopper's photo; the final image keeps this resolution
const pad = (n: number) => String(n).padStart(2, '0');

function hexDist(a: string, b: string) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

async function toJpeg(src: CanvasImageSource & { width: number; height: number }, w: number, h: number): Promise<{ blob: Blob; url: string; w: number; h: number }> {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.92));
  return { blob, url: URL.createObjectURL(blob), w: c.width, h: c.height };
}

/** The garment on white, as the try-on model expects: the real garment photo, or a clean render in the chosen colour. */
async function garmentImage(p: TryProduct, color: string | null, hex: string): Promise<Blob> {
  if (p.garmentPhoto && hexDist(p.garmentPhoto.color, hex) < 90) {
    const r = await fetch(p.garmentPhoto.src);
    if (r.ok) return r.blob();
  }
  await loadHeavyFont();
  await document.fonts?.ready;
  let art: HTMLImageElement | null = null;
  const src = (color && p.artwork[color]) || p.artwork['*'];
  if (src) { art = new Image(); art.src = src; try { await art.decode(); } catch { art = null; } }
  const g = drawGarment({ kind: p.kind, color: hex, ink: p.ink, slogan: p.baseName, artwork: art }, { scale: 1.6, shading: true });
  const c = document.createElement('canvas');
  c.width = 768; c.height = 1024;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff'; x.fillRect(0, 0, 768, 1024);
  const s = Math.min(700 / g.width, 940 / g.height);
  x.drawImage(g, (768 - g.width * s) / 2, (1024 - g.height * s) / 2, g.width * s, g.height * s);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.92));
}

const friendly = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  if (/quota|exceeded|ZeroGPU|limit/i.test(m)) return 'You’ve reached the try-on limit for now. Please try again a little later.';
  if (/abort/i.test(m)) return 'That took longer than it should. Please try again in a minute.';
  return 'Our AI stylist is busy right now. Please try again in a minute.';
};

const canvasOf = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const toBlob = (c: HTMLCanvasElement, type = 'image/jpeg', q = 0.92) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), type, q));

/** Photo and mask padded to 3:4 at the try-on model's size (768 × 1024). */
async function prepare(photo: HTMLCanvasElement, mask: TryOnMask) {
  const W = photo.width, H = photo.height, { tw, th, ox, oy } = padTo34(W, H), s = 768 / tw;
  const person = canvasOf(768, 1024), pg = person.getContext('2d')!;
  const edge = photo.getContext('2d')!.getImageData(0, 0, W, 1).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < edge.length; i += 4) { r += edge[i]; g += edge[i + 1]; b += edge[i + 2]; }
  pg.fillStyle = `rgb(${(r / W) | 0},${(g / W) | 0},${(b / W) | 0})`; pg.fillRect(0, 0, 768, 1024);
  pg.drawImage(photo, ox * s, oy * s, W * s, H * s);
  const mfull = canvasOf(W, H), mg = mfull.getContext('2d')!, id = mg.createImageData(W, H);
  for (let i = 0; i < W * H; i++) { const v = mask.data[i] > 0.5 ? 255 : 0; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
  mg.putImageData(id, 0, 0);
  const m = canvasOf(768, 1024), mc = m.getContext('2d')!;
  mc.fillStyle = '#000'; mc.fillRect(0, 0, 768, 1024);
  mc.imageSmoothingEnabled = false;
  mc.drawImage(mfull, ox * s, oy * s, W * s, H * s);
  return { person: await toBlob(person), mask: await toBlob(m, 'image/png'), crop: { x: ox * s, y: oy * (1024 / th), w: W * s, h: H * (1024 / th) } };
}

/** Put the generated garment into the original photo, only inside the (feathered) mask. */
async function composite(photo: HTMLCanvasElement, mask: TryOnMask, out: Blob, crop: { x: number; y: number; w: number; h: number }) {
  const W = photo.width, H = photo.height;
  const bmp = await createImageBitmap(out);
  const sx = bmp.width / 768, sy = bmp.height / 1024;
  const rc = canvasOf(W, H), rg = rc.getContext('2d')!;
  rg.drawImage(bmp, crop.x * sx, crop.y * sy, crop.w * sx, crop.h * sy, 0, 0, W, H);
  // Feather the mask edge a little so the new fabric meets the original photo softly.
  const a = mask.data, f = new Float32Array(a.length), r = Math.max(1, Math.round(W * 0.003));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let acc = 0, n = 0;
    for (let d = -r; d <= r; d += Math.max(1, r >> 1)) { const xx = Math.min(W - 1, Math.max(0, x + d)); acc += a[y * W + xx]; n++; }
    f[y * W + x] = acc / n;
  }
  const g = new Float32Array(a.length);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    let acc = 0, n = 0;
    for (let d = -r; d <= r; d += Math.max(1, r >> 1)) { const yy = Math.min(H - 1, Math.max(0, y + d)); acc += f[yy * W + x]; n++; }
    g[y * W + x] = acc / n;
  }
  const O = photo.getContext('2d')!.getImageData(0, 0, W, H), R = rg.getImageData(0, 0, W, H);
  for (let i = 0; i < W * H; i++) {
    const t = g[i];
    if (t <= 0) continue;
    for (let c = 0; c < 3; c++) O.data[i * 4 + c] = O.data[i * 4 + c] * (1 - t) + R.data[i * 4 + c] * t;
  }
  const fc = canvasOf(W, H);
  fc.getContext('2d', { willReadFrequently: true })!.putImageData(O, 0, 0);
  return fc;
}

/** The product's print artwork for this colour, if there is one. */
async function artworkOf(p: TryProduct, color: string | null) {
  const src = (color && p.artwork[color]) || p.artwork['*'];
  if (!src) return null;
  const a = new Image();
  a.src = src;
  try { await a.decode(); return a; } catch { return null; }
}

/**
 * Trial Room: upload a photo, choose a piece, and an AI model re-draws the same photo with the person wearing it.
 * Uses the free IDM-VTON demo on Hugging Face (see lib/hfTryon.ts); the photo goes there to be processed.
 */
export function TrialRoom({ products, samples, initial }: { products: TryProduct[]; samples: SamplePhoto[]; initial?: string }) {
  const { add, setOpen, toast } = useCart();
  const [product, setProduct] = useState<TryProduct>(() => products.find((p) => p.handle === initial) ?? products[0]);
  const [color, setColor] = useState<string | null>(product.colors[0] ?? null);
  const [photo, setPhoto] = useState<{ id: string; blob: Blob; url: string; w: number; h: number } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState<TryOnStatus | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [split, setSplit] = useState(50);
  const [size, setSize] = useState<string | null>(null);
  const cache = useRef(new Map<string, string>());
  const abort = useRef<AbortController | null>(null);
  const cmp = useRef<HTMLDivElement>(null);

  const hex = (color && product.colorHex[color]) || (color ? GARMENT_COLORS[color.toLowerCase()] : null) || product.defaultColor;
  const key = photo ? `${photo.id}|${product.handle}|${color}` : '';

  useEffect(() => { setResult(cache.current.get(key) ?? null); setError(null); setSplit(50); }, [key]);
  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, [!!busy]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => abort.current?.abort(), []);

  async function takePhoto(src: Blob | string, id: string) {
    try {
      const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      const j = await toJpeg(bmp, bmp.width, bmp.height);
      setPhoto({ id, ...j });
      preloadMaskModels().catch(() => {});   // ready by the time they press Create
    } catch { toast('Could not read that photo'); }
  }

  async function fromFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Please choose a photo');
    if (file.size > 25e6) return toast('That photo is too large (max 25 MB)');
    await takePhoto(file, `${file.name}-${file.size}-${file.lastModified}`);
  }

  async function generate() {
    if (!photo || busy) return;
    if (!agree) return toast('Please tick the box to send your photo for processing');
    setError(null); setElapsed(0);
    setBusy({ stage: 'uploading' });
    abort.current = new AbortController();
    const timer = setTimeout(() => abort.current?.abort(), 240_000);
    try {
      const garment = await garmentImage(product, color, hex);
      const what = `${color ?? ''} ${product.kind === 'tee' ? 'short sleeve crew neck t-shirt' : 'long sleeve crew neck sweatshirt, sleeves down to the wrists'} with "${titleCase(product.baseName)}" print`.trim();
      // Work out where the garment may be drawn (never over the face or hands), on this device.
      const bmp = await createImageBitmap(photo.blob);
      const cv = canvasOf(bmp.width, bmp.height);
      cv.getContext('2d', { willReadFrequently: true })!.drawImage(bmp, 0, 0);
      const mask = await buildMask(cv, product.kind).catch(() => null);
      const prep = mask ? await prepare(cv, mask) : null;
      const signal = abort.current.signal;
      const attempt = () => aiTryOn(prep?.person ?? photo.blob, garment, what, prep?.mask ?? null, setBusy, signal);
      let out: Blob;
      try { out = await attempt(); } catch (e) { if (signal.aborted) throw e; out = await attempt(); }   // one retry for a hiccup
      if (mask && prep) {
        const dressed = await composite(cv, mask, out, prep.crop);
        // Swap the model's approximate lettering for the real artwork (skipped when it can't be done cleanly).
        const art = await artworkOf(product, color);
        if (art) { try { overlayPrint(dressed, mask, art); } catch { /* keep the model's print */ } }
        out = await toBlob(dressed, 'image/jpeg', 0.93);
      }
      const url = URL.createObjectURL(out);
      cache.current.set(key, url);
      setResult(url);
    } catch (e) {
      setError(friendly(e));
    } finally {
      clearTimeout(timer);
      setBusy(null);
    }
  }

  function download() {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result;
    a.download = `enrji-${product.handle}-trial.png`;
    a.click();
  }

  function choose(p: TryProduct) {
    setProduct(p);
    setColor(p.colors.includes(color ?? '') ? color : p.colors[0] ?? null);
    setSize(null);
  }

  const dragSplit = (e: React.PointerEvent) => {
    const r = cmp.current!.getBoundingClientRect();
    setSplit(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)));
  };

  const variants = product.variants.filter((v) => !color || v.color === color);
  const variant = variants.find((v) => v.size === size) ?? null;
  const addToBag = () => {
    if (!variant) return toast('Pick your size');
    add({ variantId: variant.id, quantity: 1, handle: product.handle, title: titleCase(product.title), size: variant.size, color: variant.color, price: variant.price, compareAt: variant.compareAt, image: variant.image ?? product.image });
    setOpen(true);
  };
  const stageText = busy?.stage === 'uploading' ? 'Sending your photo' : busy?.stage === 'queued' ? 'Waiting for the AI studio' : busy?.stage === 'downloading' ? 'Almost there' : 'Dressing you';

  return (
    <div className="ai-tryon">
      <div className="ai-stage-wrap">
        <p className="eyebrow">Step 1 · Your photo</p>
        {/* The frame takes the photo's own shape and fits the screen both ways, so nothing is ever cropped. */}
        <div className={`ai-stage${busy ? ' busy' : ''}`}
          style={photo ? { aspectRatio: `${photo.w} / ${photo.h}`, width: `min(100%, 640px, calc(76svh * ${(photo.w / photo.h).toFixed(4)}))` } : undefined}>
          {!photo && (
            <label className="ai-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); fromFile(e.dataTransfer.files[0]); }}>
              <input type="file" accept="image/*" hidden onChange={(e) => { fromFile(e.target.files?.[0]); e.target.value = ''; }} />
              <span className="ai-drop-icon" aria-hidden />
              <span className="display h3">Upload your photo</span>
              <span className="muted">Facing the camera, from the knees up, arms relaxed, in good light.</span>
              <span className="btn btn-gold" style={{ marginTop: 18 }}>Choose a photo</span>
            </label>
          )}
          {photo && !result && <img className="ai-photo" src={photo.url} alt="Your photo" />}
          {photo && result && (
            <div ref={cmp} className="ai-compare" style={{ ['--split' as string]: `${split}%` }}
              onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); dragSplit(e); }}
              onPointerMove={(e) => { if (e.buttons) dragSplit(e); }}>
              <img src={result} alt={`You wearing ${titleCase(product.baseName)}`} draggable={false} />
              <img className="ai-before" src={photo.url} alt="Your original photo" draggable={false} />
              <span className="ai-handle" aria-hidden><i /></span>
              <span className="ai-tag ai-tag-l">Before</span><span className="ai-tag ai-tag-r">After</span>
            </div>
          )}
          {busy && (
            <div className="ai-busy" role="status">
              <span className="ai-scan" aria-hidden />
              <p className="ai-busy-title">{stageText}</p>
              <p className="ai-busy-time">{pad(Math.floor(elapsed / 60))}:{pad(elapsed % 60)}</p>
              <button className="btn btn-light btn-sm" onClick={() => abort.current?.abort()}>Cancel</button>
            </div>
          )}
        </div>
        {error && <p className="ai-error" role="alert">{error}</p>}
        <div className="ai-actions">
          {photo && <label className="link-arrow" style={{ cursor: 'pointer' }}>Change photo<input type="file" accept="image/*" hidden onChange={(e) => { fromFile(e.target.files?.[0]); e.target.value = ''; }} /></label>}
          {result && <button className="link-arrow" onClick={download} style={{ background: 'none', border: 0, cursor: 'pointer' }}>Save image</button>}
        </div>
        {samples.length > 0 && (
          <div className="ai-samples">
            <span className="eyebrow">Or try it on a model</span>
            <div>{samples.map((s, i) => (
              <button key={s.src} onClick={() => takePhoto(s.src, `sample-${i}`)} aria-label={`Use sample photo: ${s.label}`}>
                <img src={s.src} alt="" loading="lazy" />
              </button>
            ))}</div>
          </div>
        )}
      </div>

      <aside className="ai-panel">
        <div>
          <p className="eyebrow">Step 2 · Choose a piece</p>
          <div className="picker" style={{ marginTop: 14 }}>
            {products.map((p) => (
              <button key={p.handle} aria-pressed={p.handle === product.handle} onClick={() => choose(p)} title={titleCase(p.title)}>
                {p.image && <img src={cdn(p.image, 200)} alt={titleCase(p.title)} loading="lazy" />}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="ai-name">{titleCase(product.baseName)}</p>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 14 }}>{product.kind === 'tee' ? 'Half-sleeve tee' : 'Sweatshirt'} · {inr(variants[0]?.price ?? 0)}</p>
        </div>
        {product.colors.length > 1 && (
          <div>
            <div className="opt-label">Colour <span>{color}</span></div>
            <div className="swatches">{product.colors.map((c) => <button key={c} className="swatch" aria-pressed={c === color} aria-label={c} style={{ background: product.colorHex[c] ?? GARMENT_COLORS[c.toLowerCase()] ?? '#444' }} onClick={() => setColor(c)} />)}</div>
          </div>
        )}
        <div className="ai-go">
          <p className="eyebrow">Step 3 · See it on you</p>
          <label className="ai-consent">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>Send my photo to our AI partner to create this image. ENRJI doesn’t store it.</span>
          </label>
          <button className="btn btn-gold btn-block" disabled={!photo || !!busy} onClick={generate}>
            {busy ? 'Creating your look…' : result ? 'Create again' : photo ? 'Create my look' : 'Upload a photo first'}
          </button>
        </div>
        <div>
          <div className="opt-label">Your size <Link href="/size-guide" style={{ textDecoration: 'underline' }}>Guide</Link></div>
          <div className="sizes">
            {variants.map((v) => (
              <button key={v.id} className="size" aria-pressed={v.size === size} aria-disabled={!v.available} onClick={() => (v.available ? setSize(v.size) : toast(`${v.size} is sold out`))}>{v.size}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <button className="btn btn-ghost btn-block" onClick={addToBag} disabled={!variants.some((v) => v.available)}>{variants.some((v) => v.available) ? 'Add to bag' : 'Sold out'}</button>
          <Link href={`/products/${product.handle}`} className="link-arrow" style={{ justifySelf: 'center' }}>View product</Link>
        </div>
        <p className="fine" style={{ textAlign: 'left' }}>Your look is created by AI as a preview. Fit and printed lettering can differ slightly from the real piece; the product photos show the exact artwork.</p>
      </aside>
    </div>
  );
}
