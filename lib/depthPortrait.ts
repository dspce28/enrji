'use client';

import * as THREE from 'three';

/**
 * "3D photos" of the catalogue's model shots. Each photo comes with a depth map and a cut-out mask
 * (made offline by scripts/depth-portraits.py). The photo is laid on a finely divided plane and every
 * vertex is pushed forward by its depth, so the person has real volume: turn it or walk past it and
 * the face, arms and body shift like a sculpture.
 *
 * - `cutout`: only the person, with a soft edge and a gold rim light — stands in space.
 * - `full`: the whole photo with gentle relief — for framed posters.
 */

export interface PortraitTextures { map: THREE.Texture; depth: THREE.Texture; mask: THREE.Texture }
export interface PortraitOptions {
  mode: 'cutout' | 'full';
  height: number;          // world units
  relief?: number;         // depth in world units (default: 0.28 × height for cut-outs, 0.07 × height for posters)
  segments?: number;       // grid resolution along the height
  rim?: THREE.ColorRepresentation;
}

const loader = typeof window !== 'undefined' ? new THREE.TextureLoader() : null;
const cache = new Map<string, Promise<PortraitTextures>>();

export function portraitUrls(handle: string) {
  return { map: `/store/${handle}.jpg`, depth: `/store/${handle}-depth.png`, mask: `/store/${handle}-mask.png` };
}

export function loadPortrait(handle: string): Promise<PortraitTextures> {
  let p = cache.get(handle);
  if (!p) {
    const u = portraitUrls(handle);
    const one = (url: string, srgb: boolean) => loader!.loadAsync(url).then((t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      return t;
    });
    p = Promise.all([one(u.map, true), one(u.depth, false), one(u.mask, false)]).then(([map, depth, mask]) => ({ map, depth, mask }));
    p.catch(() => cache.delete(handle));
    cache.set(handle, p);
  }
  return p;
}

const vert = /* glsl */ `
  uniform sampler2D depthMap;
  uniform float relief;
  uniform float time;
  uniform float breathe;
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vUv = uv;
    float d = texture2D(depthMap, uv).r;
    vDepth = d;
    vec3 p = position;
    p.z += d * relief;
    // Barely-there breathing so figures feel alive, strongest through the chest.
    float chest = smoothstep(0.25, 0.55, uv.y) * (1.0 - smoothstep(0.55, 0.85, uv.y));
    p.x *= 1.0 + sin(time * 1.3) * 0.006 * chest * breathe;
    p.z += sin(time * 1.3) * relief * 0.03 * chest * d * breathe;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const frag = /* glsl */ `
  uniform sampler2D map;
  uniform sampler2D depthMap;
  uniform sampler2D maskMap;
  uniform float cutout;
  uniform vec2 texel;
  uniform vec3 rimColor;
  uniform float rimStrength;
  uniform float glow;
  uniform float reveal;
  uniform float brightness;
  uniform float bottomFade;
  varying vec2 vUv;
  varying float vDepth;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }

  void main() {
    vec3 col = texture2D(map, vUv).rgb;
    float m = texture2D(maskMap, vUv).r;
    float alpha = 1.0;
    if (cutout > 0.5) {
      alpha = smoothstep(0.3, 0.7, m);
      alpha *= smoothstep(0.0, bottomFade + 1e-4, vUv.y);   // cropped legs dissolve into the light
      if (alpha < 0.02) discard;
    }

    // Sculpting light from the depth map's slope: a warm key from the upper left.
    float dx = texture2D(depthMap, vUv + vec2(texel.x, 0.0)).r - texture2D(depthMap, vUv - vec2(texel.x, 0.0)).r;
    float dy = texture2D(depthMap, vUv + vec2(0.0, texel.y)).r - texture2D(depthMap, vUv - vec2(0.0, texel.y)).r;
    vec3 n = normalize(vec3(-dx * 6.0, -dy * 6.0, 1.0));
    float key = dot(n, normalize(vec3(-0.5, 0.6, 0.8)));
    col *= brightness * (0.9 + 0.22 * key);

    // Gold rim on the silhouette (cut-outs) — reads as back light in a dark room.
    if (cutout > 0.5) {
      float e = 0.0;
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.785398;
        e += texture2D(maskMap, vUv + vec2(cos(a), sin(a)) * texel * 5.0).r;
      }
      float edge = clamp(1.0 - e / 8.0, 0.0, 1.0) * smoothstep(0.4, 0.9, m);
      col += rimColor * edge * (rimStrength + glow * 1.5);
    }
    col += rimColor * glow * 0.08;

    // Materialise: a noisy gold burn sweeping upward.
    if (reveal < 1.0) {
      float t = (1.0 - vUv.y) * 0.85 + (noise(vUv * 40.0) * 0.6 + noise(vUv * 9.0) * 0.4) * 0.15;
      float r = reveal * 1.12 - 0.04;
      if (t > r) discard;
      col += rimColor * (1.0 - smoothstep(0.0, 0.018, r - t)) * 1.8;
    }
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

export type PortraitMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

export function createPortrait(t: PortraitTextures, o: PortraitOptions): PortraitMesh {
  const img = t.map.image as { width: number; height: number };
  const aspect = img.width / img.height;
  const h = o.height, w = h * aspect;
  const seg = o.segments ?? (o.mode === 'cutout' ? 220 : 120);
  const geo = new THREE.PlaneGeometry(w, h, Math.round(seg * aspect), seg);
  const dimg = t.depth.image as { width: number; height: number };
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: o.mode === 'cutout',
    side: THREE.DoubleSide,
    uniforms: {
      map: { value: t.map },
      depthMap: { value: t.depth },
      maskMap: { value: t.mask },
      relief: { value: o.relief ?? h * (o.mode === 'cutout' ? 0.28 : 0.07) },
      cutout: { value: o.mode === 'cutout' ? 1 : 0 },
      texel: { value: new THREE.Vector2(1 / dimg.width, 1 / dimg.height) },
      rimColor: { value: new THREE.Color(o.rim ?? '#e8b75e') },
      rimStrength: { value: o.mode === 'cutout' ? 0.9 : 0 },
      glow: { value: 0 },
      reveal: { value: 1 },
      brightness: { value: 1 },
      bottomFade: { value: 0 },
      time: { value: 0 },
      breathe: { value: o.mode === 'cutout' ? 1 : 0 },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  // Pivot at the feet/bottom edge so figures stand on things.
  geo.translate(0, h / 2, 0);
  return mesh;
}

export function disposePortrait(m: PortraitMesh) {
  m.geometry.dispose();
  m.material.dispose();
}
