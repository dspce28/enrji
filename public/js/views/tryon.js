import { html, shirt, allProducts, colorHex, colorLabel, toast } from '../lib.js';
import { shirtSVG, svgDataUrl } from '../shirt.js';

// Garment geometry in the shirt SVG's 400x440 coordinate space.
const SVG_W = 400, SVG_H = 440;
const SHOULDER_L = { x: 78, y: 58 }, SHOULDER_R = { x: 322, y: 58 };
const SHOULDER_SPAN = SHOULDER_R.x - SHOULDER_L.x;
const PRINT = { w: 150, h: 170, cx: 200, cy: 203 };
const MAX_SIDE = 1400;

export async function render(el, { query }) {
  const products = await allProducts();
  const initial = products.find((p) => p.slug === query.product) ?? products[0];
  const st = {
    product: initial,
    color: initial?.colors.includes(query.color) ? query.color : initial?.colors[0],
    mode: 'shirt',        // 'shirt' = full garment overlay, 'print' = graphic only on the shirt you're wearing
    blend: true,
    opacity: 0.95,
    // Overlay transform in canvas pixels: centre, width, rotation (radians).
    t: null,
    photo: null,          // ImageBitmap | HTMLCanvasElement
    picking: null,        // null | [] | [pt] during shoulder picking
    shoulders: null,
  };

  el.innerHTML = html`
    <div class="eyebrow">Virtual fitting room</div>
    <h1>Try it on yourself</h1>
    <p class="muted" style="max-width:720px">Upload a front-facing photo, take one with your camera, or use the mannequin. Drag the tee into place, or click <b>Fit to shoulders</b> and tap your two shoulder points to line it up automatically.</p>
    <div class="tryon">
      <div>
        <div class="stage-wrap" id="stage">
          <div class="drop" id="drop">
            <div class="big">📸</div>
            <h3>Drop a photo here</h3>
            <p class="muted">A front-facing, waist-up photo in good light works best.</p>
            <div class="row" style="justify-content:center">
              <label class="btn" style="margin:0;color:inherit">Upload photo<input type="file" id="file" accept="image/*" hidden></label>
              <button class="btn ghost" id="cam">Use camera</button>
              <button class="btn ghost" id="mannequin">Use mannequin</button>
            </div>
          </div>
          <canvas id="cv" hidden></canvas>
          <video class="cam" id="video" playsinline muted hidden></video>
        </div>
        <div class="row" style="margin-top:12px" id="stage-actions" hidden>
          <button class="btn sm" id="fit">⌖ Fit to shoulders</button>
          <button class="btn ghost sm" id="download">⬇ Save image</button>
          <button class="btn ghost sm" id="new-photo">↺ New photo</button>
          <span class="muted" id="hint" style="font-size:13px"></span>
        </div>
        <div class="row" style="margin-top:12px" id="cam-actions" hidden>
          <button class="btn" id="snap">● Capture</button>
          <button class="btn ghost" id="cam-cancel">Cancel</button>
        </div>
      </div>

      <aside class="panel stack">
        <div>
          <h3>Design</h3>
          <div class="mini-shirts" id="picker">${products.map((p) => html`<button data-slug="${p.slug}" title="${p.name}" aria-label="${p.name}">${shirt(p.colors[0], p.design)}</button>`)}</div>
        </div>
        <div>
          <div class="spread"><b id="p-name"></b><a id="p-link" style="font-size:13px">View product →</a></div>
          <div class="color-opts" id="p-colors" style="margin-top:8px"></div>
        </div>
        <div>
          <h3>Mode</h3>
          <div class="row">
            <button class="pill on" data-mode="shirt">Full tee</button>
            <button class="pill" data-mode="print">Print on my shirt</button>
          </div>
        </div>
        <div>
          <h3>Adjust</h3>
          <div class="slider-row"><span>Size</span><input type="range" id="s-scale" min="10" max="150" value="60"><output id="o-scale"></output></div>
          <div class="slider-row"><span>Rotate</span><input type="range" id="s-rot" min="-45" max="45" value="0"><output id="o-rot"></output></div>
          <div class="slider-row"><span>Opacity</span><input type="range" id="s-op" min="30" max="100" value="95"><output id="o-op"></output></div>
          <label class="row" style="margin:6px 0 0;color:var(--text)"><input type="checkbox" id="blend" checked> Fabric blend (keeps folds & shadows)</label>
        </div>
        <a class="btn block" id="buy">Get this look</a>
        <div class="privacy"><span>🔒</span><span>Your photo is processed entirely in your browser. It is never uploaded to our servers.</span></div>
      </aside>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const cv = $('#cv');
  const ctx = cv.getContext('2d');
  const stage = $('#stage');
  const video = $('#video');
  let overlay = null;
  let stream = null;
  let overlaySeq = 0;

  // ---------- overlay image ----------
  async function loadOverlay() {
    const seq = ++overlaySeq;
    const svg = shirtSVG({ color: st.color, design: st.product.design, printOnly: st.mode === 'print' });
    const img = new Image();
    img.src = svgDataUrl(svg, 1000);
    await img.decode().catch(() => new Promise((r) => (img.onload = r)));
    if (seq !== overlaySeq) return;
    overlay = img;
    draw();
  }

  const aspect = () => (st.mode === 'print' ? PRINT.h / PRINT.w : SVG_H / SVG_W);

  function defaultTransform() {
    const w = cv.width * (st.mode === 'print' ? 0.28 : 0.62);
    return { cx: cv.width / 2, cy: cv.height * (st.mode === 'print' ? 0.62 : 0.66), w, rot: 0 };
  }

  /** Align the garment's shoulder seams (or the chest print) to two picked shoulder points. */
  function fitToShoulders(a, b) {
    const [l, r] = a.x <= b.x ? [a, b] : [b, a];
    const span = Math.hypot(r.x - l.x, r.y - l.y);
    const rot = Math.atan2(r.y - l.y, r.x - l.x);
    const unit = span / SHOULDER_SPAN; // canvas px per SVG unit
    const mid = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
    // Offset from shoulder midpoint to the overlay's centre, in SVG units.
    const off = st.mode === 'print' ? PRINT.cy - SHOULDER_L.y : SVG_H / 2 - SHOULDER_L.y;
    const dx = -Math.sin(rot) * off * unit, dy = Math.cos(rot) * off * unit;
    st.t = { cx: mid.x + dx, cy: mid.y + dy, w: (st.mode === 'print' ? PRINT.w : SVG_W) * unit, rot };
    syncSliders();
    draw();
  }

  let offCanvas = null;
  function offscreen(w, h) {
    offCanvas ??= document.createElement('canvas');
    if (offCanvas.width !== w || offCanvas.height !== h) { offCanvas.width = w; offCanvas.height = h; }
    return offCanvas;
  }
  function placeOverlay(g) {
    const { cx, cy, w, rot } = st.t;
    const h = w * aspect();
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.drawImage(overlay, -w / 2, -h / 2, w, h);
    g.restore();
  }

  function draw() {
    if (!st.photo) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(st.photo, 0, 0, cv.width, cv.height);
    if (overlay && st.t) {
      // Compose the garment off-screen so blending never touches the photo outside it.
      const off = offscreen(cv.width, cv.height);
      const o = off.getContext('2d');
      o.globalCompositeOperation = 'source-over';
      o.clearRect(0, 0, off.width, off.height);
      placeOverlay(o);
      if (st.blend) {
        // Soft-light the photo's luminance into the print so folds and shadows show through,
        // then clip back to the garment's own alpha.
        o.globalCompositeOperation = 'soft-light';
        o.filter = 'grayscale(1) contrast(1.2)';
        o.drawImage(st.photo, 0, 0, cv.width, cv.height);
        o.filter = 'none';
        o.globalCompositeOperation = 'destination-in';
        placeOverlay(o);
      }
      ctx.globalAlpha = st.opacity;
      ctx.drawImage(off, 0, 0);
      ctx.globalAlpha = 1;
    }
    const pts = st.picking ?? [];
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(6, cv.width / 120), 0, Math.PI * 2);
      ctx.fillStyle = '#00f0ff';
      ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 16;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // ---------- photo sources ----------
  function setPhoto(source, w, h) {
    const k = Math.min(1, MAX_SIDE / Math.max(w, h));
    cv.width = Math.round(w * k);
    cv.height = Math.round(h * k);
    st.photo = source;
    st.t = defaultTransform();
    st.picking = null;
    $('#drop').hidden = true;
    cv.hidden = false;
    $('#stage-actions').hidden = false;
    $('#hint').textContent = 'Drag to move · scroll or pinch to resize';
    syncSliders();
    draw();
  }

  async function fromFile(file) {
    if (!file?.type.startsWith('image/')) { toast('Please choose an image file', true); return; }
    if (file.size > 25e6) { toast('That image is too large (max 25 MB)', true); return; }
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      setPhoto(bmp, bmp.width, bmp.height);
    } catch {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.src = url;
      try { await img.decode(); setPhoto(img, img.naturalWidth, img.naturalHeight); }
      catch { toast('Could not read that image', true); }
      finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
    }
  }

  $('#file').addEventListener('change', (e) => fromFile(e.target.files[0]));
  const drop = $('#drop');
  stage.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  stage.addEventListener('dragleave', () => drop.classList.remove('over'));
  stage.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); fromFile(e.dataTransfer.files[0]); });

  $('#cam').addEventListener('click', async () => {
    if (!navigator.mediaDevices?.getUserMedia) { toast('Camera is not available in this browser', true); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
    } catch { toast('Camera permission was denied', true); return; }
    video.srcObject = stream;
    await video.play();
    drop.hidden = true;
    video.hidden = false;
    $('#cam-actions').hidden = false;
  });
  function stopCam() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.hidden = true;
    $('#cam-actions').hidden = true;
  }
  $('#snap').addEventListener('click', () => {
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    const g = c.getContext('2d');
    g.translate(c.width, 0); g.scale(-1, 1); // mirror like the preview
    g.drawImage(video, 0, 0);
    stopCam();
    setPhoto(c, c.width, c.height);
  });
  $('#cam-cancel').addEventListener('click', () => { stopCam(); drop.hidden = false; });

  $('#mannequin').addEventListener('click', () => {
    const { canvas: c, shoulders } = mannequin();
    setPhoto(c, c.width, c.height);
    fitToShoulders(shoulders[0], shoulders[1]);
    $('#hint').textContent = 'Mannequin loaded — pick any design on the right';
  });

  $('#new-photo').addEventListener('click', () => {
    st.photo = null;
    cv.hidden = true;
    $('#stage-actions').hidden = true;
    drop.hidden = false;
    $('#file').value = '';
  });

  // ---------- direct manipulation ----------
  const toCanvas = (e) => {
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * cv.width, y: ((e.clientY - r.top) / r.height) * cv.height };
  };
  const pointers = new Map();
  let gesture = null;

  cv.addEventListener('pointerdown', (e) => {
    const p = toCanvas(e);
    if (st.picking) {
      st.picking.push(p);
      if (st.picking.length === 2) {
        const [a, b] = st.picking;
        st.picking = null;
        stage.classList.remove('picking');
        $('#hint').textContent = 'Fitted. Fine-tune with drag or the sliders.';
        fitToShoulders(a, b);
      } else {
        $('#hint').textContent = 'Now tap the other shoulder.';
        draw();
      }
      return;
    }
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, p);
    gesture = startGesture();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || !st.t) return;
    pointers.set(e.pointerId, toCanvas(e));
    const pts = [...pointers.values()];
    if (pts.length === 1 && gesture.pts.length === 1) {
      st.t.cx = gesture.t.cx + pts[0].x - gesture.pts[0].x;
      st.t.cy = gesture.t.cy + pts[0].y - gesture.pts[0].y;
    } else if (pts.length >= 2 && gesture.pts.length >= 2) {
      const d0 = dist(gesture.pts[0], gesture.pts[1]), d1 = dist(pts[0], pts[1]);
      const a0 = angle(gesture.pts[0], gesture.pts[1]), a1 = angle(pts[0], pts[1]);
      const m0 = mid(gesture.pts[0], gesture.pts[1]), m1 = mid(pts[0], pts[1]);
      st.t.w = clampW(gesture.t.w * (d1 / d0));
      st.t.rot = gesture.t.rot + (a1 - a0);
      st.t.cx = gesture.t.cx + m1.x - m0.x;
      st.t.cy = gesture.t.cy + m1.y - m0.y;
    }
    syncSliders();
    draw();
  });
  const endPointer = (e) => { pointers.delete(e.pointerId); gesture = pointers.size ? startGesture() : null; };
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);
  cv.addEventListener('wheel', (e) => {
    if (!st.t) return;
    e.preventDefault();
    st.t.w = clampW(st.t.w * Math.exp(-e.deltaY * 0.0015));
    syncSliders();
    draw();
  }, { passive: false });

  function startGesture() { return { pts: [...pointers.values()].map((p) => ({ ...p })), t: { ...st.t } }; }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
  const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const clampW = (w) => Math.max(cv.width * 0.05, Math.min(cv.width * 2.5, w));

  $('#fit').addEventListener('click', () => {
    st.picking = [];
    stage.classList.add('picking');
    $('#hint').textContent = 'Tap the point of one shoulder (where the seam sits).';
    draw();
  });

  // ---------- sliders ----------
  function syncSliders() {
    if (!st.t) return;
    const pct = Math.round((st.t.w / cv.width) * 100);
    $('#s-scale').value = Math.min(150, Math.max(10, pct));
    $('#o-scale').textContent = `${pct}%`;
    const deg = Math.round((st.t.rot * 180) / Math.PI);
    $('#s-rot').value = deg;
    $('#o-rot').textContent = `${deg}°`;
    $('#o-op').textContent = `${Math.round(st.opacity * 100)}%`;
  }
  $('#s-scale').addEventListener('input', (e) => { if (st.t) { st.t.w = (e.target.value / 100) * cv.width; syncSliders(); draw(); } });
  $('#s-rot').addEventListener('input', (e) => { if (st.t) { st.t.rot = (e.target.value * Math.PI) / 180; syncSliders(); draw(); } });
  $('#s-op').addEventListener('input', (e) => { st.opacity = e.target.value / 100; syncSliders(); draw(); });
  $('#blend').addEventListener('change', (e) => { st.blend = e.target.checked; draw(); });

  // ---------- product / mode ----------
  function syncProduct() {
    const p = st.product;
    $('#p-name').textContent = p.name;
    $('#p-link').href = `#/product/${p.slug}?color=${st.color}`;
    $('#buy').href = `#/product/${p.slug}?color=${st.color}`;
    $('#p-colors').innerHTML = p.colors.map((c) => html`<button class="color-opt ${c === st.color ? 'on' : ''}" style="width:30px;height:30px;background:${colorHex(c)}" data-color="${c}" aria-label="${colorLabel(c)}"></button>`).join('');
    el.querySelectorAll('#picker button').forEach((b) => b.classList.toggle('on', b.dataset.slug === p.slug));
    history.replaceState(null, '', `#/try-on?product=${p.slug}&color=${st.color}`);
    loadOverlay();
  }
  $('#picker').addEventListener('click', (e) => {
    const b = e.target.closest('[data-slug]');
    if (!b) return;
    st.product = products.find((p) => p.slug === b.dataset.slug);
    if (!st.product.colors.includes(st.color)) st.color = st.product.colors[0];
    syncProduct();
  });
  $('#p-colors').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (b) { st.color = b.dataset.color; syncProduct(); }
  });
  el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    if (st.mode === b.dataset.mode) return;
    const prev = st.mode;
    st.mode = b.dataset.mode;
    el.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
    // Keep the garment anchored: convert between full-tee and chest-print geometry.
    if (st.t) {
      const unit = st.t.w / (prev === 'print' ? PRINT.w : SVG_W);
      const shift = (PRINT.cy - SVG_H / 2) * unit * (st.mode === 'print' ? 1 : -1);
      st.t = { ...st.t, w: (st.mode === 'print' ? PRINT.w : SVG_W) * unit, cx: st.t.cx - Math.sin(st.t.rot) * shift, cy: st.t.cy + Math.cos(st.t.rot) * shift };
    }
    syncSliders();
    loadOverlay();
  }));

  $('#download').addEventListener('click', () => {
    const picking = st.picking; st.picking = null; draw();
    cv.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `enrji-${st.product.slug}-look.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
    st.picking = picking; draw();
  });

  if (!st.product) { el.innerHTML = html`<div class="empty">No products available yet.</div>`; return; }
  syncProduct();

  return () => { stopCam(); overlaySeq++; };
}

/** A stylised mannequin drawn on a canvas, with known shoulder points. */
function mannequin() {
  const c = document.createElement('canvas');
  c.width = 900; c.height = 1100;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, c.height);
  bg.addColorStop(0, '#12153a'); bg.addColorStop(1, '#05060d');
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(0,240,255,.08)';
  for (let x = 0; x < c.width; x += 45) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
  for (let y = 0; y < c.height; y += 45) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }

  const skin = g.createLinearGradient(250, 0, 650, 0);
  skin.addColorStop(0, '#6b7090'); skin.addColorStop(0.5, '#b9bfdc'); skin.addColorStop(1, '#6b7090');
  g.fillStyle = skin;
  // head & neck
  g.beginPath(); g.ellipse(450, 190, 88, 108, 0, 0, Math.PI * 2); g.fill();
  g.fillRect(410, 270, 80, 90);
  // torso & arms
  g.beginPath();
  g.moveTo(250, 400); g.quadraticCurveTo(450, 330, 650, 400);
  g.quadraticCurveTo(720, 430, 745, 560); g.lineTo(770, 900); g.lineTo(705, 910); g.lineTo(660, 600);
  g.lineTo(650, 1100); g.lineTo(250, 1100); g.lineTo(240, 600); g.lineTo(195, 910); g.lineTo(130, 900);
  g.lineTo(155, 560); g.quadraticCurveTo(180, 430, 250, 400);
  g.fill();
  // visor
  g.fillStyle = 'rgba(0,240,255,.8)';
  g.shadowColor = '#00f0ff'; g.shadowBlur = 20;
  g.fillRect(375, 170, 150, 22);
  g.shadowBlur = 0;
  return { canvas: c, shoulders: [{ x: 262, y: 400 }, { x: 638, y: 400 }] };
}
