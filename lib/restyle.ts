'use client';

import type { Body, Masks } from './bodyTracking';

/**
 * "Restyle": re-dress the top the person is already wearing, instead of pasting a garment over it.
 *
 * From the photo and the on-device segmentation this works out, per pixel:
 * - which pixels are the upper-body garment (the top, not trousers), with edges refined to the photo;
 * - the fabric's own shading: folds, creases, the roundness of the body and the light falling on it,
 *   as a brightness ratio against the local fabric average;
 * - where the old print is, so its pixels are left out of the shading and filled in from the fabric around.
 * The renderer then multiplies the new garment colour and print by that shading, so the result keeps
 * every real fold of the fabric but none of the old colour or graphics.
 */

export interface ClothesMap {
  width: number;
  height: number;
  /** RGBA: R shading (linear light ratio / SHADE_MAX), G garment coverage, B old-print mask, A 255. */
  data: Uint8Array;
  /** The top's own fabric colour (sRGB 0–255), used for "keep my colour". */
  fabric: [number, number, number];
  /** Share of the torso area covered by the detected top (0–1). */
  coverage: number;
}

export const SHADE_MAX = 2.4;

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Separable box blur, applied twice (close to a Gaussian). */
function blur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  r = Math.max(1, Math.round(r));
  let a = src, b = new Float32Array(src.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {                       // horizontal
      let acc = 0; const row = y * w;
      for (let x = -r; x <= r; x++) acc += a[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[row + x] = acc / (2 * r + 1);
        acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    const c = new Float32Array(src.length);
    for (let x = 0; x < w; x++) {                       // vertical
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        c[y * w + x] = acc / (2 * r + 1);
        acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
    a = c;
  }
  return a;
}

/** Weighted blur: average of v over pixels with weight w. Returns [value, coverage]. */
function normBlur(v: Float32Array, wt: Float32Array, w: number, h: number, r: number): [Float32Array, Float32Array] {
  const vw = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) vw[i] = v[i] * wt[i];
  const num = blur(vw, w, h, r), den = blur(wt, w, h, r);
  for (let i = 0; i < v.length; i++) num[i] = den[i] > 1e-4 ? num[i] / den[i] : 0;
  return [num, den];
}

/** Guided filter: snaps the soft, low-resolution segmentation edge to the edges in the photo. */
function guided(p: Float32Array, I: Float32Array, w: number, h: number, r: number, eps: number) {
  const n = p.length;
  const II = new Float32Array(n), Ip = new Float32Array(n);
  for (let i = 0; i < n; i++) { II[i] = I[i] * I[i]; Ip[i] = I[i] * p[i]; }
  const mI = blur(I, w, h, r), mp = blur(p, w, h, r), mII = blur(II, w, h, r), mIp = blur(Ip, w, h, r);
  const A = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const varI = mII[i] - mI[i] * mI[i], cov = mIp[i] - mI[i] * mp[i];
    A[i] = cov / (varI + eps); B[i] = mp[i] - A[i] * mI[i];
  }
  const mA = blur(A, w, h, r), mB = blur(B, w, h, r);
  const q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = Math.min(1, Math.max(0, mA[i] * I[i] + mB[i]));
  return q;
}

/** Most common colour among samples: k-means with 3 clusters, largest cluster wins. */
function dominant(samples: number[][]): [number, number, number] {
  if (!samples.length) return [0.5, 0.5, 0.5];
  let cs = [samples[0], samples[Math.floor(samples.length / 2)], samples[samples.length - 1]].map((c) => [...c]);
  let counts = [0, 0, 0];
  for (let it = 0; it < 10; it++) {
    const sums = cs.map(() => [0, 0, 0]); counts = [0, 0, 0];
    for (const s of samples) {
      let best = 0, bd = Infinity;
      cs.forEach((c, k) => { const d = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2; if (d < bd) { bd = d; best = k; } });
      sums[best][0] += s[0]; sums[best][1] += s[1]; sums[best][2] += s[2]; counts[best]++;
    }
    cs = cs.map((c, k) => (counts[k] ? sums[k].map((v) => v / counts[k]) : c));
  }
  const k = counts.indexOf(Math.max(...counts));
  return cs[k] as [number, number, number];
}

export function analyseClothes(src: CanvasImageSource & { width: number; height: number }, masks: Masks, body: Body, maxSide = 512): ClothesMap | null {
  const k = Math.min(1, maxSide / Math.max(src.width, src.height));
  const W = Math.max(8, Math.round(src.width * k)), H = Math.max(8, Math.round(src.height * k)), N = W * H;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data;

  const R = new Float32Array(N), G = new Float32Array(N), Bc = new Float32Array(N), Y = new Float32Array(N), Lin = new Float32Array(N);
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    R[i] = px[j] / 255; G[i] = px[j + 1] / 255; Bc[i] = px[j + 2] / 255;
    Y[i] = 0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * Bc[i];
    Lin[i] = 0.2126 * toLin(R[i]) + 0.7152 * toLin(G[i]) + 0.0722 * toLin(Bc[i]);
  }

  // Clothes confidence, sampled up from the segmenter's grid.
  const C = new Float32Array(N);
  const mw = masks.width, mh = masks.height, md = masks.data;
  for (let y = 0; y < H; y++) {
    const fy = Math.min(mh - 1, Math.max(0, ((y + 0.5) / H) * mh - 0.5)), y0 = Math.floor(fy), y1 = Math.min(mh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(mw - 1, Math.max(0, ((x + 0.5) / W) * mw - 0.5)), x0 = Math.floor(fx), x1 = Math.min(mw - 1, x0 + 1), tx = fx - x0;
      const a = (i: number) => md[i * 4 + 3] / 255;
      const top = a(y0 * mw + x0) * (1 - tx) + a(y0 * mw + x1) * tx, bot = a(y1 * mw + x0) * (1 - tx) + a(y1 * mw + x1) * tx;
      C[y * W + x] = top * (1 - ty) + bot * ty;
    }
  }
  const Cq = guided(C, Y, W, H, Math.max(2, W / 120), 0.004);

  // Body frame in analysis pixels.
  const sx = (body.shoulderL.x + body.shoulderR.x) / 2 * k, sy = (body.shoulderL.y + body.shoulderR.y) / 2 * k;
  const hy = (body.hipL.y + body.hipR.y) / 2 * k;
  const sw = Math.max(8, Math.abs(body.shoulderR.x - body.shoulderL.x) * k);
  const torso = Math.max(8, hy - sy);

  // Fabric colour from the chest and belly.
  const samples: number[][] = [];
  const x0 = Math.max(0, Math.round(sx - sw * 0.45)), x1 = Math.min(W - 1, Math.round(sx + sw * 0.45));
  const y0 = Math.max(0, Math.round(sy + torso * 0.1)), y1 = Math.min(H - 1, Math.round(hy));
  const step = Math.max(1, Math.round(Math.sqrt(((x1 - x0) * (y1 - y0)) / 3000)));
  for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
    const i = y * W + x;
    if (Cq[i] > 0.7) samples.push([R[i], G[i], Bc[i]]);
  }
  if (samples.length < 30) return null;
  const f = dominant(samples);
  const ff = f[0] * f[0] + f[1] * f[1] + f[2] * f[2] + 1e-4;

  // Per pixel: how far it is from the fabric colour once brightness is allowed to vary.
  // A fold is the fabric colour at a different brightness; a print is a different colour, or far brighter/darker.
  const RES = new Float32Array(N), SCL = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const s = Math.min(1.8, Math.max(0.35, (R[i] * f[0] + G[i] * f[1] + Bc[i] * f[2]) / ff));
    RES[i] = Math.hypot(R[i] - s * f[0], G[i] - s * f[1], Bc[i] - s * f[2]);
    SCL[i] = s;
  }

  // The hem: above the waist every clothes pixel is the top. Below it, each column follows the fabric down
  // until it stops matching (belt, trousers — denim can be close in hue to navy, so brightness must match too),
  // and the resulting hem line is smoothed so it runs cleanly across the body.
  const yCut = Math.round(hy - torso * 0.08), yMax = Math.min(H - 1, Math.round(yCut + torso * 0.3));
  const hem = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    let y = Math.max(0, yCut), miss = 0, last = y;
    for (; y <= yMax; y++) {
      const i = y * W + x;
      // Ribbed hems photograph a little differently from the body of the garment, hence the margin.
      const fabricLike = Cq[i] > 0.4 && RES[i] < 0.1 && Math.abs(Math.log(SCL[i])) < 0.38;
      if (fabricLike) { last = y; miss = 0; } else if (++miss > 3) break;
    }
    hem[x] = last;
  }
  const hemM = new Float32Array(W), hemS = new Float32Array(W), hr = Math.max(2, Math.round(sw * 0.12));
  for (let x = 0; x < W; x++) {
    const win: number[] = [];
    for (let d = -hr; d <= hr; d++) win.push(hem[Math.min(W - 1, Math.max(0, x + d))]);
    win.sort((a, b) => a - b);
    hemM[x] = win[Math.round(win.length * 0.6)];   // upper median: ignores stray columns, favours the longer hem
  }
  for (let x = 0; x < W; x++) {                      // then soften, so the hem reads as one line
    let acc = 0, n = 0;
    for (let d = -hr; d <= hr; d++) { const xx = x + d; if (xx >= 0 && xx < W) { acc += hemM[xx]; n++; } }
    hemS[x] = acc / n;
  }

  const T = new Float32Array(N), P = new Float32Array(N), F = new Float32Array(N);
  let torsoPx = 0, torsoTop = 0;
  const top = sy - torso * 0.35;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const region = y < top ? 0 : 1 - smoothstep(hemS[x] - 1, hemS[x] + 2, y);
    const t = Cq[i] * region;
    const print = smoothstep(0.07, 0.17, RES[i]);
    T[i] = t; P[i] = print * t; F[i] = t * (1 - print);
    if (Math.abs(x - sx) < sw * 0.45 && y > sy && y < hy) { torsoPx++; torsoTop += t; }
  }

  // Shading: brightness of each fabric pixel against the local fabric average (linear light).
  const [Lloc] = normBlur(Lin, F, W, H, sw * 0.35);
  const S0 = new Float32Array(N);
  for (let i = 0; i < N; i++) S0[i] = F[i] > 0.01 ? Lin[i] / Math.max(Lloc[i], 1e-3) : 1;
  // Dark fabric photographs with a lot of noise relative to its brightness: smooth it more.
  let fl = 0, fn = 0;
  for (let i = 0; i < N; i++) if (F[i] > 0.5) { fl += Lin[i]; fn++; }
  const dark = 1 - smoothstep(0.02, 0.12, fn ? fl / fn : 0.2);
  const [Sa, wa] = normBlur(S0, F, W, H, sw * (0.02 + 0.03 * dark));   // denoise, keeps folds
  const [Sb, wb] = normBlur(S0, F, W, H, sw * 0.12);        // fills small print areas
  const [Sc, wc] = normBlur(S0, F, W, H, sw * 0.35);        // fills large prints
  // Light across the body (one side brighter than the other).
  let sumL = 0, nL = 0;
  for (let i = 0; i < N; i++) if (T[i] > 0.5) { sumL += Lloc[i]; nL++; }
  const meanL = nL ? sumL / nL : 1;

  const data = new Uint8Array(N * 4);
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    let s = 1;
    if (wa[i] > 0.35 && F[i] > 0.3) s = Sa[i];
    else if (wb[i] > 0.15) s = Sb[i] * smoothstep(0.15, 0.35, wb[i]) + (wc[i] > 0.05 ? Sc[i] : 1) * (1 - smoothstep(0.15, 0.35, wb[i]));
    else if (wc[i] > 0.05) s = Sc[i];
    const gl = Math.min(1.25, Math.max(0.7, Lloc[i] / Math.max(meanL, 1e-3)));
    s = Math.pow(s, 1 - 0.3 * dark);
    s = Math.min(SHADE_MAX, Math.max(0.12, s * Math.pow(gl, 0.6)));
    data[j] = Math.round((s / SHADE_MAX) * 255);
    data[j + 1] = Math.round(T[i] * 255);
    data[j + 2] = Math.round(P[i] * 255);
    data[j + 3] = 255;
  }
  return {
    width: W, height: H, data,
    fabric: [Math.round(f[0] * 255), Math.round(f[1] * 255), Math.round(f[2] * 255)],
    coverage: torsoPx ? torsoTop / torsoPx : 0,
  };
}
