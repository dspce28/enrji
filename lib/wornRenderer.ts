'use client';

import * as THREE from 'three';
import type { Body, Masks, Pt } from './bodyTracking';
import type { GarmentKind } from './garment';
import { SHADE_MAX, type ClothesMap } from './restyle';

/**
 * Composites a garment onto a photo or live camera frame so it looks worn:
 * - the flat garment is warped onto the body (torso between shoulders and hips, sleeves along the arms);
 * - hair, face and hands/forearms stay in front of it (segmentation masks);
 * - the photo's own light and folds are transferred onto the fabric.
 * With a ClothesMap ("restyle", see restyle.ts) it instead re-dresses the person's own top: the top is
 * recoloured by its real shading, and the print is laid on with the same shading, clipped to the fabric.
 * Coordinates are image pixels with y pointing down.
 */

export interface Fit { scale: number; length: number; dx: number; dy: number }
export const DEFAULT_FIT: Fit = { scale: 1, length: 1, dx: 0, dy: 0 };

const GW = 400, GH = 440;
const SEAM_L = { x: 78, y: 58 }, SEAM_R = { x: 322, y: 58 };
const GEO = {
  tee: { hemY: 420, hemL: 86, hemR: 314, sleeveEnd: { x: 28, y: 157 }, lengthK: 1.34, sleeveFollow: 0.75 },
  sweatshirt: { hemY: 402, hemL: 82, hemR: 318, sleeveEnd: { x: 27, y: 395 }, lengthK: 1.3, sleeveFollow: 1 },
};

const vert = /* glsl */ `
  attribute float sleeve;
  varying vec2 vUv;
  varying vec2 vImg;
  varying float vSleeve;
  void main() {
    vUv = uv;
    vImg = position.xy;
    vSleeve = sleeve;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Light transfer shared by the garment and the fill pass.
// Folds and shadows are read from blurred copies of the photo (mip levels), so small, sharp detail
// such as the print on the clothes being replaced does not come through; only broad shading does.
const shading = /* glsl */ `
  uniform sampler2D photo;
  uniform vec2 size;
  uniform float realism;
  uniform sampler2D restyle;
  uniform float hasRestyle;
  float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  // Restyle: x = the fabric's real shading (linear light ratio), y = how much of this pixel is the top.
  vec2 restyleAt(vec2 suv) { vec4 r = texture2D(restyle, suv); return vec2(r.r * ${SHADE_MAX.toFixed(2)}, r.g); }
  vec3 shadeLike(vec3 base, vec2 suv, float onBody) {
    // Relative shading only. Absolute brightness and colour would come from the clothes being
    // replaced (a dark top would turn a white tee grey), so they are not transferred.
    vec3 pf = textureLod(photo, suv, 5.6).rgb;   // body roundness, big folds, side shadow
    vec3 pm = textureLod(photo, suv, 6.8).rgb;   // light around this part of the body
    float ratio = clamp(lum(pf) / max(lum(pm), 0.03), 0.93, 1.07);
    return base * mix(1.0, ratio, realism * onBody);
  }
`;

const frag = /* glsl */ `
  uniform sampler2D garment;
  uniform sampler2D masks;
  uniform float hasMasks;
  uniform float opacity;
  uniform vec4 armL;   // elbow.xy, wrist.xy (image px)
  uniform vec4 armR;
  uniform float armRadius;
  varying vec2 vUv;
  varying vec2 vImg;
  varying float vSleeve;
  ${shading}

  float segDist(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b - a; float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
    return length(p - (a + t * ab));
  }

  void main() {
    vec4 g = texture2D(garment, vUv);
    if (g.a < 0.01) discard;
    vec2 suv = vImg / size;
    if (hasRestyle > 0.5) {
      // Print on the person's own top: follows its folds, only where the fabric is.
      vec2 rs = restyleAt(suv);
      float a = g.a * smoothstep(0.25, 0.75, rs.y) * opacity;
      if (a < 0.01) discard;
      gl_FragColor = vec4(g.rgb * mix(1.0, rs.x, realism), a);
      #include <colorspace_fragment>
      return;
    }
    vec4 m = hasMasks > 0.5 ? texture2D(masks, suv) : vec4(0.0, 0.0, 0.0, 1.0);
    vec3 col = shadeLike(g.rgb, suv, clamp(m.a + m.b, 0.0, 1.0));

    // What stays in front of the garment: hair, face, and forearms/hands crossing the torso.
    float occ = max(m.r, m.g);
    if (hasMasks > 0.5) {
      float d = min(segDist(vImg, armL.xy, armL.zw + (armL.zw - armL.xy) * 0.35), segDist(vImg, armR.xy, armR.zw + (armR.zw - armR.xy) * 0.35));
      float nearArm = 1.0 - smoothstep(armRadius, armRadius * 1.6, d);
      occ = max(occ, m.b * nearArm * (1.0 - vSleeve * 0.85));
    }
    float a = g.a * (1.0 - smoothstep(0.35, 0.75, occ)) * opacity;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;

// Fill pass: the wearer's own top, wherever it shows around the new garment (wider cut, longer
// hem, sleeves), is recoloured to the new fabric so the old clothes are replaced, not peeking out.
const fillVert = /* glsl */ `
  varying vec2 vImg;
  void main() {
    vImg = (modelMatrix * vec4(position, 1.0)).xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fillFrag = /* glsl */ `
  uniform sampler2D masks;
  uniform vec3 base;
  uniform vec2 torso[4];   // seam L, seam R, hem R, hem L (image px), already padded
  uniform vec4 upperL;     // shoulder.xy, elbow (or sleeve end).xy — follows the detected arm
  uniform vec4 upperR;
  uniform vec4 lowerL;     // elbow.xy, wrist.xy (sweatshirt only; collapsed for a tee)
  uniform vec4 lowerR;
  uniform float sleeveRadius;
  uniform float opacity;
  varying vec2 vImg;
  ${shading}

  float segDist(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b - a; float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
    return length(p - (a + t * ab));
  }
  float side(vec2 p, vec2 a, vec2 b) { vec2 e = b - a, q = p - a; return e.x * q.y - e.y * q.x; }
  float inQuad(vec2 p) {
    float s0 = side(p, torso[0], torso[1]), s1 = side(p, torso[1], torso[2]), s2 = side(p, torso[2], torso[3]), s3 = side(p, torso[3], torso[0]);
    return ((s0 >= 0.0 && s1 >= 0.0 && s2 >= 0.0 && s3 >= 0.0) || (s0 <= 0.0 && s1 <= 0.0 && s2 <= 0.0 && s3 <= 0.0)) ? 1.0 : 0.0;
  }

  void main() {
    vec2 suv = vImg / size;
    if (hasRestyle > 0.5) {
      // Recolour the person's top: new colour, their fabric's real folds and light.
      vec2 rs = restyleAt(suv);
      float a = smoothstep(0.08, 0.6, rs.y) * opacity;
      if (a < 0.01) discard;
      gl_FragColor = vec4(base * mix(1.0, rs.x, realism), a);
      #include <colorspace_fragment>
      return;
    }
    vec4 m = texture2D(masks, suv);
    float d = min(min(segDist(vImg, upperL.xy, upperL.zw), segDist(vImg, upperR.xy, upperR.zw)),
                  min(segDist(vImg, lowerL.xy, lowerL.zw), segDist(vImg, lowerR.xy, lowerR.zw)));
    float region = max(inQuad(vImg), 1.0 - smoothstep(sleeveRadius, sleeveRadius * 1.25, d));
    float a = smoothstep(0.35, 0.7, m.a) * (1.0 - smoothstep(0.3, 0.6, max(m.r, m.g))) * region * opacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(shadeLike(base, suv, 1.0), a);
    #include <colorspace_fragment>
  }
`;

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export class WornRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);
  private photoTex: THREE.Texture | null = null;
  private photoMesh: THREE.Mesh;
  private garmentMesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private fillMesh: THREE.Mesh;
  private fillMat: THREE.ShaderMaterial;
  private fillOn = false;
  private maskTex: THREE.DataTexture | null = null;
  private restyleTex: THREE.DataTexture | null = null;
  private cols = 44;
  private rows = 48;
  private w = 1;
  private h = 1;
  kind: GarmentKind = 'tee';
  printOnly = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.photoMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    this.photoMesh.renderOrder = 0;
    this.scene.add(this.photoMesh);

    const geo = new THREE.BufferGeometry();
    const n = (this.cols + 1) * (this.rows + 1);
    const uv = new Float32Array(n * 2), idx: number[] = [];
    for (let j = 0; j <= this.rows; j++) for (let i = 0; i <= this.cols; i++) {
      const k = j * (this.cols + 1) + i;
      uv[k * 2] = i / this.cols; uv[k * 2 + 1] = j / this.rows;
    }
    for (let j = 0; j < this.rows; j++) for (let i = 0; i < this.cols; i++) {
      const a = j * (this.cols + 1) + i, b = a + 1, c = a + this.cols + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('sleeve', new THREE.BufferAttribute(new Float32Array(n), 1));
    geo.setIndex(idx);

    this.material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, side: THREE.DoubleSide, depthTest: false,
      uniforms: {
        garment: { value: null }, photo: { value: null }, masks: { value: null },
        size: { value: new THREE.Vector2(1, 1) }, hasMasks: { value: 0 }, realism: { value: 0.85 }, opacity: { value: 1 },
        armL: { value: new THREE.Vector4() }, armR: { value: new THREE.Vector4() }, armRadius: { value: 30 },
        restyle: { value: null }, hasRestyle: { value: 0 },
      },
    });
    const u = this.material.uniforms;
    this.fillMat = new THREE.ShaderMaterial({
      vertexShader: fillVert, fragmentShader: fillFrag, transparent: true, side: THREE.DoubleSide, depthTest: false,
      uniforms: {
        photo: u.photo, masks: u.masks, size: u.size, realism: u.realism, opacity: u.opacity,
        restyle: u.restyle, hasRestyle: u.hasRestyle,
        base: { value: new THREE.Color() },
        torso: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] },
        upperL: { value: new THREE.Vector4() }, upperR: { value: new THREE.Vector4() },
        lowerL: { value: new THREE.Vector4() }, lowerR: { value: new THREE.Vector4() }, sleeveRadius: { value: 30 },
      },
    });
    this.fillMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.fillMat);
    this.fillMesh.renderOrder = 1;
    this.fillMesh.frustumCulled = false;
    this.fillMesh.visible = false;
    this.scene.add(this.fillMesh);

    this.garmentMesh = new THREE.Mesh(geo, this.material);
    this.garmentMesh.renderOrder = 2;
    this.garmentMesh.frustumCulled = false;
    this.garmentMesh.visible = false;
    this.scene.add(this.garmentMesh);
  }

  /** Photo or camera frame (a canvas that is redrawn each frame for live video). */
  setPhoto(src: HTMLCanvasElement | ImageBitmap | HTMLImageElement, w: number, h: number) {
    this.w = w; this.h = h;
    this.photoTex?.dispose();
    const t = new THREE.Texture(src as HTMLCanvasElement);
    t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.needsUpdate = true;
    this.photoTex = t;
    (this.photoMesh.material as THREE.MeshBasicMaterial).map = t;
    (this.photoMesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
    this.photoMesh.scale.set(w, h, 1);
    this.photoMesh.position.set(w / 2, h / 2, 0);
    this.fillMesh.scale.set(w, h, 1);
    this.fillMesh.position.set(w / 2, h / 2, 0);
    this.material.uniforms.photo.value = t;
    this.material.uniforms.size.value.set(w, h);
    this.camera.left = 0; this.camera.right = w; this.camera.top = 0; this.camera.bottom = h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
  }

  /** Call after redrawing the camera canvas. */
  photoChanged() { if (this.photoTex) this.photoTex.needsUpdate = true; }

  /** `base` is the fabric colour the wearer's own top is recoloured to (overlay: around a full garment; restyle: all of it). */
  setGarment(canvas: HTMLCanvasElement, kind: GarmentKind, printOnly: boolean, base?: string) {
    this.kind = kind;
    this.printOnly = printOnly;
    this.fillOn = !!base;   // overlay: recolour around a full garment; restyle: recolour the whole top
    if (base) (this.fillMat.uniforms.base.value as THREE.Color).set(base);
    const old = this.material.uniforms.garment.value as THREE.Texture | null;
    const t = new THREE.CanvasTexture(canvas);
    t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    this.material.uniforms.garment.value = t;
    old?.dispose();
  }

  /** Re-dress the person's own top (null: fall back to the garment overlay). */
  setRestyle(c: ClothesMap | null) {
    const u = this.material.uniforms;
    if (!c) { u.hasRestyle.value = 0; return; }
    if (!this.restyleTex || this.restyleTex.image.width !== c.width || this.restyleTex.image.height !== c.height) {
      this.restyleTex?.dispose();
      this.restyleTex = new THREE.DataTexture(c.data, c.width, c.height, THREE.RGBAFormat);
      this.restyleTex.flipY = false;
      this.restyleTex.magFilter = THREE.LinearFilter;
      this.restyleTex.minFilter = THREE.LinearFilter;
      u.restyle.value = this.restyleTex;
    } else {
      (this.restyleTex.image.data as Uint8Array).set(c.data);
    }
    this.restyleTex.needsUpdate = true;
    u.hasRestyle.value = 1;
  }

  get restyling() { return this.material.uniforms.hasRestyle.value > 0.5; }

  setMasks(m: Masks | null) {
    if (!m) { this.material.uniforms.hasMasks.value = 0; return; }
    if (!this.maskTex || this.maskTex.image.width !== m.width || this.maskTex.image.height !== m.height) {
      this.maskTex?.dispose();
      this.maskTex = new THREE.DataTexture(m.data, m.width, m.height, THREE.RGBAFormat);
      this.maskTex.flipY = false;
      this.maskTex.magFilter = THREE.LinearFilter;
      this.maskTex.minFilter = THREE.LinearFilter;
      this.material.uniforms.masks.value = this.maskTex;
    } else {
      (this.maskTex.image.data as Uint8Array).set(m.data);
    }
    this.maskTex.needsUpdate = true;
    this.material.uniforms.hasMasks.value = 1;
  }

  setLook(realism: number, opacity: number) {
    this.material.uniforms.realism.value = realism;
    this.material.uniforms.opacity.value = opacity;
  }

  /** Warp the garment onto a body. */
  setBody(b: Body | null, fit: Fit) {
    if (!b) { this.garmentMesh.visible = false; this.fillMesh.visible = false; return; }
    const geo = GEO[this.kind];
    // Fit adjustments: scale about the chest, offset, longer/shorter.
    const chest = lerp(lerp(b.shoulderL, b.shoulderR, 0.5), lerp(b.hipL, b.hipR, 0.5), 0.35);
    const adj = (p: Pt): Pt => ({ x: chest.x + (p.x - chest.x) * fit.scale + fit.dx, y: chest.y + (p.y - chest.y) * fit.scale + fit.dy });
    const sL0 = adj(b.shoulderL), sR0 = adj(b.shoulderR), hL0 = adj(b.hipL), hR0 = adj(b.hipR);

    // Seams sit a little outside and above the shoulder joints.
    const mid = lerp(sL0, sR0, 0.5);
    const vx = sR0.x - sL0.x, vy = sR0.y - sL0.y, span = Math.hypot(vx, vy) || 1;
    const ux = vx / span, uy = vy / span;          // across, image-left → right
    const nx = uy, ny = -ux;                        // "up" perpendicular (y is down)
    const seamHalf = span * 0.5 * 1.2;
    const SL = { x: mid.x - ux * seamHalf + nx * span * 0.07, y: mid.y - uy * seamHalf + ny * span * 0.07 };
    const SR = { x: mid.x + ux * seamHalf + nx * span * 0.07, y: mid.y + uy * seamHalf + ny * span * 0.07 };
    // Hem: along the torso axis, below the hips; width follows hips but never narrower than the chest.
    const hipMid = lerp(hL0, hR0, 0.5);
    const ax = hipMid.x - mid.x, ay = hipMid.y - mid.y;
    // Re-dressing the person's own top: the print sits on their top, which ends near the hips.
    const lengthK = this.material.uniforms.hasRestyle.value > 0.5 ? geo.lengthK * 0.86 : geo.lengthK;
    const hemC = { x: mid.x + ax * lengthK * fit.length, y: mid.y + ay * lengthK * fit.length };
    const hipHalf = Math.hypot(hR0.x - hL0.x, hR0.y - hL0.y) * 0.5;
    const hemHalf = Math.max(hipHalf * 1.55, seamHalf * ((geo.hemR - geo.hemL) / (SEAM_R.x - SEAM_L.x)));
    const HL = { x: hemC.x - ux * hemHalf, y: hemC.y - uy * hemHalf };
    const HR = { x: hemC.x + ux * hemHalf, y: hemC.y + uy * hemHalf };

    const k = Math.hypot(SR.x - SL.x, SR.y - SL.y) / (SEAM_R.x - SEAM_L.x);  // px per garment unit
    const theta0 = Math.atan2(SR.y - SL.y, SR.x - SL.x);
    const arm = (seamG: Pt, seamI: Pt, joint: Pt, elbow: Pt, wrist: Pt, side: 1 | -1) => {
      const end = this.kind === 'tee' ? elbow : wrist;
      const endG = side === -1 ? geo.sleeveEnd : { x: GW - geo.sleeveEnd.x, y: geo.sleeveEnd.y };
      const dG = { x: endG.x - seamG.x, y: endG.y - seamG.y };
      const lenG = Math.hypot(dG.x, dG.y);
      const defAng = Math.atan2(dG.y, dG.x) + theta0;
      const armAng = Math.atan2(end.y - joint.y, end.x - joint.x);
      let delta = Math.atan2(Math.sin(armAng - defAng), Math.cos(armAng - defAng));
      delta = Math.max(-1.3, Math.min(1.3, delta)) * geo.sleeveFollow;
      const reach = Math.hypot(end.x - joint.x, end.y - joint.y);
      const stretch = this.kind === 'tee' ? 1 : Math.max(0.75, Math.min(1.35, reach / (lenG * k)));
      const dirG = { x: dG.x / lenG, y: dG.y / lenG };
      const rot = theta0 + delta;
      const c = Math.cos(rot), s = Math.sin(rot);
      return (g: Pt): Pt => {
        const rx = g.x - seamG.x, ry = g.y - seamG.y;
        const along = rx * dirG.x + ry * dirG.y;
        const sx = rx + dirG.x * along * (stretch - 1), sy = ry + dirG.y * along * (stretch - 1);
        return { x: seamI.x + (c * sx - s * sy) * k, y: seamI.y + (s * sx + c * sy) * k };
      };
    };
    const sleeveL = arm(SEAM_L, SL, sL0, adj(b.elbowL), adj(b.wristL), -1);
    const sleeveR = arm(SEAM_R, SR, sR0, adj(b.elbowR), adj(b.wristR), 1);

    const torso = (g: Pt): Pt => {
      const v = (g.y - SEAM_L.y) / (geo.hemY - SEAM_L.y);
      const xl = SEAM_L.x + (geo.hemL - SEAM_L.x) * Math.max(0, v);
      const xr = SEAM_R.x + (geo.hemR - SEAM_R.x) * Math.max(0, v);
      const u = (g.x - xl) / (xr - xl);
      const top = lerp(SL, SR, u), bot = lerp(HL, HR, u);
      return lerp(top, bot, v);
    };

    const pos = this.garmentMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const sl = this.garmentMesh.geometry.getAttribute('sleeve') as THREE.BufferAttribute;
    for (let j = 0; j <= this.rows; j++) {
      for (let i = 0; i <= this.cols; i++) {
        const idx = j * (this.cols + 1) + i;
        const g = { x: (i / this.cols) * GW, y: (j / this.rows) * GH };
        const v = (g.y - SEAM_L.y) / (geo.hemY - SEAM_L.y);
        const xl = SEAM_L.x + (geo.hemL - SEAM_L.x) * Math.max(0, v);
        const xr = SEAM_R.x + (geo.hemR - SEAM_R.x) * Math.max(0, v);
        const t = torso(g);
        // Blend into the sleeve mapping across the armhole so nothing tears.
        const wl = smooth(xl + 6, xl - 22, g.x), wr = smooth(xr - 6, xr + 22, g.x);
        let p = t;
        if (wl > 0) p = lerp(t, sleeveL(g), wl);
        if (wr > 0) p = lerp(t, sleeveR(g), wr);
        pos.setXYZ(idx, p.x, p.y, 0);
        sl.setX(idx, Math.max(wl, wr));
      }
    }
    pos.needsUpdate = true;
    sl.needsUpdate = true;
    const u = this.material.uniforms;
    (u.armL.value as THREE.Vector4).set(adj(b.elbowL).x, adj(b.elbowL).y, adj(b.wristL).x, adj(b.wristL).y);
    (u.armR.value as THREE.Vector4).set(adj(b.elbowR).x, adj(b.elbowR).y, adj(b.wristR).x, adj(b.wristR).y);
    u.armRadius.value = span * 0.22;

    // Fill region: the torso a little wider and longer than the new garment, plus the sleeves.
    const f = this.fillMat.uniforms;
    // Only pixels the segmenter marks as clothes are touched, so the padding can be generous.
    const padX = span * 0.35, padUp = span * 0.3, padDown = span * 0.05;
    const out = (p: Pt, sx: number, sy: number): Pt => ({ x: p.x + ux * sx - nx * sy, y: p.y + uy * sx - ny * sy });
    const quad = [out(SL, -padX, -padUp), out(SR, padX, -padUp), out(HR, padX, padDown), out(HL, -padX, padDown)];
    (f.torso.value as THREE.Vector2[]).forEach((v, n) => v.set(quad[n].x, quad[n].y));
    const limb = (upper: THREE.Vector4, lower: THREE.Vector4, s0: Pt, e: Pt, w: Pt) => {
      if (this.kind === 'tee') {
        const end = lerp(s0, e, 0.6);   // a half sleeve stops above the elbow
        upper.set(s0.x, s0.y, end.x, end.y); lower.set(end.x, end.y, end.x, end.y);
      } else {
        upper.set(s0.x, s0.y, e.x, e.y); lower.set(e.x, e.y, w.x, w.y);
      }
    };
    limb(f.upperL.value, f.lowerL.value, sL0, adj(b.elbowL), adj(b.wristL));
    limb(f.upperR.value, f.lowerR.value, sR0, adj(b.elbowR), adj(b.wristR));
    f.sleeveRadius.value = span * (this.kind === 'tee' ? 0.24 : 0.2);
    this.fillMesh.visible = u.hasRestyle.value > 0.5 ? this.fillOn : this.fillOn && !this.printOnly && u.hasMasks.value > 0.5;
    this.garmentMesh.visible = true;
  }

  render() { this.renderer.render(this.scene, this.camera); }

  dispose() {
    this.photoTex?.dispose();
    this.maskTex?.dispose();
    this.restyleTex?.dispose();
    (this.material.uniforms.garment.value as THREE.Texture | null)?.dispose();
    this.material.dispose();
    this.fillMat.dispose();
    this.fillMesh.geometry.dispose();
    this.garmentMesh.geometry.dispose();
    this.photoMesh.geometry.dispose();
    (this.photoMesh.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}
