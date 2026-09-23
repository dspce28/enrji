'use client';

import type { PoseLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision';

/**
 * Where the AI try-on may repaint. Runs on the shopper's device (Google MediaPipe: body landmarks and a
 * hair / face / skin / clothes segmentation), before the photo is sent.
 *
 * The mask covers the upper-body clothing (torso and arms, not trousers) and leaves out the face, hair and
 * hands, including whatever is on the wrist. The try-on model then draws the new garment around the hands
 * instead of painting over them, and we put its output back into the original photo only inside this mask,
 * so the face, hands and background stay exactly as photographed.
 */

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const POSE = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const SEG = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';

let models: Promise<{ pose: PoseLandmarker; seg: ImageSegmenter }> | null = null;

/** Start downloading the models (about 20 MB, cached by the browser after the first time). */
export function preloadMaskModels() {
  models ??= (async () => {
    const { FilesetResolver, PoseLandmarker, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks(WASM);
    const make = async (delegate: 'GPU' | 'CPU') => ({
      pose: await PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: POSE, delegate }, runningMode: 'IMAGE', numPoses: 1 }),
      seg: await ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: SEG, delegate }, runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false }),
    });
    try { return await make('GPU'); } catch { return await make('CPU'); }
  })();
  models.catch(() => { models = null; });
  return models;
}

/** Box blur on a 0–1 map (two passes). Also used as a fast dilation: blur > 0 grows a shape by r. */
function blur(src: Float32Array, w: number, h: number, r: number) {
  r = Math.max(1, Math.round(r));
  let a = src;
  for (let pass = 0; pass < 2; pass++) {
    const b = new Float32Array(a.length), c = new Float32Array(a.length);
    for (let y = 0; y < h; y++) {
      let acc = 0; const o = y * w;
      for (let x = -r; x <= r; x++) acc += a[o + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) { b[o + x] = acc / (2 * r + 1); acc += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) { c[y * w + x] = acc / (2 * r + 1); acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x]; }
    }
    a = c;
  }
  return a;
}
const dilate = (m: Float32Array, w: number, h: number, r: number) => { const b = blur(m, w, h, r / 2); for (let i = 0; i < b.length; i++) b[i] = b[i] > 0.02 ? 1 : 0; return b; };

export interface TryOnMask { width: number; height: number; /** 0–1 per pixel */ data: Float32Array }

/** Build the repaint mask for a photo (a canvas at the photo's working size). Null if no person is found. */
export async function buildMask(photo: HTMLCanvasElement, kind: 'tee' | 'sweatshirt'): Promise<TryOnMask | null> {
  const { pose, seg } = await preloadMaskModels();
  const W = photo.width, H = photo.height, N = W * H;
  const lm = pose.detect(photo).landmarks[0];
  if (!lm || lm.length < 25) return null;
  const res = seg.segment(photo);
  const cms = res.confidenceMasks;
  if (!cms || cms.length < 6) { res.close(); return null; }
  // Confidence maps (256 × 256) scaled up to the photo.
  const up = (i: number) => {
    const m = cms[i], f = m.getAsFloat32Array(), mw = m.width, mh = m.height, out = new Float32Array(N);
    for (let y = 0; y < H; y++) {
      const fy = Math.min(mh - 1, Math.max(0, ((y + 0.5) / H) * mh - 0.5)), y0 = Math.floor(fy), y1 = Math.min(mh - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < W; x++) {
        const fx = Math.min(mw - 1, Math.max(0, ((x + 0.5) / W) * mw - 0.5)), x0 = Math.floor(fx), x1 = Math.min(mw - 1, x0 + 1), tx = fx - x0;
        out[y * W + x] = (f[y0 * mw + x0] * (1 - tx) + f[y0 * mw + x1] * tx) * (1 - ty) + (f[y1 * mw + x0] * (1 - tx) + f[y1 * mw + x1] * tx) * ty;
      }
    }
    return out;
  };
  const hair = up(1), skin = up(2), face = up(3), clothes = up(4), other = up(5);
  res.close();

  const P = (i: number) => ({ x: lm[i].x * W, y: lm[i].y * H });
  const shL = P(11), shR = P(12), hpL = P(23), hpR = P(24);
  const sw = Math.hypot(shL.x - shR.x, shL.y - shR.y);
  const shY = (shL.y + shR.y) / 2, hipY = (hpL.y + hpR.y) / 2, torso = Math.max(10, hipY - shY), cx = (shL.x + shR.x) / 2;
  const segD = (px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }) => {
    const abx = b.x - a.x, aby = b.y - a.y, t = Math.max(0, Math.min(1, ((px - a.x) * abx + (py - a.y) * aby) / Math.max(abx * abx + aby * aby, 1e-3)));
    return Math.hypot(px - (a.x + t * abx), py - (a.y + t * aby));
  };
  const arms = [0, 1].map((s) => ({ sh: P(11 + s), el: P(13 + s), wr: P(15 + s) }));
  const hands = [0, 1].map((s) => {
    const pts = [15, 17, 19, 21].map((i) => P(i + s));
    const c = { x: pts.reduce((a, p) => a + p.x, 0) / 4, y: pts.reduce((a, p) => a + p.y, 0) / 4 };
    const r = Math.max(Math.max(...pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y))) * 2.4, sw * 0.12);
    return { c, r };
  });

  // What may be repainted: upper-body clothing (not trousers), the torso, the arms.
  const m = new Float32Array(N), keep = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const upper = y < hipY + torso * 0.12 && y > shY - torso * 0.25;
    let on = clothes[i] > 0.4 && upper;
    if (!on && Math.abs(x - cx) < sw * 0.62 && y > shY && y < hipY + torso * 0.05) on = true;
    if (!on) for (const a of arms) {
      const inArm = segD(x, y, a.sh, a.el) < sw * 0.2 || segD(x, y, a.el, a.wr) < sw * 0.17;
      if (inArm && (clothes[i] > 0.3 || (kind === 'sweatshirt' && skin[i] > 0.3))) { on = true; break; }
    }
    m[i] = on ? 1 : 0;
    // Never repainted: face, hair, hands and what's on the wrist.
    let k = face[i] > 0.4 || hair[i] > 0.5;
    if (!k) for (const hd of hands) if (Math.hypot(x - hd.c.x, y - hd.c.y) < hd.r && (skin[i] > 0.35 || other[i] > 0.35)) { k = true; break; }
    keep[i] = k ? 1 : 0;
  }
  const grown = dilate(m, W, H, W * 0.012), kept = dilate(keep, W, H, W * 0.004);
  for (let i = 0; i < N; i++) grown[i] = grown[i] * (1 - kept[i]);
  return { width: W, height: H, data: grown };
}

/** Pad a canvas to 3:4 (what the try-on model works in) so the photo and the mask stay aligned. */
export function padTo34(W: number, H: number) {
  const tw = H <= (W * 4) / 3 ? W : Math.round((H * 3) / 4), th = H <= (W * 4) / 3 ? Math.round((W * 4) / 3) : H;
  return { tw, th, ox: Math.floor((tw - W) / 2), oy: Math.floor((th - H) / 2) };
}
