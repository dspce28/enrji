import * as THREE from '/vendor/three.module.js';
import { api, html, shirt, money, colorHex, colorLabel, allProducts, cart, emit, toast } from '../lib.js';
import { shirtImage, SIZES } from '../shirt.js';

const ROOM = 15;           // half-size of the square showroom
const EYE = 1.7;
const PEDESTAL_R = 2.4;

export async function render(el, { navigate }) {
  el.innerHTML = html`
    <div class="tour">
      <div class="tour-loading" id="loading">INITIALISING SHOWROOM…</div>
      <canvas id="c" aria-label="3D virtual store. Drag to look around, use W A S D or arrow keys to walk, click a shirt for details."></canvas>
      <div class="crosshair"></div>
      <div class="tour-hud">
        <div class="panel" style="padding:14px 16px">
          <div class="eyebrow">Virtual store</div>
          <div class="tour-help"><kbd>Drag</kbd> look · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows walk · <kbd>Click</kbd> a tee to inspect</div>
        </div>
      </div>
      <div class="tour-controls">
        <button class="btn" id="guided">▶ Guided tour</button>
        <button class="btn ghost" id="reset">⟲ Entrance</button>
        <a class="btn ghost" href="#/shop">Exit to shop</a>
      </div>
      <div class="dpad" aria-hidden="true">
        <button class="up" data-k="f">▲</button><button class="left" data-k="l">◀</button><button class="down" data-k="b">▼</button><button class="right" data-k="r">▶</button>
      </div>
      <aside class="tour-info panel" id="info" aria-live="polite"></aside>
    </div>`;

  const canvas = el.querySelector('#c');
  const info = el.querySelector('#info');
  let disposed = false;

  if (!window.WebGLRenderingContext) {
    el.querySelector('#loading').innerHTML = html`<div class="empty"><p>Your browser does not support WebGL, so the 3D store can't load.</p><a class="btn" href="#/shop">Browse the shop instead</a></div>`;
    return;
  }

  // ---------- renderer & scene ----------
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    el.querySelector('#loading').innerHTML = html`<div class="empty"><p>WebGL is unavailable on this device, so the 3D store can't load.</p><a class="btn" href="#/shop">Browse the shop instead</a></div>`;
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#04050b');
  scene.fog = new THREE.Fog('#04050b', 14, 42);
  const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 100);

  const disposables = [];
  const track = (o) => (disposables.push(o), o);

  scene.add(new THREE.HemisphereLight('#6a7bff', '#05060d', 0.9));
  scene.add(new THREE.AmbientLight('#ffffff', 0.25));
  [['#00f0ff', -8, -8], ['#ff2bd6', 8, -8], ['#7b5cff', -8, 8], ['#00f0ff', 8, 8], ['#ffffff', 0, 0]].forEach(([c, x, z]) => {
    const l = new THREE.PointLight(c, 30, 22, 1.6);
    l.position.set(x, 5, z);
    scene.add(l);
  });

  // Floor: glossy dark with neon grid.
  const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(ROOM * 2, ROOM * 2)), track(new THREE.MeshStandardMaterial({ color: '#070812', metalness: 0.7, roughness: 0.28 })));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const grid = new THREE.GridHelper(ROOM * 2, 30, '#00f0ff', '#1b2350');
  grid.position.y = 0.01;
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  scene.add(grid);

  // Walls and ceiling.
  const wallMat = track(new THREE.MeshStandardMaterial({ color: '#0b0d1c', metalness: 0.4, roughness: 0.7 }));
  const wallGeo = track(new THREE.PlaneGeometry(ROOM * 2, 7));
  [[0, -ROOM, 0], [0, ROOM, Math.PI], [-ROOM, 0, Math.PI / 2], [ROOM, 0, -Math.PI / 2]].forEach(([x, z, ry]) => {
    const w = new THREE.Mesh(wallGeo, wallMat);
    w.position.set(x, 3.5, z);
    w.rotation.y = ry;
    scene.add(w);
  });
  const ceil = new THREE.Mesh(track(new THREE.PlaneGeometry(ROOM * 2, ROOM * 2)), track(new THREE.MeshStandardMaterial({ color: '#05060d' })));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = 7;
  scene.add(ceil);

  // Neon strips along walls and ceiling.
  const neon = (color) => track(new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  const stripGeo = track(new THREE.BoxGeometry(ROOM * 2, 0.05, 0.05));
  [[0.15, '#00f0ff'], [6.2, '#ff2bd6']].forEach(([y, c]) => {
    const m = neon(c);
    [[0, -ROOM + 0.03, 0], [0, ROOM - 0.03, 0], [-ROOM + 0.03, 0, Math.PI / 2], [ROOM - 0.03, 0, Math.PI / 2]].forEach(([x, z, ry]) => {
      const s = new THREE.Mesh(stripGeo, m);
      s.position.set(x, y, z);
      s.rotation.y = ry;
      scene.add(s);
    });
  });
  const ringMat = neon('#7b5cff');
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(4 + i * 3.5, 0.03, 8, 96)), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 6.9;
    scene.add(ring);
  }

  // Store sign on the back wall.
  const signTex = track(textTexture('ENRJI', { w: 1024, h: 256, font: '900 170px Orbitron, sans-serif', color: '#00f0ff', glow: '#00f0ff' }));
  const sign = new THREE.Mesh(track(new THREE.PlaneGeometry(8, 2)), track(new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false })));
  sign.position.set(0, 5.4, -ROOM + 0.05);
  scene.add(sign);

  // Floating particles.
  const pCount = 500;
  const pPos = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) { pPos[i * 3] = (Math.random() - 0.5) * ROOM * 2; pPos[i * 3 + 1] = Math.random() * 7; pPos[i * 3 + 2] = (Math.random() - 0.5) * ROOM * 2; }
  const pGeo = track(new THREE.BufferGeometry());
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(pGeo, track(new THREE.PointsMaterial({ color: '#00f0ff', size: 0.04, transparent: true, opacity: 0.6, toneMapped: false })));
  scene.add(particles);

  // ---------- products ----------
  const products = await allProducts();
  if (disposed) return;
  await document.fonts?.ready;

  const shirtMeshes = [];
  const stations = [];
  const slots = displaySlots(products.length);
  const frameGeo = track(new THREE.BoxGeometry(2.8, 3.6, 0.12));
  const frameMat = track(new THREE.MeshStandardMaterial({ color: '#10132a', metalness: 0.8, roughness: 0.35 }));
  const edgeGeo = track(new THREE.EdgesGeometry(frameGeo));
  const shirtGeo = track(new THREE.PlaneGeometry(2.3, 2.3 * 1.1));
  const labelGeo = track(new THREE.PlaneGeometry(2.6, 0.65));

  await Promise.all(products.map(async (p, i) => {
    const slot = slots[i];
    if (!slot) return;
    const g = new THREE.Group();
    g.position.set(slot.x, 0, slot.z);
    g.rotation.y = slot.ry;

    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(0, 2.2, 0);
    g.add(frame);
    const edgeMat = track(new THREE.LineBasicMaterial({ color: i % 2 ? '#ff2bd6' : '#00f0ff', toneMapped: false }));
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    edges.position.copy(frame.position);
    g.add(edges);

    const tex = track(await imageTexture({ color: p.colors[0], design: p.design }));
    const shirtMat = track(new THREE.MeshStandardMaterial({ map: tex, transparent: true, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.45, roughness: 0.9 }));
    const shirtMesh = new THREE.Mesh(shirtGeo, shirtMat);
    shirtMesh.position.set(0, 2.45, 0.1);
    shirtMesh.userData = { product: p, edgeMat, baseY: 2.45, phase: i };
    g.add(shirtMesh);
    shirtMeshes.push(shirtMesh);

    const label = new THREE.Mesh(labelGeo, track(new THREE.MeshBasicMaterial({
      map: track(textTexture(`${p.name.toUpperCase()}  ·  ${money(p.price_cents)}`, { w: 1024, h: 256, font: '700 64px Orbitron, sans-serif', color: '#e8ecff', glow: i % 2 ? '#ff2bd6' : '#00f0ff' })),
      transparent: true, toneMapped: false,
    })));
    label.position.set(0, 0.75, 0.08);
    g.add(label);

    const pad = new THREE.Mesh(track(new THREE.CircleGeometry(1.1, 48)), track(new THREE.MeshBasicMaterial({ color: i % 2 ? '#ff2bd6' : '#00f0ff', transparent: true, opacity: 0.12, toneMapped: false })));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, 0.02, 1.4);
    g.add(pad);

    scene.add(g);
    // Viewing spot 4.6m in front of the display, facing it.
    const fwd = new THREE.Vector3(Math.sin(slot.ry), 0, Math.cos(slot.ry));
    stations[i] = { product: p, pos: new THREE.Vector3(slot.x, EYE, slot.z).addScaledVector(fwd, 4.6), yaw: slot.ry, target: shirtMesh };
  }));
  if (disposed) return;

  // Centre pedestal with a rotating hologram of the featured tee.
  const featured = products.find((p) => p.featured) ?? products[0];
  const pedestal = new THREE.Group();
  const base = new THREE.Mesh(track(new THREE.CylinderGeometry(PEDESTAL_R - 0.6, PEDESTAL_R, 0.6, 64)), track(new THREE.MeshStandardMaterial({ color: '#10132a', metalness: 0.9, roughness: 0.25 })));
  base.position.y = 0.3;
  pedestal.add(base);
  const glowRing = new THREE.Mesh(track(new THREE.TorusGeometry(PEDESTAL_R - 0.3, 0.04, 8, 96)), neon('#00f0ff'));
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.y = 0.62;
  pedestal.add(glowRing);
  const beam = new THREE.Mesh(track(new THREE.CylinderGeometry(1.2, 1.8, 4.4, 48, 1, true)),
    track(new THREE.MeshBasicMaterial({ color: '#00f0ff', transparent: true, opacity: 0.07, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
  beam.position.y = 2.8;
  pedestal.add(beam);
  let holo = null;
  if (featured) {
    const tex = track(await imageTexture({ color: featured.colors[0], design: featured.design }));
    holo = new THREE.Mesh(track(new THREE.PlaneGeometry(2.4, 2.64)), track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false })));
    holo.position.y = 2.8;
    holo.userData = { product: featured, baseY: 2.8, phase: 0 };
    pedestal.add(holo);
    shirtMeshes.push(holo);
    stations.push({ product: featured, pos: new THREE.Vector3(0, EYE, 6), yaw: 0, target: holo });
  }
  scene.add(pedestal);
  const tourStops = stations.filter(Boolean);

  // ---------- controls ----------
  const start = { pos: new THREE.Vector3(0, EYE, ROOM - 3), yaw: 0 };
  camera.position.copy(start.pos);
  let yaw = start.yaw, pitch = -0.05;
  const vel = new THREE.Vector3();
  const keys = new Set();
  let auto = null; // { i, t, waiting }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const keyMap = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
  const onKeyDown = (e) => {
    if (e.target.closest('input, select, textarea')) return;
    const k = keyMap[e.code];
    if (k) { keys.add(k); stopAuto(); e.preventDefault(); }
    if (e.code === 'Escape') closeInfo();
  };
  const onKeyUp = (e) => { const k = keyMap[e.code]; if (k) keys.delete(k); };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const dpad = el.querySelector('.dpad');
  dpad.addEventListener('pointerdown', (e) => { const k = e.target.dataset.k; if (k) { keys.add(k); stopAuto(); e.target.setPointerCapture(e.pointerId); } });
  const dpadUp = (e) => { const k = e.target.dataset.k; if (k) keys.delete(k); };
  dpad.addEventListener('pointerup', dpadUp);
  dpad.addEventListener('pointercancel', dpadUp);

  let drag = null;
  const pointer = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  let hovered = null;

  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: 0 };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.moved > 4) stopAuto();
    yaw -= dx * 0.004;
    pitch = Math.max(-1.1, Math.min(1.1, pitch - dy * 0.004));
  });
  canvas.addEventListener('pointerup', () => {
    if (drag && drag.moved < 6) {
      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects(shirtMeshes)[0];
      if (hit) { stopAuto(); openInfo(hit.object.userData.product); }
    }
    drag = null;
  });

  // ---------- guided tour ----------
  const guidedBtn = el.querySelector('#guided');
  function startAuto() {
    if (!tourStops.length) return;
    auto = { i: 0, wait: 0 };
    guidedBtn.textContent = '■ Stop tour';
  }
  function stopAuto() {
    if (!auto) return;
    auto = null;
    guidedBtn.textContent = '▶ Guided tour';
  }
  guidedBtn.onclick = () => (auto ? stopAuto() : startAuto());
  el.querySelector('#reset').onclick = () => { stopAuto(); camera.position.copy(start.pos); yaw = start.yaw; pitch = -0.05; closeInfo(); };

  // ---------- info panel ----------
  let infoSeq = 0;
  async function openInfo(p) {
    const seq = ++infoSeq;
    info.classList.add('open');
    info.innerHTML = html`<div class="spinner"></div>`;
    let full;
    try { ({ product: full } = await api(`/products/${p.slug}`)); } catch (e) { info.innerHTML = html`<p class="error">${e.message}</p>`; return; }
    if (seq !== infoSeq || disposed) return;
    const st = { color: full.colors[0], size: null };
    const byKey = new Map(full.variants.map((v) => [`${v.color}|${v.size}`, v]));
    const draw = () => {
      info.innerHTML = html`
        <div class="spread"><div class="eyebrow">${full.category.replace('-', ' ')}</div><button class="icon-btn" id="x" aria-label="Close">✕</button></div>
        <div class="art">${shirt(st.color, full.design)}</div>
        <h3 style="margin:0">${full.name}</h3>
        <div class="mono" style="color:var(--cyan)">${money(full.price_cents)}</div>
        <p class="muted" style="font-size:13px;margin:8px 0">${full.description}</p>
        <div class="color-opts">${full.colors.map((c) => html`<button class="color-opt ${c === st.color ? 'on' : ''}" style="width:28px;height:28px;background:${colorHex(c)}" data-c="${c}" aria-label="${colorLabel(c)}"></button>`)}</div>
        <div class="size-opts" style="margin-top:10px">${SIZES.map((s) => {
          const v = byKey.get(`${st.color}|${s}`);
          return html`<button class="size-opt ${st.size === s ? 'on' : ''}" style="min-width:40px;padding:6px" data-s="${s}" ${!v || !v.stock ? 'disabled' : ''}>${s}</button>`;
        })}</div>
        <div class="row" style="margin-top:12px">
          <button class="btn sm" id="add" ${st.size ? '' : 'disabled'}>Add to cart</button>
          <a class="btn ghost sm" href="#/product/${full.slug}?color=${st.color}">Details</a>
          <a class="btn ghost sm" href="#/try-on?product=${full.slug}&color=${st.color}">Try on</a>
        </div>`;
    };
    draw();
    info.onclick = (e) => {
      if (e.target.closest('#x')) return closeInfo();
      const c = e.target.closest('[data-c]'), s = e.target.closest('[data-s]');
      if (c) { st.color = c.dataset.c; st.size = null; draw(); }
      if (s && !s.disabled) { st.size = s.dataset.s; draw(); }
      if (e.target.closest('#add')) {
        const v = byKey.get(`${st.color}|${st.size}`);
        if (!v) return;
        cart.add(v.id, 1);
        toast(`${full.name} (${st.size}) added to cart`);
        emit('open-cart');
      }
    };
  }
  function closeInfo() { infoSeq++; info.classList.remove('open'); }

  // ---------- loop ----------
  const clock = new THREE.Clock();
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();
  let raf = 0;

  function step() {
    raf = requestAnimationFrame(step);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    if (auto) {
      const stop = tourStops[auto.i % tourStops.length];
      const d = camera.position.distanceTo(stop.pos);
      camera.position.lerp(stop.pos, 1 - Math.pow(0.12, dt));
      let dy = stop.yaw - yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yaw += dy * (1 - Math.pow(0.08, dt));
      pitch += (0.08 - pitch) * (1 - Math.pow(0.1, dt));
      if (d < 0.15) {
        if (auto.wait === 0) openInfo(stop.product);
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
      if (move.lengthSq()) move.normalize().multiplyScalar(26 * dt);
      vel.add(move).multiplyScalar(Math.pow(0.0005, dt));
      camera.position.addScaledVector(vel, dt);
      // Keep inside the room and out of the pedestal.
      const lim = ROOM - 1.2;
      camera.position.x = Math.max(-lim, Math.min(lim, camera.position.x));
      camera.position.z = Math.max(-lim, Math.min(lim, camera.position.z));
      const r = Math.hypot(camera.position.x, camera.position.z);
      if (r < PEDESTAL_R + 0.6) camera.position.multiplyScalar((PEDESTAL_R + 0.6) / r).setY(EYE);
    }
    camera.position.y = EYE + Math.sin(t * 1.5) * 0.015;
    camera.rotation.set(pitch, yaw, 0, 'YXZ');

    // Hover glow.
    if (!drag) {
      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects(shirtMeshes)[0]?.object ?? null;
      if (hit !== hovered) {
        hovered?.scale.setScalar(1);
        hovered = hit;
        hovered?.scale.setScalar(1.06);
        canvas.style.cursor = hovered ? 'pointer' : '';
      }
    }
    for (const m of shirtMeshes) {
      m.position.y = m.userData.baseY + Math.sin(t * 1.2 + m.userData.phase) * 0.05;
      if (m.userData.edgeMat) m.userData.edgeMat.color.setHSL(m.userData.phase % 2 ? 0.87 : 0.5, 1, 0.5 + Math.sin(t * 2 + m.userData.phase) * 0.1);
    }
    if (holo) holo.rotation.y = t * 0.6;
    glowRing.scale.setScalar(1 + Math.sin(t * 2) * 0.02);
    particles.rotation.y = t * 0.01;
    renderer.render(scene, camera);
  }

  el.querySelector('#loading').style.opacity = '0';
  setTimeout(() => el.querySelector('#loading')?.remove(), 600);
  step();

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    for (const d of disposables) d.dispose?.();
    grid.geometry.dispose(); grid.material.dispose();
    renderer.dispose();
  };
}

// Slots along the back, left and right walls, then the front wall.
function displaySlots(n) {
  const along = [-9, -3, 3, 9];
  const inset = ROOM - 0.25;
  const slots = [
    ...along.map((x) => ({ x, z: -inset, ry: 0 })),
    ...along.map((z) => ({ x: -inset, z, ry: Math.PI / 2 })),
    ...along.map((z) => ({ x: inset, z, ry: -Math.PI / 2 })),
    ...[-9, 9, -4.5, 4.5].map((x) => ({ x, z: inset, ry: Math.PI })),
  ];
  return slots.slice(0, n);
}

async function imageTexture(opts) {
  const img = await shirtImage(opts, 512);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 564;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function textTexture(text, { w, h, font, color, glow }) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Shrink long labels to fit.
  let size = parseInt(font.match(/(\d+)px/)[1], 10);
  while (ctx.measureText(text).width > w * 0.92 && size > 20) { size -= 4; ctx.font = font.replace(/\d+px/, `${size}px`); }
  ctx.shadowColor = glow;
  ctx.shadowBlur = 24;
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2);
  ctx.shadowBlur = 0;
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
