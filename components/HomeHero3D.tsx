'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createPortrait, loadPortrait, type PortraitMesh } from '@/lib/depthPortrait';

export interface HeroSlide { handle: string; name: string; line: string; price: string }

const SLIDE_MS = 7000;

function wordmark() {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 560;
  const g = c.getContext('2d')!;
  g.font = '800 470px Unbounded, Arial Black, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const grad = g.createLinearGradient(0, 60, 0, 500);
  grad.addColorStop(0, 'rgba(255,236,190,0.95)'); grad.addColorStop(0.55, 'rgba(217,171,82,0.85)'); grad.addColorStop(1, 'rgba(90,64,24,0.25)');
  g.fillStyle = grad;
  g.fillText('ENRJI', 1024, 300);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, 'rgba(255,214,140,0.55)'); r.addColorStop(0.4, 'rgba(217,171,82,0.18)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

const dustVert = /* glsl */ `
  attribute float seed;
  uniform float time;
  uniform vec2 mouse;
  uniform float pr;
  varying float vA;
  void main() {
    vec3 p = position;
    p.y = mod(p.y + time * (0.08 + seed * 0.12) + 4.0, 8.0) - 4.0;
    p.x += sin(time * 0.3 + seed * 20.0) * 0.15;
    // Motes drift away from the cursor.
    vec2 d = p.xy - mouse;
    p.xy += normalize(d + 1e-4) * 0.35 * exp(-dot(d, d) * 1.4);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min((2.0 + seed * 5.0) * pr * (6.0 / -mv.z), 9.0 * pr);
    vA = (0.25 + 0.75 * seed) * (0.6 + 0.4 * sin(time * 2.0 + seed * 40.0));
  }
`;
const dustFrag = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vA;
    gl_FragColor = vec4(vec3(1.0, 0.82, 0.5) * a, a);
  }
`;

/** Full-screen hero: the collection worn by real people, as 3D photos that turn to follow the cursor. */
export function HomeHero3D({ slides }: { slides: HeroSlide[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(false);
  const api = useRef<{ show(i: number): void } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch { return; }
    const small = window.innerWidth < 760;
    const pr = Math.min(window.devicePixelRatio, small ? 1.5 : 2);
    renderer.setPixelRatio(pr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    camera.position.set(0, 0, 11);
    const rig = new THREE.Group();          // everything that parallaxes with the mouse and scroll
    scene.add(rig);

    const wmTex = wordmark();
    const wm = new THREE.Mesh(new THREE.PlaneGeometry(11, 3), new THREE.MeshBasicMaterial({ map: wmTex, transparent: true, depthWrite: false, opacity: 0 }));
    wm.position.set(0, 0.9, -2.2);
    rig.add(wm);

    const glowTex = glowTexture();
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(0, 0.3, -1.2);
    rig.add(glow);

    const n = small ? 420 : 900;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 16; pos[i * 3 + 1] = (Math.random() - 0.5) * 8; pos[i * 3 + 2] = (Math.random() - 0.5) * 6; seed[i] = Math.random(); }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dustGeo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const dustMat = new THREE.ShaderMaterial({ vertexShader: dustVert, fragmentShader: dustFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { time: { value: 0 }, mouse: { value: new THREE.Vector2(99, 99) }, pr: { value: pr } } });
    rig.add(new THREE.Points(dustGeo, dustMat));

    // Figures: one per slide, loaded lazily; the current one materialises, the previous dissolves.
    const figures = new Map<number, PortraitMesh>();
    const holder = new THREE.Group();
    rig.add(holder);
    let current = -1;
    const wanted = new Set<number>();
    const ensure = (i: number) => {
      if (figures.has(i) || wanted.has(i)) return;
      wanted.add(i);
      loadPortrait(slides[i].handle).then((t) => {
        const f = createPortrait(t, { mode: 'cutout', height: 5, relief: 1.2 });
        f.material.uniforms.bottomFade.value = 0.22;
        f.material.uniforms.reveal.value = 0;
        f.material.uniforms.rimStrength.value = 1.1;
        f.position.y = -3.1;
        f.visible = false;
        holder.add(f);
        figures.set(i, f);
        if (i === current) { f.visible = true; setReady(true); }
      }).catch(() => {});
    };
    const show = (i: number) => {
      current = i;
      ensure(i);
      ensure((i + 1) % slides.length);   // preload the next one
      const f = figures.get(i);
      if (f) { f.visible = true; f.material.uniforms.reveal.value = 0; setReady(true); }
    };
    api.current = { show };
    show(0);

    // Layout: model right of the headline on wide screens, centred behind it on phones.
    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const wide = w / h > 1.05;
      // Keep the face clear of the headline on the left.
      holder.position.x = wide ? Math.min(3.1, 1.9 * camera.aspect) : 0;
      wm.position.x = holder.position.x;
      glow.position.x = holder.position.x;
      const k = wide ? 1 : 0.82;
      holder.scale.setScalar(k);
      wm.scale.setScalar(wide ? 0.72 : Math.max(0.5, camera.aspect * 0.9));
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const mouse = new THREE.Vector2(), smooth = new THREE.Vector2();
    const onMove = (e: PointerEvent) => { mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); };
    window.addEventListener('pointermove', onMove, { passive: true });
    // Phones: tilt with the device.
    const onTilt = (e: DeviceOrientationEvent) => { if (e.gamma != null && e.beta != null) mouse.set(Math.max(-1, Math.min(1, e.gamma / 30)), Math.max(-1, Math.min(1, (45 - e.beta) / 40))); };
    window.addEventListener('deviceorientation', onTilt, { passive: true });

    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(canvas);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clock = new THREE.Clock();
    const ray = new THREE.Vector3();
    let raf = 0, intro = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) { clock.getDelta(); return; }
      const raw = Math.min(clock.getDelta(), 0.5);   // real time, so reveals finish on time on slow devices
      const dt = Math.min(raw, 0.05);
      const t = clock.elapsedTime;
      smooth.lerp(mouse, 1 - Math.pow(0.04, dt));
      intro = Math.min(1, intro + raw * 0.5);
      const scroll = Math.min(1, window.scrollY / Math.max(1, canvas.clientHeight));

      (wm.material as THREE.MeshBasicMaterial).opacity = 0.55 * intro * (1 - scroll * 0.6);
      wm.position.y = 1.05 + (1 - intro) * -0.6 + scroll * 0.8;
      rig.rotation.y = reduce ? 0 : smooth.x * 0.06;
      rig.rotation.x = reduce ? 0 : -smooth.y * 0.03;
      camera.position.z = 11 + scroll * 3;
      camera.position.y = -scroll * 0.6;
      glow.scale.setScalar(1 + Math.sin(t * 0.8) * 0.05);

      for (const [i, f] of figures) {
        const u = f.material.uniforms;
        u.time.value = t;
        if (i === current) u.reveal.value = Math.min(1, u.reveal.value + raw * 0.55);
        else if (f.visible) { u.reveal.value -= raw * 0.9; if (u.reveal.value <= 0) f.visible = false; }
        // Turn toward the cursor.
        f.rotation.y += ((reduce ? 0 : smooth.x * 0.5) - f.rotation.y) * (1 - Math.pow(0.05, dt));
        f.rotation.x += ((reduce ? 0 : -smooth.y * 0.08) - f.rotation.x) * (1 - Math.pow(0.05, dt));
        u.brightness.value = 1 - scroll * 0.5;
      }
      // Cursor position on the z = 0 plane, for the dust.
      ray.set(smooth.x, smooth.y, 0.5).unproject(camera).sub(camera.position).normalize();
      const d = -camera.position.z / ray.z;
      dustMat.uniforms.mouse.value.set(camera.position.x + ray.x * d, camera.position.y + ray.y * d);
      dustMat.uniforms.time.value = t;
      renderer.render(scene, camera);
    };
    document.fonts?.ready.then(() => { wmTex.dispose(); (wm.material as THREE.MeshBasicMaterial).map = wordmark(); (wm.material as THREE.MeshBasicMaterial).needsUpdate = true; });
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('deviceorientation', onTilt);
      for (const f of figures.values()) { f.geometry.dispose(); f.material.dispose(); }
      (wm.material as THREE.MeshBasicMaterial).map?.dispose();
      wm.geometry.dispose(); (wm.material as THREE.Material).dispose();
      glow.geometry.dispose(); (glow.material as THREE.Material).dispose(); glowTex.dispose();
      dustGeo.dispose(); dustMat.dispose();
      renderer.dispose();
      api.current = null;
    };
  }, [slides]);

  // Auto-advance.
  useEffect(() => {
    if (slides.length < 2) return;
    const id = setTimeout(() => { const next = (idx + 1) % slides.length; setIdx(next); api.current?.show(next); }, SLIDE_MS);
    return () => clearTimeout(id);
  }, [idx, slides.length]);

  const go = (i: number) => { setIdx(i); api.current?.show(i); };
  const s = slides[idx];

  return (
    <>
      <canvas ref={canvasRef} className={`hero3d-canvas${ready ? ' ready' : ''}`} aria-hidden />
      {s && (
        <div className="hero3d-slide" aria-live="polite">
          <div key={idx} className="hero3d-label">
            <span className="hero3d-kicker">{s.line}</span>
            <Link href={`/products/${s.handle}`} className="hero3d-name">
              {s.name.split('').map((c, i) => <span key={i} style={{ animationDelay: `${i * 0.035}s` }}>{c === ' ' ? ' ' : c}</span>)}
            </Link>
            <span className="hero3d-price">{s.price} <Link href={`/products/${s.handle}`}>Shop this →</Link></span>
          </div>
          <div className="hero3d-dots">
            {slides.map((sl, i) => (
              <button key={sl.handle} aria-label={`Show ${sl.name}`} aria-pressed={i === idx} onClick={() => go(i)}>
                <i style={i === idx ? { animationDuration: `${SLIDE_MS}ms` } : undefined} />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
