'use client';

import { blur, dilate, type TryOnMask } from './tryonMask';

/**
 * The try-on model draws the garment well but garbles lettering ("SELLNG"). After it has dressed the
 * photo, this puts the real artwork back: it finds the print the model drew on the chest, erases it
 * (filling with the fabric, shaded like the cloth around it), then lays the crisp artwork where the
 * model's print was, following the same light and shade.
 *
 * It leaves the image alone when it can't do this safely — no print found, an odd size or place, or a
 * forearm across the chest — and returns false.
 */
export function overlayPrint(cv: HTMLCanvasElement, mask: TryOnMask, art: HTMLImageElement): boolean {
  const W = cv.width, H = cv.height, { cx, shY, hipY, sw, forearms } = mask.body;
  const torso = Math.max(10, hipY - shY);
  // Working area: the chest with room around it for the artwork and the fabric's shading.
  const rx0 = Math.max(0, Math.round(cx - sw * 0.7)), rx1 = Math.min(W, Math.round(cx + sw * 0.7));
  const ry0 = Math.max(0, Math.round(shY - torso * 0.1)), ry1 = Math.min(H, Math.round(shY + torso * 1.0));
  const w = rx1 - rx0, h = ry1 - ry0, N = w * h;
  if (w < 40 || h < 40) return false;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(rx0, ry0, w, h), A = img.data;

  const m = new Float32Array(N), roi = new Uint8Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, X = x + rx0, Y = y + ry0;
    m[i] = mask.data[Y * W + X] > 0.5 ? 1 : 0;
    roi[i] = Math.abs(X - cx) < sw * 0.55 && Y > shY + torso * 0.05 && Y < shY + torso * 0.85 ? 1 : 0;
  }
  // Only well inside the garment (away from hair, skin and background edges).
  const core = dilate(m.map((v) => 1 - v), w, h, W * 0.01).map((v) => 1 - v);

  // Fabric colour: the most common colour on the chest.
  const hist = new Map<number, number[]>();
  for (let i = 0; i < N; i++) if (m[i] && roi[i]) {
    const k = ((A[i * 4] >> 4) << 8) | ((A[i * 4 + 1] >> 4) << 4) | (A[i * 4 + 2] >> 4);
    const e = hist.get(k); if (e) { e[0]++; e[1] += A[i * 4]; e[2] += A[i * 4 + 1]; e[3] += A[i * 4 + 2]; } else hist.set(k, [1, A[i * 4], A[i * 4 + 1], A[i * 4 + 2]]);
  }
  let top: number[] | null = null;
  for (const e of hist.values()) if (!top || e[0] > top[0]) top = e;
  if (!top || top[0] < 200) return false;
  const f = [top[1] / top[0] + 12, top[2] / top[0] + 12, top[3] / top[0] + 12], ff = f[0] * f[0] + f[1] * f[1] + f[2] * f[2];

  // Each pixel's brightness relative to the fabric (s), and how far its colour is from the fabric's (res).
  const s = new Float32Array(N), res = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = A[i * 4] + 12, g = A[i * 4 + 1] + 12, b = A[i * 4 + 2] + 12;
    const k = (r * f[0] + g * f[1] + b * f[2]) / ff;
    s[i] = k; res[i] = Math.hypot(r - k * f[0], g - k * f[1], b - k * f[2]);
  }
  let prn = new Uint8Array(N);
  for (let i = 0; i < N; i++) prn[i] = core[i] > 0.5 && roi[i] && (res[i] > 26 || s[i] < 0.55 || s[i] > 1.45) ? 1 : 0;
  prn = open3(prn, w, h);

  // The print is the biggest cluster of such pixels on the upper chest (not folds, seams or the hem).
  const grown = dilate(Float32Array.from(prn), w, h, W * 0.02);
  const lab = new Int32Array(N), stack: number[] = [];
  let best = 0, bestN = 0, nl = 0;
  for (let i0 = 0; i0 < N; i0++) {
    if (!grown[i0] || lab[i0]) continue;
    nl++; lab[i0] = nl; stack.push(i0);
    let n = 0, sx = 0, sy = 0;
    while (stack.length) {
      const i = stack.pop()!, x = i % w, y = (i / w) | 0;
      if (prn[i]) { n++; sx += x; sy += y; }
      if (x > 0 && grown[i - 1] && !lab[i - 1]) { lab[i - 1] = nl; stack.push(i - 1); }
      if (x < w - 1 && grown[i + 1] && !lab[i + 1]) { lab[i + 1] = nl; stack.push(i + 1); }
      if (y > 0 && grown[i - w] && !lab[i - w]) { lab[i - w] = nl; stack.push(i - w); }
      if (y < h - 1 && grown[i + w] && !lab[i + w]) { lab[i + w] = nl; stack.push(i + w); }
    }
    if (n < 50) continue;
    const mx = sx / n + rx0, my = sy / n + ry0;
    if (Math.abs(mx - cx) < sw * 0.3 && my > shY + torso * 0.08 && my < shY + torso * 0.7 && n > bestN) { best = nl; bestN = n; }
  }
  if (!best) return false;
  let x0 = w, x1 = 0, y0 = h, y1 = 0;
  for (let i = 0; i < N; i++) if (prn[i] && lab[i] === best) {
    const x = i % w, y = (i / w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const pw = x1 - x0;
  if (pw < sw * 0.3 || pw > sw * 1.0) return false;

  // Place the artwork where it best covers the model's print: try sizes and positions, score by overlap.
  const aw = art.naturalWidth, ah = art.naturalHeight;
  const d = Math.max(1, Math.round(pw / 80)), dw = Math.ceil(w / d), dh = Math.ceil(h / d);
  const acc = new Float32Array(dw * dh), pm = new Uint8Array(dw * dh);
  for (let i = 0; i < N; i++) if (prn[i] && lab[i] === best) acc[((i / w / d) | 0) * dw + (((i % w) / d) | 0)] += 1 / (d * d);
  let pmN = 0;
  for (let i = 0; i < pm.length; i++) { pm[i] = acc[i] > 0.3 ? 1 : 0; pmN += pm[i]; }
  let place: { x: number; y: number; w: number; h: number } | null = null, dice = 0;
  const pcx = (x0 + x1) / 2 / d, pcy = (y0 + y1) / 2 / d;
  for (let k = 0.75; k <= 1.2501; k += 0.05) {
    const tw = Math.round((pw * k) / d), th = Math.round((pw * k * ah) / aw / d);
    if (tw < 4 || th < 4) continue;
    const al = alphaOf(art, tw, th);
    let sa = 0; for (let i = 0; i < al.length; i++) sa += al[i];
    for (let oy = Math.floor(pcy - th); oy <= Math.floor(pcy); oy++) for (let ox = Math.floor(pcx - tw * 0.75); ox <= Math.floor(pcx - tw * 0.25); ox++) {
      if (oy < 0 || ox < 0 || oy + th > dh || ox + tw > dw) continue;
      let hit = 0;
      for (let y = 0; y < th; y++) { const o = (oy + y) * dw + ox, q = y * tw; for (let x = 0; x < tw; x++) hit += al[q + x] & pm[o + x]; }
      const sc = (2 * hit) / (sa + pmN);
      if (sc > dice) { dice = sc; place = { x: ox * d, y: oy * d, w: tw * d, h: th * d }; }
    }
  }
  if (!place || dice < 0.25) return false;

  // The artwork at its final size.
  const ac = document.createElement('canvas');
  ac.width = place.w; ac.height = place.h;
  const ag = ac.getContext('2d', { willReadFrequently: true })!;
  ag.imageSmoothingQuality = 'high';
  ag.filter = 'blur(0.4px)';
  ag.drawImage(art, 0, 0, place.w, place.h);
  const P = ag.getImageData(0, 0, place.w, place.h).data;

  // A forearm across the chest may hide part of the print: leave the image as the model drew it.
  // (Visible hands, hair and skin are already outside the mask, so the artwork simply goes behind them.)
  const occ = new Uint8Array(N);
  const segD = (px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }) => {
    const abx = b.x - a.x, aby = b.y - a.y, t = Math.max(0, Math.min(1, ((px - a.x) * abx + (py - a.y) * aby) / Math.max(abx * abx + aby * aby, 1e-3)));
    return Math.hypot(px - (a.x + t * abx), py - (a.y + t * aby));
  };
  let blocked = 0, inked = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x - place.x, py = y - place.y, onArt = px >= 0 && py >= 0 && px < place.w && py < place.h && P[(py * place.w + px) * 4 + 3] > 76;
    if (onArt) inked++;
    if (!forearms.some((a) => segD(x + rx0, y + ry0, a.el, a.wr) < sw * 0.12)) continue;
    occ[y * w + x] = 1;
    if (onArt) blocked++;
  }
  if (!inked || blocked > inked * 0.02) return false;

  // Erase the model's print (and its faint parts) inside the artwork's zone, keeping the fabric's shading.
  const zx0 = Math.min(x0, place.x) - pw * 0.08, zx1 = Math.max(x1, place.x + place.w) + pw * 0.08;
  const zy0 = Math.min(y0, place.y) - place.h * 0.12, zy1 = Math.max(y1, place.y + place.h) + place.h * 0.12;
  const inZone = (x: number, y: number) => x > zx0 && x < zx1 && y > zy0 && y < zy1;
  const weak = new Float32Array(N), E = new Float32Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    weak[i] = inZone(x, y) && (res[i] > 10 || s[i] < 0.85 || s[i] > 1.2) ? 1 : 0;
  }
  const weakE = dilate(Float32Array.from(weak, (v, i) => v * m[i]), w, h, W * 0.006);
  const weakG = dilate(weak, w, h, W * 0.01);
  const good = new Float32Array(N), sc = new Float32Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    E[i] = weakE[i] * m[i] * (inZone(x, y) ? 1 : 0);
    good[i] = m[i] * (1 - weakG[i]);
    sc[i] = Math.min(1.5, Math.max(0.5, s[i])) * good[i];
  }
  // Shading of the cloth around the print, carried across it (wider reach where the print is large).
  let sb: Float32Array = new Float32Array(N);
  const cov = new Float32Array(N);
  for (const r of [0.04, 0.1, 0.25]) {
    const a = blur(sc, w, h, (W * r) / 2), b = blur(good, w, h, (W * r) / 2);
    for (let i = 0; i < N; i++) if (cov[i] < 0.05 && b[i] > 1e-4) { sb[i] = a[i] / b[i]; cov[i] = Math.max(cov[i], b[i]); }
  }
  for (let i = 0; i < N; i++) if (!sb[i]) sb[i] = 1;
  sb = blur(sb, w, h, W * 0.01);
  const t = blur(E, w, h, W * 0.004);
  let seed = 7;
  const grain = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed / 0x7fffffff - 0.5) * 6; };
  for (let i = 0; i < N; i++) {
    const a = t[i] * m[i];
    if (a <= 0) continue;
    const n = grain();
    for (let c = 0; c < 3; c++) A[i * 4 + c] = A[i * 4 + c] * (1 - a) + (sb[i] * f[c] - 12 + n) * a;
  }

  // The crisp artwork, following the folds, only on the garment and never over an arm or hand.
  const vals: number[] = [];
  for (let y = 0; y < place.h; y += 4) for (let x = 0; x < place.w; x += 4) {
    const X = x + place.x, Y = y + place.y;
    if (X < w && Y < h && m[Y * w + X]) vals.push(sb[Y * w + X]);
  }
  vals.sort((a, b) => a - b);
  const mid = vals[vals.length >> 1] || 1;
  for (let y = 0; y < place.h; y++) for (let x = 0; x < place.w; x++) {
    const X = x + place.x, Y = y + place.y;
    if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
    const i = Y * w + X, j = (y * place.w + x) * 4;
    const a = (P[j + 3] / 255) * m[i] * (1 - occ[i]);
    if (a <= 0) continue;
    const sh = Math.min(1.12, Math.max(0.75, sb[i] / mid));
    for (let c = 0; c < 3; c++) A[i * 4 + c] = A[i * 4 + c] * (1 - a) + Math.min(255, P[j + c] * sh) * a;
  }
  ctx.putImageData(img, rx0, ry0);
  return true;
}

/** 3 × 3 opening: drops single stray pixels. */
function open3(a: Uint8Array, w: number, h: number) {
  const pass = (src: Uint8Array, erode: boolean) => {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = erode ? 1 : 0;
      for (let dy = -1; dy <= 1 && v === (erode ? 1 : 0); dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = Math.min(w - 1, Math.max(0, x + dx)), yy = Math.min(h - 1, Math.max(0, y + dy)), s = src[yy * w + xx];
        if (erode ? !s : s) { v = erode ? 0 : 1; break; }
      }
      out[y * w + x] = v;
    }
    return out;
  };
  return pass(pass(a, true), false);
}

/** The artwork's shape (alpha > 0.3) at a given size. */
function alphaOf(art: HTMLImageElement, tw: number, th: number) {
  const c = document.createElement('canvas');
  c.width = tw; c.height = th;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(art, 0, 0, tw, th);
  const d = g.getImageData(0, 0, tw, th).data, out = new Uint8Array(tw * th);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3] > 76 ? 1 : 0;
  return out;
}
