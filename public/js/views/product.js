import { api, html, raw, productArt, money, colorHex, colorLabel, cart, emit, toast } from '../lib.js';
import { SIZES } from '../shirt.js';

export async function render(el, { params, query }) {
  const { product: p } = await api(`/products/${encodeURIComponent(params.slug)}`);
  document.title = `${p.name} — ENRJI`;
  const byKey = new Map(p.variants.map((v) => [`${v.color}|${v.size}`, v]));
  const state = {
    color: p.colors.includes(query.color) ? query.color : p.colors[0],
    size: null,
    qty: 1,
  };

  el.innerHTML = html`
    <div class="pdp">
      <div class="pdp-art" id="art"><div class="tilt" id="tilt"></div></div>
      <div>
        <a href="#/shop" class="muted" style="font-size:13px">← Back to the drop</a>
        <div class="eyebrow" style="margin-top:16px">${p.category.replace('-', ' ')}</div>
        <h1 style="font-size:clamp(28px,4vw,44px)">${p.name}</h1>
        <div class="mono" style="font-size:22px;color:var(--cyan)">${money(p.price_cents)}</div>
        <p class="muted" style="margin-top:14px">${p.description}</p>

        <div class="option-label">Color — <span id="color-name"></span></div>
        <div class="color-opts" id="colors">${p.colors.map((c) => html`<button class="color-opt" data-color="${c}" style="background:${colorHex(c)}" aria-label="${colorLabel(c)}"></button>`)}</div>

        <div class="option-label">Size <a href="#" id="size-guide" style="text-transform:none;letter-spacing:0;margin-left:8px">Size guide</a></div>
        <div class="size-opts" id="sizes"></div>
        <div class="stock-note" id="stock"></div>
        <div id="guide" hidden class="panel" style="margin-top:10px;font-size:13px">
          <table><tr><th>Size</th>${SIZES.map((s) => html`<th>${s}</th>`)}</tr>
          <tr><td>Chest (in)</td>${[34, 37, 40, 44, 48, 52].map((n) => html`<td>${n}</td>`)}</tr>
          <tr><td>Length (in)</td>${[26, 27, 28, 29, 30, 31].map((n) => html`<td>${n}</td>`)}</tr></table>
        </div>

        <div class="row" style="margin-top:22px">
          <div class="qty"><button id="dec" aria-label="Decrease">−</button><span id="qty">1</span><button id="inc" aria-label="Increase">+</button></div>
          <button class="btn" id="add" style="flex:1">Add to cart</button>
        </div>
        <div class="row" style="margin-top:12px">
          <a class="btn ghost sm" id="tryon-link">📸 Try it on yourself</a>
          <a class="btn ghost sm" href="#/tour">🛰 See it in the virtual store</a>
        </div>
        <div class="specs">
          <div><b>240gsm</b>Organic cotton</div>
          <div><b>Relaxed</b>Boxy future fit</div>
          <div><b>1–2 days</b>Ships from stock</div>
        </div>
      </div>
    </div>`;

  const tilt = el.querySelector('#tilt');
  const art = el.querySelector('#art');

  function update() {
    tilt.innerHTML = productArt(p, state.color);
    el.querySelector('#color-name').textContent = colorLabel(state.color);
    el.querySelectorAll('.color-opt').forEach((b) => b.classList.toggle('on', b.dataset.color === state.color));
    el.querySelector('#sizes').innerHTML = SIZES.map((s) => {
      const v = byKey.get(`${state.color}|${s}`);
      return html`<button class="size-opt ${state.size === s ? 'on' : ''}" data-size="${s}" ${raw(!v || v.stock === 0 ? 'disabled' : '')}>${s}</button>`;
    }).join('');
    const v = state.size && byKey.get(`${state.color}|${state.size}`);
    if (v && v.stock === 0) state.size = null;
    const note = el.querySelector('#stock');
    const variant = state.size && byKey.get(`${state.color}|${state.size}`);
    if (!variant) { note.textContent = 'Select a size'; note.className = 'stock-note muted'; }
    else if (variant.stock <= 5) { note.textContent = `Only ${variant.stock} left in ${state.size}`; note.className = 'stock-note low'; }
    else { note.textContent = '✓ In stock, ships in 1–2 days'; note.className = 'stock-note'; }
    state.qty = Math.min(state.qty, variant?.stock || 10);
    el.querySelector('#qty').textContent = state.qty;
    el.querySelector('#add').disabled = !variant;
    el.querySelector('#tryon-link').href = `#/try-on?product=${p.slug}&color=${state.color}`;
    history.replaceState(null, '', `#/product/${p.slug}?color=${state.color}`);
  }

  el.querySelector('#colors').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (b) { state.color = b.dataset.color; update(); }
  });
  el.querySelector('#sizes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-size]');
    if (b && !b.disabled) { state.size = b.dataset.size; update(); }
  });
  el.querySelector('#inc').onclick = () => { const v = byKey.get(`${state.color}|${state.size}`); state.qty = Math.min(state.qty + 1, v?.stock ?? 10, 10); el.querySelector('#qty').textContent = state.qty; };
  el.querySelector('#dec').onclick = () => { state.qty = Math.max(1, state.qty - 1); el.querySelector('#qty').textContent = state.qty; };
  el.querySelector('#size-guide').onclick = (e) => { e.preventDefault(); const g = el.querySelector('#guide'); g.hidden = !g.hidden; };
  el.querySelector('#add').onclick = () => {
    const v = byKey.get(`${state.color}|${state.size}`);
    if (!v) return;
    const inCart = cart.items.find((l) => l.variantId === v.id)?.quantity || 0;
    if (inCart + state.qty > v.stock) { toast(`Only ${v.stock} available`, true); return; }
    cart.add(v.id, state.qty);
    toast(`${p.name} (${state.size}) added to cart`);
    emit('open-cart');
  };

  // Holographic tilt follows the pointer.
  const onMove = (e) => {
    const r = art.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    tilt.style.transform = `rotateY(${x * 18}deg) rotateX(${-y * 14}deg) scale(1.03)`;
  };
  art.addEventListener('pointermove', onMove);
  art.addEventListener('pointerleave', () => (tilt.style.transform = ''));
  update();
  return () => { document.title = 'ENRJI — Future-grade tees'; };
}
