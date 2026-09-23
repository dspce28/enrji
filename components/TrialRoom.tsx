'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { drawGarment, GARMENT_COLORS, type GarmentKind } from '@/lib/garment';
import { analyseFrame, analyseImage, bodyFromShoulders, loadVision, smoothBody, type Body, type Pt } from '@/lib/bodyTracking';
import { DEFAULT_FIT, WornRenderer, type Fit } from '@/lib/wornRenderer';
import { cdn, inr, titleCase } from '@/lib/format';
import { useCart } from './cart';

const Garment360 = dynamic(() => import('./Garment360'), { ssr: false, loading: () => <div className="g360"><div className="g360-loading"><span /></div></div> });

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
  variants: { id: number; size: string; color: string | null; available: boolean; price: number; compareAt: number | null; image: string | null }[];
}

type Source = 'none' | 'photo' | 'camera' | 'mannequin';
type Status = { kind: 'idle' | 'busy' | 'ok' | 'warn'; text: string };
const MAX_SIDE = 1280;

// Mannequin: drawn at 900 × 1200 with a known pose.
const MANNEQUIN: Body = {
  shoulderL: { x: 290, y: 425 }, shoulderR: { x: 610, y: 425 },
  elbowL: { x: 200, y: 700 }, elbowR: { x: 700, y: 700 },
  wristL: { x: 165, y: 930 }, wristR: { x: 735, y: 930 },
  hipL: { x: 340, y: 800 }, hipR: { x: 560, y: 800 },
  confidence: 1,
};

function drawMannequin() {
  const c = document.createElement('canvas');
  c.width = 900; c.height = 1200;
  const g = c.getContext('2d')!;
  const bg = g.createRadialGradient(450, 420, 60, 450, 560, 860);
  bg.addColorStop(0, '#2c2419'); bg.addColorStop(1, '#09090a');
  g.fillStyle = bg; g.fillRect(0, 0, 900, 1200);
  const skin = g.createLinearGradient(160, 0, 740, 0);
  skin.addColorStop(0, '#5e5040'); skin.addColorStop(0.5, '#b89f82'); skin.addColorStop(1, '#5e5040');
  g.fillStyle = skin; g.strokeStyle = skin; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.ellipse(450, 225, 88, 110, 0, 0, Math.PI * 2); g.fill();
  g.fillRect(410, 300, 80, 110);
  // Torso
  g.beginPath();
  g.moveTo(275, 430); g.quadraticCurveTo(450, 370, 625, 430);
  g.quadraticCurveTo(640, 620, 580, 800); g.lineTo(600, 1200); g.lineTo(300, 1200); g.lineTo(320, 800);
  g.quadraticCurveTo(260, 620, 275, 430); g.fill();
  // Arms
  const limb = (pts: Pt[], w: number) => { g.lineWidth = w; g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (const p of pts.slice(1)) g.lineTo(p.x, p.y); g.stroke(); };
  limb([MANNEQUIN.shoulderL, MANNEQUIN.elbowL, MANNEQUIN.wristL], 70);
  limb([MANNEQUIN.shoulderR, MANNEQUIN.elbowR, MANNEQUIN.wristR], 70);
  // Soft shading so the light transfer has something to read.
  const shade = g.createLinearGradient(0, 380, 0, 1200);
  shade.addColorStop(0, 'rgba(255,240,220,.10)'); shade.addColorStop(1, 'rgba(0,0,0,.35)');
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = shade; g.fillRect(0, 0, 900, 1200);
  g.globalCompositeOperation = 'source-over';
  return c;
}

export function TrialRoom({ products, initial }: { products: TryProduct[]; initial?: string }) {
  const { add, setOpen, toast } = useCart();
  const [product, setProduct] = useState<TryProduct>(() => products.find((p) => p.handle === initial) ?? products[0]);
  const [color, setColor] = useState<string | null>(product.colors[0] ?? null);
  const [view, setView] = useState<'on-you' | '360'>('on-you');
  const [mode, setMode] = useState<'full' | 'print'>('full');
  const [source, setSource] = useState<Source>('none');
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: '' });
  const [fit, setFit] = useState<Fit>(DEFAULT_FIT);
  const [realism, setRealism] = useState(0.85);
  const [picking, setPicking] = useState<Pt[] | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [dims, setDims] = useState({ w: 1, h: 1 });
  const [glFailed, setGlFailed] = useState(false);

  const cvRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<WornRenderer | null>(null);
  const body = useRef<Body | null>(null);
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const stream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const frame = useRef<HTMLCanvasElement | null>(null);
  const loop = useRef(0);
  const live = useRef(false);

  const hex = (color && product.colorHex[color]) || (color ? GARMENT_COLORS[color.toLowerCase()] : null) || product.defaultColor;
  const artwork = (color && product.artwork[color]) || product.artwork['*'] || null;

  const redraw = useCallback(() => {
    const r = renderer.current;
    if (!r) return;
    r.setBody(body.current, fitRef.current);
    r.render();
  }, []);

  // ---------- renderer ----------
  useEffect(() => {
    try { renderer.current = new WornRenderer(cvRef.current!); } catch { setGlFailed(true); }
    return () => {
      cancelAnimationFrame(loop.current);
      stream.current?.getTracks().forEach((t) => t.stop());
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, []);

  // Garment texture: rebuilt when the product, colour or mode changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await document.fonts?.ready;
      let art: HTMLImageElement | null = null;
      if (artwork) {
        art = new Image();
        art.src = artwork;
        try { await art.decode(); } catch { art = null; }
      }
      if (cancelled || !renderer.current) return;
      const tex = drawGarment({ kind: product.kind, color: hex, ink: product.ink, slogan: product.baseName, artwork: art }, { scale: 2, shading: false, bodyless: mode === 'print' });
      renderer.current.setGarment(tex, product.kind, mode === 'print', hex);
      redraw();
    })();
    return () => { cancelled = true; };
  }, [product, hex, artwork, mode, redraw]);

  useEffect(() => { renderer.current?.setLook(realism, 1); redraw(); }, [realism, redraw]);
  useEffect(() => { redraw(); }, [fit, redraw]);

  // ---------- sources ----------
  const applyPhoto = useCallback((c: HTMLCanvasElement) => {
    const r = renderer.current;
    if (!r) return;
    r.setPhoto(c, c.width, c.height);
    r.setMasks(null);
    setDims({ w: c.width, h: c.height });
    setFit(DEFAULT_FIT);
    setPicking(null);
    setView('on-you');
  }, []);

  const guessBody = (w: number, h: number) => bodyFromShoulders({ x: w * 0.3, y: h * 0.33 }, { x: w * 0.7, y: h * 0.33 });

  async function scan(c: HTMLCanvasElement) {
    setStatus({ kind: 'busy', text: 'Loading the body scanner (first time only)…' });
    try {
      await loadVision();
      setStatus({ kind: 'busy', text: 'Finding your shoulders, arms and clothes…' });
      const { body: b, masks } = await analyseImage(c, c.width, c.height);
      renderer.current?.setMasks(masks);
      if (b && b.confidence > 0.3) {
        body.current = b;
        setStatus({ kind: 'ok', text: 'Fitted to your body. Drag or pinch to fine-tune.' });
      } else {
        body.current = guessBody(c.width, c.height);
        setStatus({ kind: 'warn', text: 'Couldn’t find your shoulders. Tap “Place by shoulders”.' });
      }
    } catch {
      body.current = guessBody(c.width, c.height);
      setStatus({ kind: 'warn', text: 'Scanner unavailable on this device. Tap “Place by shoulders”.' });
    }
    redraw();
  }

  async function fromFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Please choose a photo');
    if (file.size > 25e6) return toast('That photo is too large (max 25 MB)');
    let src: ImageBitmap | HTMLImageElement;
    try {
      src = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      try { await img.decode(); } catch { URL.revokeObjectURL(url); return toast('Could not read that photo'); }
      src = img;
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    const w0 = 'naturalWidth' in src ? src.naturalWidth : src.width, h0 = 'naturalHeight' in src ? src.naturalHeight : src.height;
    const k = Math.min(1, MAX_SIDE / Math.max(w0, h0));
    const c = document.createElement('canvas');
    c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
    c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
    stopCamera();
    body.current = null;
    applyPhoto(c);
    setSource('photo');
    await scan(c);
  }

  function mannequin() {
    stopCamera();
    const c = drawMannequin();
    applyPhoto(c);
    body.current = MANNEQUIN;
    setSource('mannequin');
    setStatus({ kind: 'ok', text: 'Mannequin ready. Pick any design, or switch to the 360° view.' });
    redraw();
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) return toast('Camera is not available in this browser');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 1280 } }, audio: false });
    } catch { return toast('Camera permission was denied'); }
    const v = document.createElement('video');
    v.playsInline = true; v.muted = true;
    v.srcObject = stream.current;
    await v.play().catch(() => {});
    if (!v.videoWidth) await new Promise((res) => v.addEventListener('loadedmetadata', res, { once: true }));
    video.current = v;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    frame.current = c;
    body.current = null;
    applyPhoto(c);
    setSource('camera');
    setStatus({ kind: 'busy', text: 'Loading the body scanner (first time only)…' });

    let visionReady = false, busy = false, n = 0, lastTs = 0;
    loadVision().then(() => { visionReady = true; setStatus({ kind: 'busy', text: 'Step back until your shoulders and hips are in view.' }); })
      .catch(() => setStatus({ kind: 'warn', text: 'Scanner unavailable. Capture a frame and place it by shoulders.' }));
    live.current = true;
    const g = c.getContext('2d')!;
    const tick = () => {
      if (!live.current) return;
      loop.current = requestAnimationFrame(tick);
      g.setTransform(-1, 0, 0, 1, c.width, 0); // mirror, like a mirror
      g.drawImage(v, 0, 0, c.width, c.height);
      g.setTransform(1, 0, 0, 1, 0, 0);
      renderer.current?.photoChanged();
      if (visionReady && !busy) {
        busy = true;
        const ts = Math.max(lastTs + 1, performance.now());
        lastTs = ts;
        analyseFrame(c, c.width, c.height, ts, n++ % 2 === 0).then(({ body: b, masks }) => {
          if (masks) renderer.current?.setMasks(masks);
          if (b && b.confidence > 0.4) {
            const first = !body.current;
            body.current = smoothBody(body.current, b);
            if (first) setStatus({ kind: 'ok', text: 'Tracking you live. Turn a little, raise an arm.' });
          }
        }).catch(() => {}).finally(() => { busy = false; });
      }
      redraw();
    };
    tick();
  }

  function stopCamera() {
    live.current = false;
    cancelAnimationFrame(loop.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    video.current = null;
  }

  function capture() {
    const f = frame.current;
    if (!f) return;
    stopCamera();
    const c = document.createElement('canvas');
    c.width = f.width; c.height = f.height;
    c.getContext('2d')!.drawImage(f, 0, 0);
    const b = body.current;
    applyPhoto(c);
    setSource('photo');
    if (b) { body.current = b; setStatus({ kind: 'ok', text: 'Captured. Fine-tune by dragging, or save the image.' }); redraw(); }
    else scan(c);
  }

  function reset() {
    stopCamera();
    body.current = null;
    setSource('none');
    setStatus({ kind: 'idle', text: '' });
    setPicking(null);
  }

  // ---------- direct manipulation ----------
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<{ pts: Pt[]; fit: Fit } | null>(null);
  const toImage = (e: React.PointerEvent | PointerEvent): Pt => {
    const cv = cvRef.current!, r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * dims.w, y: ((e.clientY - r.top) / r.height) * dims.h };
  };
  const startGesture = () => { gesture.current = { pts: [...pointers.current.values()].map((p) => ({ ...p })), fit: { ...fitRef.current } }; };
  const clampScale = (s: number) => Math.max(0.6, Math.min(1.6, s));

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toImage(e);
    if (picking) {
      const pts = [...picking, p];
      if (pts.length < 2) { setPicking(pts); setStatus({ kind: 'warn', text: 'Now tap your other shoulder.' }); return; }
      setPicking(null);
      body.current = bodyFromShoulders(pts[0], pts[1]);
      setFit(DEFAULT_FIT);
      setStatus({ kind: 'ok', text: 'Placed. Drag, pinch or use the sliders to fine-tune.' });
      redraw();
      return;
    }
    if (source === 'camera') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, p);
    startGesture();
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, toImage(e));
    const pts = [...pointers.current.values()];
    if (pts.length === 1 && g.pts.length === 1) {
      setFit({ ...g.fit, dx: g.fit.dx + pts[0].x - g.pts[0].x, dy: g.fit.dy + pts[0].y - g.pts[0].y });
    } else if (pts.length >= 2 && g.pts.length >= 2) {
      const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
      setFit({ ...g.fit, scale: clampScale(g.fit.scale * (d(pts[0], pts[1]) / d(g.pts[0], g.pts[1]))) });
    }
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size) startGesture(); else gesture.current = null;
  };
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      if (!body.current) return;
      e.preventDefault();
      setFit((f) => ({ ...f, scale: clampScale(f.scale * Math.exp(-e.deltaY * 0.001)) }));
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  }, []);

  function download() {
    redraw();
    cvRef.current!.toBlob((blob) => {
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

  const hasSource = source !== 'none';
  const show360 = view === '360';

  return (
    <div className="tryon">
      <div>
        <div className="stage-top">
          <div className="view-toggle static" role="group" aria-label="View">
            <button aria-pressed={!show360} onClick={() => setView('on-you')}>On you</button>
            <button aria-pressed={show360} onClick={() => setView('360')}>360° view</button>
          </div>
          {!show360 && status.text && (
            <span className={`scan-status ${status.kind === 'ok' ? 'ok' : status.kind === 'warn' ? 'warn' : ''}`} role="status">
              {status.kind === 'busy' && <i aria-hidden />}{status.text}
            </span>
          )}
        </div>

        <div className={`stage${picking ? ' picking' : ''}`}>
          {show360 && (
            <div style={{ position: 'absolute', inset: 0 }}>
              <Garment360 key={`${product.handle}-${hex}`} kind={product.kind} color={hex} ink={product.ink} slogan={product.baseName} artwork={artwork} />
            </div>
          )}
          {!show360 && !hasSource && (
            <div className="drop"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); fromFile(e.dataTransfer.files[0]); }}>
              <div className="drop-ring" aria-hidden><span /></div>
              <h2 className="display h3">Step into the trial room</h2>
              <p className="muted" style={{ maxWidth: 440, margin: '12px auto 24px' }}>Stand facing the camera, arms slightly away from your body, shoulders to hips in frame. We find your body and dress it, right here on your device. Nothing is uploaded.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <label className="btn btn-gold">Upload a photo<input type="file" accept="image/*" hidden onChange={(e) => { fromFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
                <button className="btn btn-ghost" onClick={startCamera}>Live camera</button>
                <button className="btn btn-ghost" onClick={mannequin}>Try on mannequin</button>
              </div>
              {glFailed && <p className="fine" style={{ marginTop: 16 }}>This browser can&apos;t run WebGL, so the trial room isn&apos;t available here. The 360° view needs it too.</p>}
            </div>
          )}
          <div className="stage-canvas" style={{ display: show360 || !hasSource ? 'none' : undefined }}>
            <canvas ref={cvRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              aria-label={`You wearing the ${product.baseName} ${product.kind}. Drag to move it, pinch to resize.`} />
            {picking?.map((p, i) => <span key={i} className="tap-dot" style={{ left: `${(p.x / dims.w) * 100}%`, top: `${(p.y / dims.h) * 100}%` }} />)}
          </div>
        </div>

        {!show360 && hasSource && (
          <div className="stage-actions">
            {source === 'camera' ? (
              <>
                <button className="btn btn-gold btn-sm" onClick={capture}>● Capture</button>
                <button className="btn btn-ghost btn-sm" onClick={reset}>Stop camera</button>
              </>
            ) : (
              <>
                <button className="btn btn-gold btn-sm" onClick={download}>Save image</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setPicking([]); setStatus({ kind: 'warn', text: 'Tap the point of one shoulder, where the seam sits.' }); }}>⌖ Place by shoulders</button>
                <button className="btn btn-ghost btn-sm" onClick={reset}>New photo</button>
              </>
            )}
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
          {!artwork && <p className="fine" style={{ textAlign: 'left', marginTop: 8 }}>Preview print: the slogan set in our typeface. See product photos for the exact artwork.</p>}
        </div>
        {product.colors.length > 1 && (
          <div>
            <div className="opt-label">Colour <span>{color}</span></div>
            <div className="swatches">{product.colors.map((c) => <button key={c} className="swatch" aria-pressed={c === color} aria-label={c} style={{ background: product.colorHex[c] ?? GARMENT_COLORS[c.toLowerCase()] ?? '#444' }} onClick={() => setColor(c)} />)}</div>
          </div>
        )}
        {!show360 && (
          <>
            <div>
              <div className="opt-label">Wear it as</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="pill" aria-pressed={mode === 'full'} onClick={() => setMode('full')}>Full {product.kind}</button>
                <button className="pill" aria-pressed={mode === 'print'} onClick={() => setMode('print')}>Print on my clothes</button>
              </div>
            </div>
            <div className="sliders">
              <label>Size<input type="range" min={60} max={160} value={Math.round(fit.scale * 100)} disabled={!hasSource} onChange={(e) => setFit({ ...fit, scale: +e.target.value / 100 })} /><output>{Math.round(fit.scale * 100)}%</output></label>
              <label>Length<input type="range" min={75} max={130} value={Math.round(fit.length * 100)} disabled={!hasSource || mode === 'print'} onChange={(e) => setFit({ ...fit, length: +e.target.value / 100 })} /><output>{Math.round(fit.length * 100)}%</output></label>
              <label>Realism<input type="range" min={0} max={100} value={Math.round(realism * 100)} onChange={(e) => setRealism(+e.target.value / 100)} /><output>{Math.round(realism * 100)}%</output></label>
            </div>
          </>
        )}
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
        <p className="fine" style={{ textAlign: 'left' }}>🔒 Body scanning runs entirely in your browser. Your photo and camera never leave your device.</p>
      </aside>
    </div>
  );
}
