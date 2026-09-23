// Puts the on-device body-tracking runtime and models under public/ so the Trial Room loads them
// from this site: MediaPipe's WASM (copied from node_modules) and two models (downloaded once).
// Runs before dev and build; both folders are git-ignored.
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const wasmSrc = new URL('node_modules/@mediapipe/tasks-vision/wasm/', root);
const wasmDst = new URL('public/mediapipe/', root);
const models = new URL('public/models/', root);
mkdirSync(wasmDst, { recursive: true });
mkdirSync(models, { recursive: true });

for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']) {
  copyFileSync(new URL(f, wasmSrc), new URL(f, wasmDst));
}

const MODELS = {
  'pose_landmarker_lite.task': 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  'selfie_multiclass_256x256.tflite': 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
};
for (const [name, url] of Object.entries(MODELS)) {
  const dst = new URL(name, models);
  if (existsSync(dst) && statSync(dst).size > 100_000) continue;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
  console.log(`downloaded ${name}`);
}
console.log('vision assets ready');
