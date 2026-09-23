'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { drawGarment, GARMENT_BOX, PRINT_BOX, GARMENT_COLORS, type GarmentKind } from '@/lib/garment';
import { cdn, inr, titleCase } from '@/lib/format';
import { useCart } from './cart';

export interface TryProduct {
  handle: string;
  title: string;
  baseName: string;
  kind: GarmentKind;
  image: string | null;
  colors: string[];
  defaultColor: string;   // hex used when the product has no colour option
  ink: string;
  artwork: string | null; // /prints/<handle>.png when supplied
  variants: { id: number; size: string; color: string | null; available: boolean; price: number; compareAt: number | null; image: string | null }[];
}

// Overlay geometry in overlay units: w/h image size, span = shoulder seam distance, off = shoulder line → centre.
const G_FULL = { w: GARMENT_BOX.w, h: GARMENT_BOX.h, span: GARMENT_BOX.span, off: GARMENT_BOX.h / 2 - GARMENT_BOX.shoulderY };
const G_PRINT = { w: PRINT_BOX.w, h: PRINT_BOX.h, span: GARMENT_BOX.span, off: PRINT_BOX.cy - GARMENT_BOX.shoulderY };
type Geom = typeof G_FULL;
type T = { cx: number; cy: number; w: number; rot: number };
type Pt = { x: number; y: number };
const MAX_SIDE = 1400;

export function TrialRoom({ products, initial }: { products: TryProduct[]; initial?: string }) {
  const { add, setOpen, toast } = useCart();
  const [product, setProduct] = useState<TryProduct>(() => products.find((p) => p.handle === initial) ?? products[0]);
  const [color, setColor] = useState<string | null>(product.colors[0] ?? null);
  const [mode, setMode] = useState<'full' | 'print'>('full');
  const [blend, setBlend] = useState(true);
  const [opacity, setOpacity] = useState(0.96);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [camera, setCamera] = useState(false);
  const [picking, setPicking] = useState<Pt[] | null>(null);
  const [hint, setHint] = useState('');
  const [size, setSize] = useState<string | null>(null);
  const [sliders, setSliders] = useState({ scale: 60, rot: 0 });

  const cvRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const photo = useRef<CanvasImageSource | null>(null);
  const overlay = useRef<HTMLCanvasElement | null>(null);
  const geom = useRef<Geom>(G_FULL);
  const t = useRef<T | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const off = useRef<HTMLCanvasElement | null>(null);
  const pickRef = useRef<Pt[] | null>(null);
  pickRef.current = picking;
  const view = useRef({ blend, opacity });
  view.current = { blend, opacity };

  // ---------- drawing ----------
  const draw = useCallback(() => {
    const cv = cvRef.current;
    if (!cv || !photo.current) return;
    const ctx = cv.getContext('2d')!;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(photo.current, 0, 0, cv.width, cv.height);
    const o = overlay.current, tr = t.current;
    if (o && tr) {
      off.current ??= document.createElement('canvas');
      const oc = off.current;
      if (oc.width !== cv.width || oc.height !== cv.height) { oc.width = cv.width; oc.height = cv.height; }
      const g = oc.getContext('2d')!;
      const place = () => {
        const h = tr.w * (geom.current.h / geom.current.w);
        g.save(); g.translate(tr.cx, tr.cy); g.rotate(tr.rot); g.drawImage(o, -tr.w / 2, -h / 2, tr.w, h); g.restore();
      };
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, oc.width, oc.height);
      place();
      if (view.current.blend) {
        // Fold light and shadow from the photo into the garment, then clip to the garment again.
        g.globalCompositeOperation = 'soft-light';
        g.filter = 'grayscale(1) contrast(1.25)';
        g.drawImage(photo.current, 0, 0, cv.width, cv.height);
        g.filter = 'none';
        g.globalCompositeOperation = 'destination-in';
        place();
      }
      ctx.globalAlpha = view.current.opacity;
      ctx.drawImage(oc, 0, 0);
      ctx.globalAlpha = 1;
    }
    for (const p of pickRef.current ?? []) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(7, cv.width / 110), 0, Math.PI * 2);
      ctx.fillStyle = '#f2d38c'; ctx.shadowColor = '#d9ab52'; ctx.shadowBlur = 18; ctx.fill(); ctx.shadowBlur = 0;
    }
  }, []);

  const syncSliders = useCallback(() => {
    const cv = cvRef.current, tr = t.current;
    if (!cv || !tr) return;
    setSliders({ scale: Math.round((tr.w / cv.width) * 100), rot: Math.round((tr.rot * 180) / Math.PI) });
  }, []);

  /** Swap overlay geometry, keeping the shoulders where the shopper placed them. */
  const reanchor = (from: Geom, to: Geom) => {
    const tr = t.current;
    if (!tr || from === to) return;
    const k = tr.w / from.w;
    const midX = tr.cx + Math.sin(tr.rot) * from.off * k, midY = tr.cy - Math.cos(tr.rot) * from.off * k;
    const k2 = (from.span * k) / to.span;
    t.current = { rot: tr.rot, w: to.w * k2, cx: midX - Math.sin(tr.rot) * to.off * k2, cy: midY + Math.cos(tr.rot) * to.off * k2 };
  };

  // Rebuild the overlay whenever the product, colour or mode changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await document.fonts?.ready;
      let artwork: HTMLImageElement | null = null;
      if (product.artwork) {
        artwork = new Image();
        artwork.src = product.artwork;
        try { await artwork.decode(); } catch { artwork = null; }
      }
      if (cancelled) return;
      const hex = color ? GARMENT_COLORS[color.toLowerCase()] ?? product.defaultColor : product.defaultColor;
      overlay.current = drawGarment({ kind: product.kind, color: hex, ink: product.ink, slogan: product.baseName, artwork }, 2.5, mode === 'print');
      const next = mode === 'print' ? G_PRINT : G_FULL;
      reanchor(geom.current, next);
      geom.current = next;
      syncSliders();
      draw();
    })();
    return () => { cancelled = true; };
  }, [product, color, mode, draw, syncSliders]);

  useEffect(() => { draw(); }, [blend, opacity, picking, draw]);

  // ---------- photo sources ----------
  const setPhoto = useCallback((src: CanvasImageSource, w: number, h: number, shoulders?: [Pt, Pt]) => {
    const cv = cvRef.current!;
    const k = Math.min(1, MAX_SIDE / Math.max(w, h));
    cv.width = Math.round(w * k);
    cv.height = Math.round(h * k);
    photo.current = src;
    const full = geom.current === G_FULL;
    t.current = { cx: cv.width / 2, cy: cv.height * (full ? 0.64 : 0.6), w: cv.width * (full ? 0.62 : 0.3), rot: 0 };
    setHasPhoto(true);
    setPicking(null);
    setHint('Drag to move · pinch or scroll to resize · or use Fit to shoulders');
    if (shoulders) fit(shoulders[0], shoulders[1]); else { syncSliders(); draw(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, syncSliders]);

  function fit(a: Pt, b: Pt) {
    const [l, r] = a.x <= b.x ? [a, b] : [b, a];
    const span = Math.hypot(r.x - l.x, r.y - l.y);
    const rot = Math.atan2(r.y - l.y, r.x - l.x);
    const g = geom.current;
    const unit = span / g.span;
    const mid = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
    t.current = { cx: mid.x - Math.sin(rot) * g.off * unit, cy: mid.y + Math.cos(rot) * g.off * unit, w: g.w * unit, rot };
    syncSliders();
    draw();
  }

  async function fromFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Please choose a photo');
    if (file.size > 25e6) return toast('That photo is too large (max 25 MB)');
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      setPhoto(bmp, bmp.width, bmp.height);
    } catch {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      try { await img.decode(); setPhoto(img, img.naturalWidth, img.naturalHeight); } catch { toast('Could not read that photo'); }
      finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) return toast('Camera is not available in this browser');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
    } catch { return toast('Camera permission was denied'); }
    setCamera(true);
    requestAnimationFrame(async () => {
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream.current;
      await videoRef.current.play().catch(() => {});
    });
  }
  function stopCamera() {
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
    setCamera(false);
  }
  function snap() {
    const v = videoRef.current!;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    const g = c.getContext('2d')!;
    g.translate(c.width, 0); g.scale(-1, 1);
    g.drawImage(v, 0, 0);
    stopCamera();
    setPhoto(c, c.width, c.height);
  }
  useEffect(() => () => stopCamera(), []);

  function mannequin() {
    const c = document.createElement('canvas');
    c.width = 900; c.height = 1100;
    const g = c.getContext('2d')!;
    const bg = g.createRadialGradient(450, 380, 50, 450, 500, 800);
    bg.addColorStop(0, '#2a2319'); bg.addColorStop(1, '#09090a');
    g.fillStyle = bg; g.fillRect(0, 0, 900, 1100);
    const skin = g.createLinearGradient(250, 0, 650, 0);
    skin.addColorStop(0, '#6f604e'); skin.addColorStop(0.5, '#b89f82'); skin.addColorStop(1, '#6f604e');
    g.fillStyle = skin;
    g.beginPath(); g.ellipse(450, 190, 86, 106, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(412, 270, 76, 90);
    g.beginPath();
    g.moveTo(250, 400); g.quadraticCurveTo(450, 330, 650, 400); g.quadraticCurveTo(720, 430, 745, 560); g.lineTo(770, 900); g.lineTo(705, 910); g.lineTo(660, 600);
    g.lineTo(650, 1100); g.lineTo(250, 1100); g.lineTo(240, 600); g.lineTo(195, 910); g.lineTo(130, 900); g.lineTo(155, 560); g.quadraticCurveTo(180, 430, 250, 400);
    g.fill();
    setPhoto(c, 900, 1100, [{ x: 262, y: 400 }, { x: 638, y: 400 }]);
    setHint('Mannequin ready. Pick any design on the right.');
  }

  // ---------- direct manipulation ----------
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<{ pts: Pt[]; t: T } | null>(null);
  const toCanvas = (e: React.PointerEvent | PointerEvent): Pt => {
    const cv = cvRef.current!, r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * cv.width, y: ((e.clientY - r.top) / r.height) * cv.height };
  };
  const startGesture = () => { gesture.current = t.current ? { pts: [...pointers.current.values()].map((p) => ({ ...p })), t: { ...t.current } } : null; };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toCanvas(e);
    if (picking) {
      const pts = [...picking, p];
      if (pts.length === 2) {
        setPicking(null);
        setHint('Fitted. Fine-tune by dragging or with the sliders.');
        fit(pts[0], pts[1]);
      } else {
        setPicking(pts);
        setHint('Now tap your other shoulder.');
      }
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, p);
    startGesture();
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId) || !t.current || !gesture.current) return;
    pointers.current.set(e.pointerId, toCanvas(e));
    const pts = [...pointers.current.values()], g = gesture.current;
    if (pts.length === 1 && g.pts.length === 1) {
      t.current = { ...t.current, cx: g.t.cx + pts[0].x - g.pts[0].x, cy: g.t.cy + pts[0].y - g.pts[0].y };
    } else if (pts.length >= 2 && g.pts.length >= 2) {
      const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const ang = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x);
      const m0 = { x: (g.pts[0].x + g.pts[1].x) / 2, y: (g.pts[0].y + g.pts[1].y) / 2 };
      const m1 = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      t.current = { w: clampW(g.t.w * (d(pts[0], pts[1]) / d(g.pts[0], g.pts[1]))), rot: g.t.rot + ang(pts[0], pts[1]) - ang(g.pts[0], g.pts[1]), cx: g.t.cx + m1.x - m0.x, cy: g.t.cy + m1.y - m0.y };
    }
    draw();
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size) startGesture(); else { gesture.current = null; syncSliders(); }
  };
  const clampW = (w: number) => { const cv = cvRef.current!; return Math.max(cv.width * 0.05, Math.min(cv.width * 2.5, w)); };

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      if (!t.current) return;
      e.preventDefault();
      t.current = { ...t.current, w: clampW(t.current.w * Math.exp(-e.deltaY * 0.0015)) };
      syncSliders(); draw();
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, syncSliders]);

  function download() {
    const cv = cvRef.current!;
    cv.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `enrji-${product.handle}-trial.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }

  function choose(p: TryProduct) {
    setProduct(p);
    setColor(p.colors.includes(color ?? '') ? color : p.colors[0] ?? null);
    setSize(null);
  }

  const variants = product.variants.filter((v) => !color || v.color === color);
  const variant = variants.find((v) => v.size === size) ?? null;
  const addToBag = () => {
    if (!variant) return toast('Pick your size');
    add({ variantId: variant.id, quantity: 1, handle: product.handle, title: titleCase(product.title), size: variant.size, color: variant.color, price: variant.price, compareAt: variant.compareAt, image: variant.image ?? product.image });
    setOpen(true);
  };

  return (
    <div className="tryon">
      <div>
        <div className={`stage${picking ? ' picking' : ''}`}>
          {!hasPhoto && !camera && (
            <div className="drop"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); fromFile(e.dataTransfer.files[0]); }}>
              <div className="drop-ring" aria-hidden><span /></div>
              <h2 className="display h3">Step into the trial room</h2>
              <p className="muted" style={{ maxWidth: 420, margin: '12px auto 24px' }}>A front-facing, waist-up photo in good light works best. Your photo stays on your device. It is never uploaded.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <label className="btn btn-gold">Upload a photo<input type="file" accept="image/*" hidden onChange={(e) => fromFile(e.target.files?.[0])} /></label>
                <button className="btn btn-ghost" onClick={startCamera}>Use camera</button>
                <button className="btn btn-ghost" onClick={mannequin}>Try on mannequin</button>
              </div>
            </div>
          )}
          {camera && <video ref={videoRef} className="cam" playsInline muted />}
          <canvas ref={cvRef} hidden={!hasPhoto || camera} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-label="Your photo with the garment overlaid. Drag to move it." />
          {hasPhoto && !camera && <span className="scanline" aria-hidden />}
        </div>
        {camera && (
          <div className="stage-actions">
            <button className="btn btn-gold btn-sm" onClick={snap}>● Capture</button>
            <button className="btn btn-ghost btn-sm" onClick={stopCamera}>Cancel</button>
          </div>
        )}
        {hasPhoto && !camera && (
          <div className="stage-actions">
            <button className="btn btn-gold btn-sm" onClick={() => { setPicking([]); setHint('Tap the point of one shoulder, where the seam sits.'); }}>⌖ Fit to shoulders</button>
            <button className="btn btn-ghost btn-sm" onClick={download}>Save image</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { photo.current = null; setHasPhoto(false); setPicking(null); }}>New photo</button>
            <span className="muted" style={{ fontSize: 13 }}>{hint}</span>
          </div>
        )}
      </div>

      <aside className="tryon-panel">
        <div>
          <div className="opt-label">Choose a piece <span>{products.length} designs</span></div>
          <div className="picker">
            {products.map((p) => (
              <button key={p.handle} aria-pressed={p.handle === product.handle} onClick={() => choose(p)} title={titleCase(p.title)}>
                {p.image && <img src={cdn(p.image, 200)} alt={titleCase(p.title)} loading="lazy" />}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>{titleCase(product.baseName)}</p>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 14 }}>{product.kind === 'tee' ? 'Half-sleeve tee' : 'Sweatshirt'} · {inr(variants[0]?.price ?? 0)}</p>
          {!product.artwork && <p className="fine" style={{ textAlign: 'left', marginTop: 8 }}>Preview print: the slogan set in our typeface. See product photos for the exact artwork.</p>}
        </div>
        {product.colors.length > 1 && (
          <div>
            <div className="opt-label">Colour <span>{color}</span></div>
            <div className="swatches">{product.colors.map((c) => <button key={c} className="swatch" aria-pressed={c === color} aria-label={c} style={{ background: GARMENT_COLORS[c.toLowerCase()] ?? '#444' }} onClick={() => setColor(c)} />)}</div>
          </div>
        )}
        <div>
          <div className="opt-label">Mode</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="pill" aria-pressed={mode === 'full'} onClick={() => setMode('full')}>Full {product.kind}</button>
            <button className="pill" aria-pressed={mode === 'print'} onClick={() => setMode('print')}>Print on what I&apos;m wearing</button>
          </div>
        </div>
        <div className="sliders">
          <label>Size<input type="range" min={10} max={150} value={Math.min(150, Math.max(10, sliders.scale))} disabled={!hasPhoto}
            onChange={(e) => { const cv = cvRef.current; if (cv && t.current) { t.current = { ...t.current, w: (+e.target.value / 100) * cv.width }; syncSliders(); draw(); } }} /><output>{sliders.scale}%</output></label>
          <label>Rotate<input type="range" min={-45} max={45} value={sliders.rot} disabled={!hasPhoto}
            onChange={(e) => { if (t.current) { t.current = { ...t.current, rot: (+e.target.value * Math.PI) / 180 }; syncSliders(); draw(); } }} /><output>{sliders.rot}°</output></label>
          <label>Opacity<input type="range" min={40} max={100} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(+e.target.value / 100)} /><output>{Math.round(opacity * 100)}%</output></label>
          <label className="check"><input type="checkbox" checked={blend} onChange={(e) => setBlend(e.target.checked)} /> Fabric blend (keeps folds and shadows)</label>
        </div>
        <div>
          <div className="opt-label">Your size <Link href="/size-guide" style={{ textDecoration: 'underline' }}>Guide</Link></div>
          <div className="sizes">
            {variants.map((v) => (
              <button key={v.id} className="size" aria-pressed={v.size === size} aria-disabled={!v.available} onClick={() => (v.available ? setSize(v.size) : toast(`${v.size} is sold out`))}>{v.size}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <button className="btn btn-gold btn-block" onClick={addToBag} disabled={!variants.some((v) => v.available)}>{variants.some((v) => v.available) ? 'Add to bag' : 'Sold out'}</button>
          <Link href={`/products/${product.handle}`} className="btn btn-ghost btn-block">View product</Link>
        </div>
        <p className="fine" style={{ textAlign: 'left' }}>🔒 Processed entirely in your browser. Your photo is never uploaded or stored.</p>
      </aside>
    </div>
  );
}
