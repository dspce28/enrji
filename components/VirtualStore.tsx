'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useCart } from './cart';
import { cdn, inr, titleCase } from '@/lib/format';
import { Price } from './Price';
import { drawGarment } from '@/lib/garment';
import { buildGarment3D, disposeObject } from '@/lib/garment3d';

export interface StoreProduct {
  handle: string;
  title: string;
  baseName: string;
  kind: 'tee' | 'sweatshirt';
  image: string;
  price: number;
  compareAt: number | null;
  limited: boolean;
  colors: string[];
  look: { color: string; ink: string; artwork: string | null };
  variants: { id: number; size: string; color: string | null; available: boolean; price: number; compareAt: number | null; image: string | null }[];
}

/** 3D garment for a product, built from its real colour and print. */
async function garmentFor(p: StoreProduct, cols: number) {
  let art: HTMLImageElement | null = null;
  if (p.look.artwork) {
    art = new Image();
    art.src = p.look.artwork;
    try { await art.decode(); } catch { art = null; }
  }
  const spec = { kind: p.kind, color: p.look.color, ink: p.look.ink, slogan: p.baseName, artwork: art };
  return buildGarment3D({
    kind: p.kind, color: p.look.color, cols,
    front: drawGarment(spec, { scale: 1.3, shading: false }),
    back: drawGarment(spec, { scale: 0.8, shading: false, noPrint: true }),
  });
}

/** Walk up from a hit mesh to the object that carries the product. */
function owner(o: THREE.Object3D | null): THREE.Object3D | null {
  while (o && !o.userData.p) o = o.parent;
  return o;
}

const ROOM = 16;          // half-width of the hall
const EYE = 1.7;
const PEDESTAL_R = 2.4;
const GOLD = '#d9ab52';

/** Display positions along the back, left, right and front walls, facing inward. */
function slots(n: number) {
  const along = [-10.5, -3.5, 3.5, 10.5];
  const inset = ROOM - 0.25;
  return [
    ...along.map((x) => ({ x, z: -inset, ry: 0 })),
    ...along.map((z) => ({ x: -inset, z, ry: Math.PI / 2 })),
    ...along.map((z) => ({ x: inset, z, ry: -Math.PI / 2 })),
    ...[-10.5, 10.5, -5.5, 5.5].map((x) => ({ x, z: inset, ry: Math.PI })),
  ].slice(0, n);
}

function textTexture(text: string, { w, h, font, color, glow }: { w: number; h: number; font: string; color: string; glow?: string }) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  let size = parseInt(/(\d+)px/.exec(font)![1], 10);
  g.font = font;
  while (g.measureText(text).width > w * 0.92 && size > 16) { size -= 3; g.font = font.replace(/\d+px/, `${size}px`); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (glow) { g.shadowColor = glow; g.shadowBlur = 28; }
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2);
  g.shadowBlur = 0;
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default function VirtualStore({ products }: { products: StoreProduct[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StoreProduct | null>(null);
  const [guided, setGuided] = useState(false);
  const controls = useRef<{ startTour(): void; stopTour(): void; reset(): void; key(k: string, down: boolean): void } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch {
      setError('Your device does not support 3D graphics, so the virtual store cannot load.');
      setLoading(false);
      return;
    }
    let disposed = false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#070707');
    scene.fog = new THREE.Fog('#070707', 16, 46);
    const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 120);
    const disposables: { dispose(): void }[] = [];
    const track = <T extends { dispose(): void }>(o: T) => (disposables.push(o), o);

    // Warm, gallery-style light.
    scene.add(new THREE.HemisphereLight('#ffe9c7', '#0a0806', 0.7));
    scene.add(new THREE.AmbientLight('#ffffff', 0.18));
    for (const [x, z] of [[-9, -9], [9, -9], [-9, 9], [9, 9], [0, 0]]) {
      const l = new THREE.PointLight('#ffd8a0', 38, 26, 1.7);
      l.position.set(x, 6, z);
      scene.add(l);
    }

    // Polished dark floor with a faint gold grid.
    const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(ROOM * 2, ROOM * 2)), track(new THREE.MeshStandardMaterial({ color: '#0b0a09', metalness: 0.75, roughness: 0.26 })));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const grid = new THREE.GridHelper(ROOM * 2, 32, GOLD, '#2a2418');
    grid.position.y = 0.01;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.22;
    scene.add(grid);

    const wallMat = track(new THREE.MeshStandardMaterial({ color: '#12100e', roughness: 0.85 }));
    const wallGeo = track(new THREE.PlaneGeometry(ROOM * 2, 8));
    for (const [x, z, ry] of [[0, -ROOM, 0], [0, ROOM, Math.PI], [-ROOM, 0, Math.PI / 2], [ROOM, 0, -Math.PI / 2]]) {
      const w = new THREE.Mesh(wallGeo, wallMat);
      w.position.set(x, 4, z);
      w.rotation.y = ry;
      scene.add(w);
    }
    const ceil = new THREE.Mesh(track(new THREE.PlaneGeometry(ROOM * 2, ROOM * 2)), track(new THREE.MeshStandardMaterial({ color: '#060605' })));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 8;
    scene.add(ceil);

    // Gold light strips at floor and ceiling, plus ceiling rings.
    const goldMat = track(new THREE.MeshBasicMaterial({ color: GOLD, toneMapped: false }));
    const strip = track(new THREE.BoxGeometry(ROOM * 2, 0.04, 0.04));
    for (const y of [0.12, 7.2]) {
      for (const [x, z, ry] of [[0, -ROOM + 0.03, 0], [0, ROOM - 0.03, 0], [-ROOM + 0.03, 0, Math.PI / 2], [ROOM - 0.03, 0, Math.PI / 2]]) {
        const s = new THREE.Mesh(strip, goldMat);
        s.position.set(x, y, z);
        s.rotation.y = ry;
        scene.add(s);
      }
    }
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(track(new THREE.TorusGeometry(4 + i * 4, 0.025, 8, 128)), goldMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 7.9;
      scene.add(ring);
    }

    // Brand wall.
    const sign = new THREE.Mesh(track(new THREE.PlaneGeometry(9, 2.25)), track(new THREE.MeshBasicMaterial({ map: track(textTexture('ENRJI', { w: 1024, h: 256, font: '800 190px Unbounded, Arial Black, sans-serif', color: '#f2d38c', glow: GOLD })), transparent: true, toneMapped: false })));
    sign.position.set(0, 6.75, -ROOM + 0.05);
    scene.add(sign);
    const tag = new THREE.Mesh(track(new THREE.PlaneGeometry(9, 0.6)), track(new THREE.MeshBasicMaterial({ map: track(textTexture('FEEL IT · LIVE IT', { w: 1024, h: 72, font: '600 44px Inter, sans-serif', color: '#a29b90' })), transparent: true, toneMapped: false })));
    tag.position.set(0, 5.45, -ROOM + 0.05);
    scene.add(tag);

    // Drifting dust in the light.
    const count = 420;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { pos[i * 3] = (Math.random() - 0.5) * ROOM * 2; pos[i * 3 + 1] = Math.random() * 7.5; pos[i * 3 + 2] = (Math.random() - 0.5) * ROOM * 2; }
    const dustGeo = track(new THREE.BufferGeometry());
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dust = new THREE.Points(dustGeo, track(new THREE.PointsMaterial({ color: '#f2d38c', size: 0.035, transparent: true, opacity: 0.5, toneMapped: false })));
    scene.add(dust);

    // ---------- product displays ----------
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const loadTex = (src: string) => new Promise<THREE.Texture>((res, rej) => loader.load(cdn(src, 768), (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(track(t)); }, undefined, rej));

    const pickables: THREE.Mesh[] = [];
    const stations: { p: StoreProduct; pos: THREE.Vector3; yaw: number }[] = [];
    const frameGeo = track(new THREE.BoxGeometry(3.1, 4.05, 0.1));
    const frameMat = track(new THREE.MeshStandardMaterial({ color: '#1a1712', metalness: 0.85, roughness: 0.3 }));
    const edges = track(new THREE.EdgesGeometry(frameGeo));
    const posterGeo = track(new THREE.PlaneGeometry(2.85, 3.8));
    const labelGeo = track(new THREE.PlaneGeometry(1.9, 0.38));
    const plinthGeo = track(new THREE.BoxGeometry(2.0, 0.6, 1.1));
    const plinthEdges = track(new THREE.EdgesGeometry(plinthGeo));
    const POSTER_Y = 4.35, PLINTH_Z = 1.45;
    // Garments are built after the store opens, one at a time, so the first frame isn't delayed.
    const mounts: { p: StoreProduct; parent: THREE.Object3D; at: THREE.Vector3; scale: number; phase: number }[] = [];
    const spinning: { obj: THREE.Object3D; phase: number; baseY: number }[] = [];
    const built3d: THREE.Object3D[] = [];
    const centre = products.find((p) => p.limited) ?? products[0];
    const wall = products.filter((p) => p !== centre);
    const places = slots(wall.length);

    const build = Promise.all(wall.slice(0, places.length).map(async (p, i) => {
      const s = places[i];
      const g = new THREE.Group();
      g.position.set(s.x, 0, s.z);
      g.rotation.y = s.ry;
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.y = POSTER_Y;
      g.add(frame);
      const edgeMat = track(new THREE.LineBasicMaterial({ color: GOLD, toneMapped: false, transparent: true, opacity: 0.8 }));
      const e = new THREE.LineSegments(edges, edgeMat);
      e.position.copy(frame.position);
      g.add(e);
      let tex: THREE.Texture | null = null;
      try { tex = await loadTex(p.image); } catch { /* keep the empty frame */ }
      const poster = new THREE.Mesh(posterGeo, track(new THREE.MeshStandardMaterial({ map: tex, color: tex ? '#ffffff' : '#222', roughness: 0.6, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.28 })));
      poster.position.set(0, POSTER_Y, 0.06);
      poster.userData = { p, edgeMat };
      g.add(poster);
      pickables.push(poster);
      // Plinth with the product name on its face; the 3D garment turns above it.
      const plinth = new THREE.Mesh(plinthGeo, frameMat);
      plinth.position.set(0, 0.3, PLINTH_Z);
      g.add(plinth);
      const plinthEdge = new THREE.LineSegments(plinthEdges, edgeMat);
      plinthEdge.position.copy(plinth.position);
      g.add(plinthEdge);
      const label = new THREE.Mesh(labelGeo, track(new THREE.MeshBasicMaterial({ map: track(textTexture(`${titleCase(p.baseName).toUpperCase()}  ·  ${inr(p.price)}`, { w: 1024, h: 200, font: '700 64px Unbounded, Arial Black, sans-serif', color: '#f4efe6' })), transparent: true, toneMapped: false })));
      label.position.set(0, 0.3, PLINTH_Z + 0.56);
      g.add(label);
      const spot = new THREE.Mesh(track(new THREE.CircleGeometry(1.3, 48)), track(new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.08, toneMapped: false })));
      spot.rotation.x = -Math.PI / 2;
      spot.position.set(0, 0.02, PLINTH_Z);
      g.add(spot);
      mounts.push({ p, parent: g, at: new THREE.Vector3(0, 1.85, PLINTH_Z), scale: 0.0056, phase: i * 0.7 });
      scene.add(g);
      const fwd = new THREE.Vector3(Math.sin(s.ry), 0, Math.cos(s.ry));
      stations[i] = { p, pos: new THREE.Vector3(s.x, EYE, s.z).addScaledVector(fwd, 6.6), yaw: s.ry };
    }));

    // Centre stage: the limited edition, turning slowly in a beam of light.
    const featured = centre;
    const stage = new THREE.Group();
    const base = new THREE.Mesh(track(new THREE.CylinderGeometry(PEDESTAL_R - 0.5, PEDESTAL_R, 0.5, 64)), track(new THREE.MeshStandardMaterial({ color: '#16130f', metalness: 0.9, roughness: 0.25 })));
    base.position.y = 0.25;
    stage.add(base);
    const halo = new THREE.Mesh(track(new THREE.TorusGeometry(PEDESTAL_R - 0.25, 0.035, 8, 128)), goldMat);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.52;
    stage.add(halo);
    const beam = new THREE.Mesh(track(new THREE.CylinderGeometry(1.3, 2, 6, 48, 1, true)), track(new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.06, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
    beam.position.y = 3.2;
    stage.add(beam);
    if (featured) mounts.unshift({ p: featured, parent: stage, at: new THREE.Vector3(0, 2.45, 0), scale: 0.0085, phase: 0 });
    const holoBuild = Promise.resolve();
    scene.add(stage);
    if (featured) stations.push({ p: featured, pos: new THREE.Vector3(0, EYE, 6.5), yaw: 0 });

    // ---------- controls ----------
    const start = { pos: new THREE.Vector3(0, EYE, ROOM - 3), yaw: 0 };
    camera.position.copy(start.pos);
    let yaw = start.yaw, pitch = -0.02;
    const vel = new THREE.Vector3();
    const keys = new Set<string>();
    let auto: { i: number; wait: number } | null = null;

    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const keyMap: Record<string, string> = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
    const stopTour = () => { auto = null; setGuided(false); };
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea, button, a')) return;
      const k = keyMap[e.code];
      if (k) { keys.add(k); stopTour(); e.preventDefault(); }
      if (e.code === 'Escape') setSelected(null);
    };
    const onKeyUp = (e: KeyboardEvent) => { const k = keyMap[e.code]; if (k) keys.delete(k); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const pointer = new THREE.Vector2(-9, -9);
    const ray = new THREE.Raycaster();
    let drag: { x: number; y: number; moved: number } | null = null;
    let hovered: THREE.Object3D | null = null;
    const onDown = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.x = e.clientX; drag.y = e.clientY;
      if (drag.moved > 4) stopTour();
      yaw -= dx * 0.0042;
      pitch = Math.max(-1, Math.min(1, pitch - dy * 0.0042));
    };
    const onUp = () => {
      if (drag && drag.moved < 6) {
        ray.setFromCamera(pointer, camera);
        const hit = owner(ray.intersectObjects(pickables, true)[0]?.object ?? null);
        if (hit) { stopTour(); setSelected(hit.userData.p as StoreProduct); }
      }
      drag = null;
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    controls.current = {
      startTour: () => { if (stations.filter(Boolean).length) { auto = { i: 0, wait: 0 }; setGuided(true); } },
      stopTour,
      reset: () => { stopTour(); camera.position.copy(start.pos); yaw = start.yaw; pitch = -0.02; vel.set(0, 0, 0); setSelected(null); },
      key: (k, down) => { if (down) { keys.add(k); stopTour(); } else keys.delete(k); },
    };

    // ---------- loop ----------
    const clock = new THREE.Clock();
    const fwd = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      const stops = stations.filter(Boolean);
      if (auto && stops.length) {
        const s = stops[auto.i % stops.length];
        const d = camera.position.distanceTo(s.pos);
        camera.position.lerp(s.pos, 1 - Math.pow(0.15, dt));
        const dy = Math.atan2(Math.sin(s.yaw - yaw), Math.cos(s.yaw - yaw));
        yaw += dy * (1 - Math.pow(0.08, dt));
        pitch += (0.05 - pitch) * (1 - Math.pow(0.1, dt));
        if (d < 0.2) {
          if (auto.wait === 0) setSelected(s.p);
          auto.wait += dt;
          if (auto.wait > 4.5) { auto.i++; auto.wait = 0; }
        }
      } else {
        fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        right.set(-fwd.z, 0, fwd.x);
        move.set(0, 0, 0);
        if (keys.has('f')) move.add(fwd);
        if (keys.has('b')) move.sub(fwd);
        if (keys.has('r')) move.add(right);
        if (keys.has('l')) move.sub(right);
        if (move.lengthSq()) move.normalize().multiplyScalar(28 * dt);
        vel.add(move).multiplyScalar(Math.pow(0.0005, dt));
        camera.position.addScaledVector(vel, dt);
        const lim = ROOM - 1.3;
        camera.position.x = Math.max(-lim, Math.min(lim, camera.position.x));
        camera.position.z = Math.max(-lim, Math.min(lim, camera.position.z));
        const r = Math.hypot(camera.position.x, camera.position.z);
        if (r < PEDESTAL_R + 0.7) camera.position.multiplyScalar((PEDESTAL_R + 0.7) / r);
      }
      camera.position.y = EYE + Math.sin(t * 1.4) * 0.012;
      camera.rotation.set(pitch, yaw, 0, 'YXZ');

      if (!drag) {
        ray.setFromCamera(pointer, camera);
        const hit = owner(ray.intersectObjects(pickables, true)[0]?.object ?? null);
        if (hit !== hovered) {
          if (hovered?.userData.edgeMat) (hovered.userData.edgeMat as THREE.LineBasicMaterial).opacity = 0.8;
          hovered = hit;
          if (hovered?.userData.edgeMat) (hovered.userData.edgeMat as THREE.LineBasicMaterial).opacity = 1;
          canvas.style.cursor = hovered ? 'pointer' : '';
        }
      }
      for (const sp of spinning) {
        sp.obj.rotation.y = t * 0.45 + sp.phase + (sp.obj === hovered ? Math.sin(t * 3) * 0.05 : 0);
        sp.obj.position.y = sp.baseY + Math.sin(t * 1.1 + sp.phase) * 0.04;
      }
      halo.scale.setScalar(1 + Math.sin(t * 2) * 0.015);
      dust.rotation.y = t * 0.008;
      renderer.render(scene, camera);
    };

    Promise.all([build, holoBuild, document.fonts?.ready]).finally(async () => {
      if (disposed) return;
      setLoading(false);
      loop();
      // Lighter meshes on phones; centre piece first, then the walls.
      const cols = window.matchMedia('(pointer: coarse)').matches ? 44 : 60;
      for (const m of mounts) {
        if (disposed) return;
        try {
          const g = await garmentFor(m.p, m === mounts[0] ? cols + 30 : cols);
          if (disposed) { disposeObject(g); return; }
          const holder = new THREE.Group();
          g.scale.setScalar(m.scale);
          holder.add(g);
          holder.position.copy(m.at);
          holder.userData = { p: m.p };
          m.parent.add(holder);
          pickables.push(holder as unknown as THREE.Mesh);
          spinning.push({ obj: holder, phase: m.phase, baseY: m.at.y });
          built3d.push(g);
        } catch { /* keep the poster only */ }
        await new Promise((r) => setTimeout(r, 16));
      }
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      disposables.forEach((d) => d.dispose());
      built3d.forEach(disposeObject);
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, [products]);

  return (
    <div className="vstore">
      <canvas ref={canvasRef} aria-label="3D ENRJI store. Drag to look around, use W A S D or the arrow keys to walk, click any tee to see it." />
      {loading && <div className="vstore-loading"><span className="display">Opening the store</span><i /></div>}
      {error && <div className="vstore-loading"><div style={{ textAlign: 'center' }}><p>{error}</p><Link href="/shop" className="btn btn-gold">Shop the collection</Link></div></div>}
      <div className="vstore-hud">
        <p className="eyebrow" style={{ margin: 0 }}>Virtual store</p>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}><b style={{ color: 'var(--text)' }}>Drag</b> to look · <b style={{ color: 'var(--text)' }}>WASD</b> or arrows to walk · <b style={{ color: 'var(--text)' }}>Tap</b> any tee</p>
      </div>
      <div className="vstore-controls">
        <button className="btn btn-gold btn-sm" onClick={() => (guided ? controls.current?.stopTour() : controls.current?.startTour())}>{guided ? '■ Stop tour' : '▶ Guided tour'}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => controls.current?.reset()}>Entrance</button>
        <Link href="/shop" className="btn btn-ghost btn-sm">Exit to shop</Link>
      </div>
      <div className="dpad" aria-hidden>
        {([['up', 'f', '▲'], ['left', 'l', '◀'], ['down', 'b', '▼'], ['right', 'r', '▶']] as const).map(([cls, k, label]) => (
          <button key={k} className={cls}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); controls.current?.key(k, true); }}
            onPointerUp={() => controls.current?.key(k, false)} onPointerCancel={() => controls.current?.key(k, false)}>{label}</button>
        ))}
      </div>
      <ProductPanel p={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function ProductPanel({ p, onClose }: { p: StoreProduct | null; onClose(): void }) {
  const { add, setOpen, toast } = useCart();
  const [color, setColor] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  useEffect(() => { setColor(p?.colors[0] ?? null); setSize(null); }, [p]);
  if (!p) return <aside className="vstore-panel" aria-hidden />;
  const variants = p.variants.filter((v) => !color || v.color === color);
  const variant = variants.find((v) => v.size === size);
  return (
    <aside className="vstore-panel open" aria-live="polite">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="eyebrow">{p.limited ? 'Limited edition' : p.kind === 'tee' ? 'Half-sleeve tee' : 'Sweatshirt'}</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      </div>
      <img src={cdn(p.image, 480)} alt={titleCase(p.title)} style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: 12, margin: '14px 0' }} />
      <p style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>{titleCase(p.baseName)}</p>
      <Price price={p.price} compareAt={p.compareAt} showOff />
      {p.colors.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {p.colors.map((c) => <button key={c} className="pill" aria-pressed={c === color} onClick={() => { setColor(c); setSize(null); }}>{c}</button>)}
        </div>
      )}
      <div className="sizes" style={{ marginTop: 14, gridTemplateColumns: 'repeat(6, 1fr)' }}>
        {variants.map((v) => <button key={v.id} className="size" style={{ height: 40, fontSize: 13 }} aria-pressed={v.size === size} aria-disabled={!v.available} onClick={() => (v.available ? setSize(v.size) : toast(`${v.size} is sold out`))}>{v.size}</button>)}
      </div>
      <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
        <button className="btn btn-gold btn-sm" onClick={() => {
          if (!variant) return toast('Pick your size');
          add({ variantId: variant.id, quantity: 1, handle: p.handle, title: titleCase(p.title), size: variant.size, color: variant.color, price: variant.price, compareAt: variant.compareAt, image: variant.image ?? p.image });
          setOpen(true);
        }}>Add to bag</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/products/${p.handle}`} className="btn btn-ghost btn-sm" style={{ flex: 1 }}>Details</Link>
          <Link href={`/trial-room?product=${p.handle}`} className="btn btn-ghost btn-sm" style={{ flex: 1 }}>Try on</Link>
        </div>
      </div>
    </aside>
  );
}
