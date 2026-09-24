'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { drawGarment, loadHeavyFont, type GarmentKind } from '@/lib/garment';
import { buildGarment3D, disposeObject } from '@/lib/garment3d';

export interface Garment360Props {
  kind: GarmentKind;
  color: string;
  ink: string;
  slogan: string;
  artwork: string | null;
  className?: string;
}

/** Interactive 3D garment: drag to spin 360°, pinch or scroll to zoom. Turns slowly on its own when idle. */
export default function Garment360({ kind, color, ink, slogan, artwork, className }: Garment360Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const garmentRef = useRef<THREE.Group | null>(null);
  const sceneRef = useRef<{ scene: THREE.Scene; render(): void } | null>(null);

  // Scene, lights and controls: created once.
  useEffect(() => {
    const canvas = canvasRef.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 0.2, 9);

    // Studio lighting: soft key, warm fill, cool rim so the silhouette reads on dark backgrounds.
    scene.add(new THREE.HemisphereLight('#fff6ea', '#1a1510', 1.3));
    const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(3, 4, 6); scene.add(key);
    const fill = new THREE.DirectionalLight('#ffd9a8', 0.7); fill.position.set(-5, 1, 3); scene.add(fill);
    const rim = new THREE.DirectionalLight('#d9ab52', 1.6); rim.position.set(-2, 3, -6); scene.add(rim);
    const rim2 = new THREE.DirectionalLight('#ffffff', 0.8); rim2.position.set(4, 2, -5); scene.add(rim2);

    // Soft contact shadow.
    const sc = document.createElement('canvas'); sc.width = sc.height = 128;
    const sg = sc.getContext('2d')!;
    const grad = sg.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,.55)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = grad; sg.fillRect(0, 0, 128, 128);
    const shadowTex = new THREE.CanvasTexture(sc);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.3), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -2.45;
    scene.add(shadow);

    const controls = new OrbitControls(camera, canvas);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 12;
    controls.minPolarAngle = Math.PI * 0.28;
    controls.maxPolarAngle = Math.PI * 0.62;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 2.2;
    let resume: ReturnType<typeof setTimeout> | undefined;
    controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resume); });
    controls.addEventListener('end', () => { resume = setTimeout(() => (controls.autoRotate = true), 3500); });

    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Keep the whole garment in frame on tall and wide containers alike.
      camera.position.setLength(Math.max(8.5, 9 / Math.min(1, camera.aspect * 1.25)));
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(canvas);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
    sceneRef.current = { scene, render: () => renderer.render(scene, camera) };

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resume);
      ro.disconnect();
      io.disconnect();
      controls.dispose();
      if (garmentRef.current) disposeObject(garmentRef.current);
      shadow.geometry.dispose(); (shadow.material as THREE.Material).dispose(); shadowTex.dispose();
      renderer.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Garment: rebuilt when the product or colour changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = sceneRef.current;
      if (!s) return;
      await loadHeavyFont();
      await document.fonts?.ready;
      let art: HTMLImageElement | null = null;
      if (artwork) {
        art = new Image();
        art.src = artwork;
        try { await art.decode(); } catch { art = null; }
      }
      if (cancelled || !sceneRef.current) return;
      const spec = { kind, color, ink, slogan, artwork: art };
      const g = buildGarment3D({
        kind, color,
        front: drawGarment(spec, { scale: 2.5, shading: false }),
        back: drawGarment(spec, { scale: 1.5, shading: false, noPrint: true }),
      });
      if (garmentRef.current) { s.scene.remove(garmentRef.current); disposeObject(garmentRef.current); }
      garmentRef.current = g;
      s.scene.add(g);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [kind, color, ink, slogan, artwork]);

  if (failed) return <div className={`g360 ${className ?? ''}`}><p className="muted" style={{ margin: 'auto', padding: 20, textAlign: 'center' }}>3D view needs WebGL, which this device doesn&apos;t support.</p></div>;

  return (
    <div ref={wrap} className={`g360 ${className ?? ''}`}>
      <canvas ref={canvasRef} aria-label={`3D view of the ${slogan} ${kind}. Drag to rotate.`} />
      {!ready && <div className="g360-loading"><span /></div>}
      <div className="g360-hint" aria-hidden><span>⟲</span> Drag to rotate 360°</div>
    </div>
  );
}
