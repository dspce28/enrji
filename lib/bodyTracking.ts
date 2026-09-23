'use client';

import type { PoseLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision';

/**
 * On-device body tracking for the Trial Room (Google MediaPipe, runs in the browser).
 * - Pose landmarker: shoulders, elbows, wrists, hips.
 * - Multiclass selfie segmenter: hair / face / body skin / clothes masks.
 * Nothing leaves the device: models and WASM are served from this site (see scripts/vision-assets.mjs).
 */

export interface Pt { x: number; y: number }

export interface Body {
  // Image-left / image-right as seen in the picture (for a front-facing person, image-left is their right side).
  shoulderL: Pt; shoulderR: Pt;
  elbowL: Pt; elbowR: Pt;
  wristL: Pt; wristR: Pt;
  hipL: Pt; hipR: Pt;
  confidence: number;
}

export interface Masks {
  width: number;
  height: number;
  /** RGBA per pixel: R hair, G face skin, B body skin, A clothes (0–255 confidence). */
  data: Uint8Array;
}

interface Vision { pose: PoseLandmarker; seg: ImageSegmenter; mode: 'IMAGE' | 'VIDEO' }

let loading: Promise<Vision> | null = null;

export function loadVision(): Promise<Vision> {
  loading ??= (async () => {
    const { FilesetResolver, PoseLandmarker, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks('/mediapipe');
    const make = async (delegate: 'GPU' | 'CPU') => ({
      pose: await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/models/pose_landmarker_lite.task', delegate },
        runningMode: 'IMAGE', numPoses: 1, minPoseDetectionConfidence: 0.4, minPosePresenceConfidence: 0.4,
      }),
      seg: await ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/models/selfie_multiclass_256x256.tflite', delegate },
        runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true,
      }),
      mode: 'IMAGE' as const,
    });
    try { return await make('GPU'); } catch { return await make('CPU'); }
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

async function setMode(v: Vision, mode: 'IMAGE' | 'VIDEO') {
  if (v.mode === mode) return;
  await v.pose.setOptions({ runningMode: mode });
  await v.seg.setOptions({ runningMode: mode });
  v.mode = mode;
}

type Source = HTMLCanvasElement | HTMLImageElement | ImageBitmap | HTMLVideoElement;

function toBody(lm: { x: number; y: number; visibility?: number }[] | undefined, w: number, h: number): Body | null {
  if (!lm || lm.length < 25) return null;
  const P = (i: number): Pt => ({ x: lm[i].x * w, y: lm[i].y * h });
  const vis = [11, 12, 23, 24].map((i) => lm[i].visibility ?? 1);
  // MediaPipe indices: 11/12 shoulders, 13/14 elbows, 15/16 wrists, 23/24 hips (person's left/right).
  const pairs = ([[11, 12], [13, 14], [15, 16], [23, 24]] as const).map(([a, b]) => {
    const pa = P(a), pb = P(b);
    return pa.x <= pb.x ? [pa, pb] : [pb, pa];
  });
  const [[shoulderL, shoulderR], [elbowL, elbowR], [wristL, wristR], [hipL, hipR]] = pairs;
  return { shoulderL, shoulderR, elbowL, elbowR, wristL, wristR, hipL, hipR, confidence: Math.min(vis[0], vis[1]) };
}

function packMasks(masks: { getAsFloat32Array(): Float32Array; width: number; height: number }[] | undefined): Masks | null {
  if (!masks || masks.length < 5) return null;
  const { width, height } = masks[0];
  const hair = masks[1].getAsFloat32Array(), skin = masks[2].getAsFloat32Array(), face = masks[3].getAsFloat32Array(), clothes = masks[4].getAsFloat32Array();
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < hair.length; i++, j += 4) {
    data[j] = hair[i] * 255; data[j + 1] = face[i] * 255; data[j + 2] = skin[i] * 255; data[j + 3] = clothes[i] * 255;
  }
  return { width, height, data };
}

/** Analyse a still photo. */
export async function analyseImage(src: Source, w: number, h: number): Promise<{ body: Body | null; masks: Masks | null }> {
  const v = await loadVision();
  await setMode(v, 'IMAGE');
  const pose = v.pose.detect(src as HTMLCanvasElement);
  const body = toBody(pose.landmarks[0], w, h);
  const seg = v.seg.segment(src as HTMLCanvasElement);
  const masks = packMasks(seg.confidenceMasks);
  seg.close();
  return { body, masks };
}

/** Analyse one live camera frame. Segmentation is the slower half, so callers can skip it on some frames. */
export async function analyseFrame(src: Source, w: number, h: number, ts: number, withMasks: boolean): Promise<{ body: Body | null; masks: Masks | null }> {
  const v = await loadVision();
  await setMode(v, 'VIDEO');
  const body = toBody(v.pose.detectForVideo(src as HTMLCanvasElement, ts).landmarks[0], w, h);
  let masks: Masks | null = null;
  if (withMasks) {
    const seg = v.seg.segmentForVideo(src as HTMLCanvasElement, ts);
    masks = packMasks(seg.confidenceMasks);
    seg.close();
  }
  return { body, masks };
}

/** Exponential smoothing for live tracking, so the garment doesn't jitter. */
export function smoothBody(prev: Body | null, next: Body, k = 0.45): Body {
  if (!prev) return next;
  const m = (a: Pt, b: Pt): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  return {
    shoulderL: m(prev.shoulderL, next.shoulderL), shoulderR: m(prev.shoulderR, next.shoulderR),
    elbowL: m(prev.elbowL, next.elbowL), elbowR: m(prev.elbowR, next.elbowR),
    wristL: m(prev.wristL, next.wristL), wristR: m(prev.wristR, next.wristR),
    hipL: m(prev.hipL, next.hipL), hipR: m(prev.hipR, next.hipR),
    confidence: next.confidence,
  };
}

/** A plausible body from two tapped shoulder points (fallback when detection fails). */
export function bodyFromShoulders(a: Pt, b: Pt): Body {
  const [l, r] = a.x <= b.x ? [a, b] : [b, a];
  const vx = r.x - l.x, vy = r.y - l.y, span = Math.hypot(vx, vy);
  const dx = -vy / span, dy = vx / span; // "down" perpendicular to the shoulder line
  const along = (p: Pt, k: number, d: number): Pt => ({ x: p.x + dx * d * span + (vx / span) * k * span, y: p.y + dy * d * span + (vy / span) * k * span });
  // Joints sit inside the seams; hips ~1.3 shoulder-widths down; arms hanging.
  const sL = along(l, 0.08, 0.02), sR = along(r, -0.08, 0.02);
  return {
    shoulderL: sL, shoulderR: sR,
    elbowL: along(sL, -0.12, 0.85), elbowR: along(sR, 0.12, 0.85),
    wristL: along(sL, -0.08, 1.6), wristR: along(sR, 0.08, 1.6),
    hipL: along(sL, 0.14, 1.3), hipR: along(sR, -0.14, 1.3),
    confidence: 0.5,
  };
}
