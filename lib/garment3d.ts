import * as THREE from 'three';
import { TEE_PATH, SWEAT_PATH, type GarmentKind } from './garment';

/**
 * A 3D tee or sweatshirt built from the flat garment outline (400 × 440 units).
 *
 * The outline is sampled on a grid and "inflated": each point is pushed forward (front panel)
 * or back (back panel) by an amount that grows with its distance from the outline, so the torso
 * gets a rounded chest while sleeves stay slimmer. Front and back meet at the side seams, hem and
 * sleeve ends. The neckline is left open, with a ribbed collar around it.
 * Textures are the same flat renders the Trial Room uses, so print and colour match exactly.
 */

export interface Garment3DOptions {
  kind: GarmentKind;
  front: HTMLCanvasElement;   // garment + print, transparent outside the outline
  back: HTMLCanvasElement;    // garment only
  color: string;              // for the collar rib
  cols?: number;              // grid resolution across (rows follow the aspect ratio)
}

const W = 400, H = 440;
const DEPTH = 62;      // max half-depth of the torso, in garment units
const REACH = 96;      // distance from a seam at which the body reaches full depth

type Pt = [number, number];

/** Flatten the SVG outline (M/L/Q/Z only) into a closed polyline. */
function outline(kind: GarmentKind): Pt[] {
  const d = kind === 'tee' ? TEE_PATH : SWEAT_PATH;
  const tok = d.match(/[MLQZ]|-?\d+(?:\.\d+)?/g)!;
  const pts: Pt[] = [];
  let i = 0, cur: Pt = [0, 0];
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    const c = tok[i++];
    if (c === 'M' || c === 'L') { cur = [num(), num()]; pts.push(cur); }
    else if (c === 'Q') {
      const q: Pt = [num(), num()], e: Pt = [num(), num()], s0 = cur;
      for (let n = 1; n <= 16; n++) {
        const t = n / 16, u = 1 - t;
        pts.push([u * u * s0[0] + 2 * u * t * q[0] + t * t * e[0], u * u * s0[1] + 2 * u * t * q[1] + t * t * e[1]]);
      }
      cur = e;
    }
  }
  return pts;
}

// Openings: the neckline and the torso hem. Depth isn't pulled to zero there, so they stay open.
const isOpening = (a: Pt, b: Pt, kind: GarmentKind) => {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  if (my < 86 && mx > 140 && mx < 260) return true;                         // neck
  const hemY = kind === 'tee' ? 400 : 380;
  return my > hemY && mx > 70 && mx < 330;                                  // hem
};

function insideMask(kind: GarmentKind, cols: number, rows: number) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 4;
  const g = c.getContext('2d')!;
  const path = new Path2D(kind === 'tee' ? TEE_PATH : SWEAT_PATH);
  const inside = new Uint8Array((cols + 1) * (rows + 1));
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      inside[j * (cols + 1) + i] = g.isPointInPath(path, (i / cols) * W, (j / rows) * H) ? 1 : 0;
    }
  }
  return inside;
}

function nearest(x: number, y: number, segs: [Pt, Pt][]): { d: number; p: Pt } {
  let best = 1e18, px = x, py = y;
  for (const [a, b] of segs) {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / (vx * vx + vy * vy || 1)));
    const qx = a[0] + t * vx, qy = a[1] + t * vy;
    const dd = (x - qx) ** 2 + (y - qy) ** 2;
    if (dd < best) { best = dd; px = qx; py = qy; }
  }
  return { d: Math.sqrt(best), p: [px, py] };
}

/**
 * Surface points on a grid. Inside nodes keep their position; nodes just outside are snapped
 * onto the outline so front and back panels meet exactly at the seams (no staircase edge).
 * Depth follows an elliptical cross-section of the distance to the closed seams.
 */
function surface(kind: GarmentKind, cols: number, rows: number, inside: Uint8Array) {
  const poly = outline(kind);
  const all: [Pt, Pt][] = [], closed: [Pt, Pt][] = [];
  for (let n = 0; n < poly.length; n++) {
    const a = poly[n], b = poly[(n + 1) % poly.length];
    all.push([a, b]);
    if (!isOpening(a, b, kind)) closed.push([a, b]);
  }
  const nx = cols + 1, count = nx * (rows + 1);
  const xy = new Float32Array(count * 2), depth = new Float32Array(count);
  const depthOf = (x: number, y: number) => {
    const t = Math.min(1, nearest(x, y, closed).d / REACH);
    return DEPTH * Math.sqrt(1 - (1 - t) * (1 - t));
  };
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const k = j * nx + i;
      let x = (i / cols) * W, y = (j / rows) * H;
      if (!inside[k]) [x, y] = nearest(x, y, all).p;
      xy[k * 2] = x; xy[k * 2 + 1] = y;
      depth[k] = depthOf(x, y);
    }
  }
  return { xy, depth };
}

function panel(front: boolean, cols: number, rows: number, inside: Uint8Array, xy: Float32Array, depth: Float32Array, tex: THREE.Texture) {
  const nx = cols + 1;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const map = new Int32Array(nx * (rows + 1)).fill(-1);
  // Keep a one-node margin outside the outline; the texture's alpha trims the exact edge.
  const near = (i: number, j: number) => {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a <= cols && b <= rows && inside[b * nx + a]) return true;
    }
    return false;
  };
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      if (!near(i, j)) continue;
      const k = j * nx + i;
      const x = xy[k * 2], y = xy[k * 2 + 1];
      const z = depth[k] * (front ? 1 : -0.86);
      map[k] = pos.length / 3;
      pos.push(x - W / 2, H / 2 - y, z);
      uv.push(front ? x / W : 1 - x / W, 1 - y / H);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = map[j * nx + i], b = map[j * nx + i + 1], c = map[(j + 1) * nx + i], d = map[(j + 1) * nx + i + 1];
      if (a < 0 || b < 0 || c < 0 || d < 0) continue;
      if (front) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // alphaTest trims anything that bridges gaps between sleeve and body (outside the outline).
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.92, metalness: 0 });
  return new THREE.Mesh(geo, mat);
}

function canvasTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Build the garment. Units: 1 = 100 garment units, centred on the origin, facing +Z. */
export function buildGarment3D(o: Garment3DOptions): THREE.Group {
  const cols = o.cols ?? 110;
  const rows = Math.round((cols * H) / W);
  const inside = insideMask(o.kind, cols, rows);
  const { xy, depth } = surface(o.kind, cols, rows, inside);

  const group = new THREE.Group();
  group.add(panel(true, cols, rows, inside, xy, depth, canvasTexture(o.front)));
  group.add(panel(false, cols, rows, inside, xy, depth, canvasTexture(o.back)));

  // Ribbed collar: a tube around the open neckline, front curve then back curve.
  const nx = cols + 1;
  const depthAt = (x: number, y: number) => {
    const i = Math.round((x / W) * cols), j = Math.round((y / H) * rows);
    for (let dj = 0; dj < 12; dj++) { const k = (j + dj) * nx + i; if (inside[k]) return depth[k]; }
    return 20;
  };
  const neckY = (x: number) => { const t = (x - 150) / 100; return (1 - t) * (1 - t) * 38 + 2 * (1 - t) * t * 82 + t * t * 38 - 2; };
  const pts: THREE.Vector3[] = [];
  for (let n = 0; n <= 16; n++) { const x = 150 + (100 * n) / 16; const y = n === 0 || n === 16 ? 40 : neckY(x) + 4; pts.push(new THREE.Vector3(x - W / 2, H / 2 - y, depthAt(x, y + 4) * 0.98)); }
  for (let n = 15; n >= 1; n--) { const x = 150 + (100 * n) / 16; pts.push(new THREE.Vector3(x - W / 2, H / 2 - 44 + Math.sin((n / 16) * Math.PI) * 4, -depthAt(x, 60) * 0.8)); }
  const collar = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, 5, 10, true),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(o.color).multiplyScalar(0.8), roughness: 0.95 }),
  );
  group.add(collar);

  // Inside of the neck opening reads as shadow.
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(o.color).multiplyScalar(0.25) }),
  );
  hole.scale.set(46, 1, depthAt(200, 70) * 0.8);
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(0, H / 2 - 46, 0);
  group.add(hole);

  group.scale.setScalar(0.01);
  return group;
}

export function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      (mat as THREE.MeshStandardMaterial).map?.dispose();
      mat.dispose();
    }
  });
}
