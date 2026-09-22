import { api, html, raw, shirt, money, colorLabel, colorHex, statusLabel, date, toast, session } from '../lib.js';
import { shirtSVG, SHIRT_COLORS, DESIGN_TYPES } from '../shirt.js';

const TABS = [['dashboard', 'Dashboard'], ['orders', 'Orders'], ['inventory', 'Inventory'], ['products', 'Products'], ['payments', 'Payments']];
// Mirrors the server's state machine so the UI only offers legal moves.
const NEXT = { pending_payment: ['cancelled'], paid: ['processing', 'refunded'], processing: ['shipped', 'refunded'], shipped: ['delivered', 'refunded'], delivered: ['refunded'] };

export async function render(el, { params, navigate }) {
  if (session.user?.role !== 'admin') {
    el.innerHTML = html`<div class="empty"><h2>Admin access required</h2><p>Sign in with an admin account.</p><a class="btn" href="#/account?next=/admin">Sign in</a></div>`;
    return;
  }
  const tab = TABS.some(([t]) => t === params.tab) ? params.tab : 'dashboard';
  el.innerHTML = html`
    <div class="eyebrow">Control room</div><h1>Admin</h1>
    <nav class="admin-tabs">${TABS.map(([t, l]) => html`<a href="#/admin/${t}" class="${t === tab ? 'on' : ''}">${l}</a>`)}</nav>
    <div id="pane"><div class="spinner"></div></div>`;
  const pane = el.querySelector('#pane');
  await ({ dashboard, orders, inventory, products, payments })[tab](pane, navigate);
}

function modal(content) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = html`<div class="panel" role="dialog" aria-modal="true">${content}</div>`;
  const close = () => { m.remove(); document.removeEventListener('keydown', onKey); window.removeEventListener('hashchange', close); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', close);
  document.body.append(m);
  return { el: m, close };
}

// ---------- dashboard ----------
async function dashboard(pane) {
  const s = await api('/admin/stats');
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    days.push({ day: d, cents: s.daily.find((x) => x.day === d)?.cents ?? 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.cents));
  const open = (s.byStatus.paid ?? 0) + (s.byStatus.processing ?? 0);
  pane.innerHTML = html`
    ${s.refundsNeeded ? html`<div class="notice" style="margin-bottom:16px">⚠ ${s.refundsNeeded} payment(s) arrived after their order expired and need a manual refund. See <a href="#/admin/payments">Payments</a>.</div>` : ''}
    <div class="kpis">
      <div class="panel kpi"><div class="l">Revenue</div><div class="v">${money(s.revenue_cents)}</div></div>
      <div class="panel kpi"><div class="l">Paid orders</div><div class="v">${s.paid_orders}</div></div>
      <div class="panel kpi"><div class="l">To fulfil</div><div class="v" style="color:var(--cyan)">${open}</div></div>
      <div class="panel kpi"><div class="l">Units in stock</div><div class="v">${s.inventory.n}</div></div>
      <div class="panel kpi"><div class="l">Sold-out SKUs</div><div class="v" style="color:${s.inventory.soldOut ? 'var(--red)' : 'inherit'}">${s.inventory.soldOut ?? 0}</div></div>
      <div class="panel kpi"><div class="l">Customers</div><div class="v">${s.customers}</div></div>
    </div>
    <div class="two-col">
      <div class="panel"><h3>Revenue · last 14 days</h3>
        <div class="bars">${days.map((d) => html`<div class="bar" title="${d.day}: ${money(d.cents)}"><i style="height:${(d.cents / max) * 100}%"></i>${d.day.slice(8)}</div>`)}</div>
      </div>
      <div class="panel"><h3>Orders by status</h3>
        ${Object.keys(s.byStatus).length ? html`<table>${Object.entries(s.byStatus).map(([k, v]) => html`<tr><td><a href="#/admin/orders?status=${k}"><span class="status ${k}">${statusLabel(k)}</span></a></td><td class="mono">${v}</td></tr>`)}</table>` : html`<p class="muted">No orders yet.</p>`}
      </div>
      <div class="panel"><h3>Low stock</h3>
        ${s.lowStock.length ? html`<table><tr><th>Product</th><th>Variant</th><th>Stock</th></tr>${s.lowStock.map((v) => html`<tr><td>${v.name}</td><td>${colorLabel(v.color)} · ${v.size}</td><td class="stock-cell ${v.stock ? 'low' : 'out'}">${v.stock}</td></tr>`)}</table>
          <a href="#/admin/inventory?low=1" style="display:inline-block;margin-top:10px">Restock →</a>` : html`<p class="muted">All variants are above their thresholds.</p>`}
      </div>
      <div class="panel"><h3>Top sellers</h3>
        ${s.top.length ? html`<table><tr><th>Product</th><th>Units</th><th>Revenue</th></tr>${s.top.map((t) => html`<tr><td>${t.name}</td><td class="mono">${t.units}</td><td class="mono">${money(t.cents)}</td></tr>`)}</table>` : html`<p class="muted">No sales yet.</p>`}
      </div>
    </div>`;
}

// ---------- orders ----------
async function orders(pane) {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const state = { status: q.get('status') || '', q: '' };
  pane.innerHTML = html`
    <div class="filters">
      <input type="search" id="q" placeholder="Search number, email, name" aria-label="Search orders">
      <select id="status" aria-label="Status"><option value="">All statuses</option></select>
    </div>
    <div class="panel table-wrap" id="list"></div>`;
  const sel = pane.querySelector('#status');

  async function load() {
    const { orders, statuses } = await api(`/admin/orders?status=${state.status}&q=${encodeURIComponent(state.q)}`);
    if (sel.options.length === 1) {
      sel.insertAdjacentHTML('beforeend', statuses.map((s) => html`<option value="${s}">${statusLabel(s)}</option>`).join(''));
      sel.value = state.status;
    }
    pane.querySelector('#list').innerHTML = orders.length ? html`<table>
      <tr><th>Order</th><th>Customer</th><th>Placed</th><th>Units</th><th>Total</th><th>Pay</th><th>Status</th></tr>
      ${orders.map((o) => html`<tr>
        <td><a href="#" class="mono" data-order="${o.id}">${o.number}</a></td>
        <td>${o.name}<div class="muted" style="font-size:12px">${o.email}</div></td>
        <td>${date(o.created_at)}</td><td class="mono">${o.units}</td><td class="mono">${money(o.total_cents)}</td>
        <td class="muted">${o.payment_provider}</td>
        <td><span class="status ${o.status}">${statusLabel(o.status)}</span></td></tr>`)}
    </table>` : html`<p class="empty">No orders match.</p>`;
  }

  let t;
  pane.querySelector('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; load(); }, 250); });
  sel.addEventListener('change', () => { state.status = sel.value; load(); });
  pane.querySelector('#list').addEventListener('click', (e) => {
    const a = e.target.closest('[data-order]');
    if (a) { e.preventDefault(); orderModal(+a.dataset.order, load); }
  });
  await load();
}

async function orderModal(id, onChange) {
  const { order: o } = await api(`/admin/orders/${id}`);
  const a = o.shipping_address;
  const next = NEXT[o.status] ?? [];
  const m = modal(html`
    <div class="spread"><h2 style="margin:0">${o.number}</h2><div class="row"><span class="status ${o.status}">${statusLabel(o.status)}</span><button class="icon-btn" data-close aria-label="Close">✕</button></div></div>
    <p class="muted">${date(o.created_at)} · ${o.payment_provider} · <a href="#/order/${o.id}" data-close>customer view</a></p>
    <div class="two-col">
      <div>
        <h3>Items</h3>
        ${o.items.map((i) => html`<div class="cart-line"><div class="thumb">${shirt(i.color, i.design)}</div><div><b>${i.product_name}</b> × ${i.quantity}<div class="meta">${colorLabel(i.color)} · ${i.size} · <span class="mono">${i.sku}</span></div></div><div class="mono">${money(i.unit_price_cents * i.quantity)}</div></div>`)}
        <div class="totals" style="margin-top:8px"><div><span>Subtotal</span><span>${money(o.subtotal_cents)}</span></div><div><span>Shipping</span><span>${money(o.shipping_cents)}</span></div><div><span>Tax</span><span>${money(o.tax_cents)}</span></div><div class="grand"><span>Total</span><span>${money(o.total_cents)}</span></div></div>
      </div>
      <div>
        <h3>Customer</h3>
        <p>${o.name}<br><a href="mailto:${o.email}">${o.email}</a><br>${a.line1}${a.line2 ? `, ${a.line2}` : ''}<br>${a.city}${a.region ? `, ${a.region}` : ''} ${a.postal} · ${a.country}</p>
        ${o.tracking_number ? html`<p>Tracking: <b class="mono">${o.tracking_number}</b></p>` : ''}
        <h3>Payments</h3>
        ${o.payments.length ? html`<table>${o.payments.map((p) => html`<tr><td><span class="status ${p.status}">${p.status}</span></td><td class="mono">${money(p.amount_cents)}</td><td class="muted" style="font-size:12px">${p.detail ?? ''}</td></tr>`)}</table>` : html`<p class="muted">None</p>`}
        <h3 style="margin-top:16px">Timeline</h3>
        <ul class="timeline">${[...o.events].reverse().map((ev) => html`<li><b style="text-transform:capitalize">${statusLabel(ev.status)}</b> <span class="muted" style="font-size:12px">${date(ev.created_at)}</span><div class="muted" style="font-size:13px">${ev.note ?? ''}</div></li>`)}</ul>
      </div>
    </div>
    ${next.length ? html`<hr><form id="st" class="row" style="align-items:flex-end">
      <div style="flex:1;min-width:160px"><label for="to">Move to</label><select id="to" name="status">${next.map((s) => html`<option value="${s}">${statusLabel(s)}</option>`)}</select></div>
      <div style="flex:1;min-width:160px" id="track-wrap"><label for="tracking">Tracking number</label><input id="tracking" name="trackingNumber" placeholder="optional"></div>
      <div style="flex:2;min-width:200px"><label for="note">Note (shown to customer)</label><input id="note" name="note" placeholder="optional"></div>
      <button class="btn">Update</button>
    </form><p class="muted" style="font-size:12px">Cancelling or refunding before shipment returns stock automatically. Refunds go back through the original payment provider.</p>` : ''}`);

  const form = m.el.querySelector('#st');
  if (!form) return;
  const tw = m.el.querySelector('#track-wrap');
  const sync = () => (tw.hidden = form.elements.status.value !== 'shipped');
  form.elements.status.addEventListener('change', sync);
  sync();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = form.elements.status.value;
    if (['cancelled', 'refunded'].includes(status) && !confirm(`Really mark ${o.number} as ${status}?`)) return;
    try {
      await api(`/admin/orders/${o.id}/status`, { method: 'POST', body: { status, note: form.elements.note.value, trackingNumber: form.elements.trackingNumber.value } });
      toast(`Order ${o.number} → ${statusLabel(status)}`);
      m.close();
      onChange();
    } catch (ex) { toast(ex.message, true); }
  });
}

// ---------- inventory ----------
async function inventory(pane) {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const state = { q: '', low: q.get('low') === '1' };
  pane.innerHTML = html`
    <div class="filters">
      <input type="search" id="q" placeholder="Search product or SKU" aria-label="Search inventory">
      <label class="row" style="margin:0;color:var(--text)"><input type="checkbox" id="low" ${state.low ? 'checked' : ''}> Low / sold out only</label>
      <button class="btn ghost sm" id="log" style="margin-left:auto">Movement log</button>
    </div>
    <div class="panel table-wrap" id="list"></div>`;

  async function load() {
    const { variants } = await api(`/admin/inventory?q=${encodeURIComponent(state.q)}${state.low ? '&low=1' : ''}`);
    pane.querySelector('#list').innerHTML = variants.length ? html`<table>
      <tr><th></th><th>Product</th><th>SKU</th><th>Variant</th><th>Stock</th><th>Alert at</th><th>Adjust</th></tr>
      ${variants.map((v) => html`<tr data-row="${v.id}">
        <td><div class="inv-thumb">${shirt(v.color, v.design)}</div></td>
        <td>${v.product_name}</td><td class="mono" style="font-size:12px">${v.sku}</td>
        <td><span class="swatch" style="display:inline-block;vertical-align:middle;background:${colorHex(v.color)}"></span> ${colorLabel(v.color)} · <b>${v.size}</b></td>
        <td class="stock-cell ${v.stock === 0 ? 'out' : v.stock <= v.low_stock_threshold ? 'low' : ''}">${v.stock}</td>
        <td><input type="number" min="0" value="${v.low_stock_threshold}" data-threshold="${v.id}" style="width:70px;padding:6px" aria-label="Low stock threshold"></td>
        <td><div class="row" style="flex-wrap:nowrap;gap:6px">
          <input type="number" placeholder="±qty" data-delta="${v.id}" style="width:80px;padding:6px" aria-label="Quantity change">
          <select data-reason="${v.id}" style="width:auto;padding:6px"><option value="restock">Restock</option><option value="adjustment">Adjust</option><option value="damaged">Damaged</option><option value="count">Set count</option></select>
          <button class="btn sm" data-apply="${v.id}">Apply</button>
        </div></td></tr>`)}
    </table>` : html`<p class="empty">Nothing matches.</p>`;
  }

  const list = pane.querySelector('#list');
  list.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-apply]');
    if (!b) return;
    const id = b.dataset.apply;
    const n = Number(list.querySelector(`[data-delta="${id}"]`).value);
    const reason = list.querySelector(`[data-reason="${id}"]`).value;
    if (!Number.isInteger(n) || (reason !== 'count' && n === 0)) { toast('Enter a whole number', true); return; }
    const body = reason === 'count' ? { reason, set: n } : { reason, delta: reason === 'damaged' ? -Math.abs(n) : n };
    try {
      const { variant } = await api(`/admin/inventory/${id}/adjust`, { method: 'POST', body });
      toast(`${variant.sku}: now ${variant.stock} in stock`);
      load();
    } catch (ex) { toast(ex.message, true); }
  });
  list.addEventListener('change', async (e) => {
    const t = e.target.closest('[data-threshold]');
    if (!t) return;
    try { await api(`/admin/inventory/${t.dataset.threshold}`, { method: 'PUT', body: { low_stock_threshold: Number(t.value) } }); toast('Threshold saved'); load(); }
    catch (ex) { toast(ex.message, true); }
  });
  let tm;
  pane.querySelector('#q').addEventListener('input', (e) => { clearTimeout(tm); tm = setTimeout(() => { state.q = e.target.value; load(); }, 250); });
  pane.querySelector('#low').addEventListener('change', (e) => { state.low = e.target.checked; load(); });
  pane.querySelector('#log').addEventListener('click', async () => {
    const { movements } = await api('/admin/inventory/movements');
    modal(html`<div class="spread"><h2 style="margin:0">Inventory movements</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="table-wrap"><table><tr><th>When</th><th>SKU</th><th>Change</th><th>Reason</th><th>Ref</th><th>By</th></tr>
      ${movements.map((m) => html`<tr><td style="font-size:12px">${date(m.created_at)}</td><td class="mono" style="font-size:12px">${m.sku}</td>
        <td class="mono" style="color:${m.delta > 0 ? 'var(--lime)' : 'var(--red)'}">${m.delta > 0 ? '+' : ''}${m.delta}</td><td>${m.reason}</td>
        <td class="muted" style="font-size:12px">${m.ref ?? ''}</td><td class="muted" style="font-size:12px">${m.user_email ?? 'system'}</td></tr>`)}</table></div>`);
  });
  await load();
}

// ---------- products ----------
async function products(pane) {
  async function load() {
    const { products } = await api('/admin/products');
    pane.innerHTML = html`
      <div class="spread" style="margin-bottom:16px"><p class="muted" style="margin:0">${products.length} products · archived products stay on past orders but leave the store.</p><button class="btn" id="new">+ New product</button></div>
      <div class="panel table-wrap"><table>
        <tr><th></th><th>Name</th><th>Category</th><th>Price</th><th>Colors</th><th>Stock</th><th>Status</th><th></th></tr>
        ${products.map((p) => html`<tr>
          <td><div class="inv-thumb">${shirt(p.colors[0], p.design)}</div></td>
          <td><b>${p.name}</b>${p.featured ? html` <span class="chip">featured</span>` : ''}</td>
          <td>${p.category}</td><td class="mono">${money(p.price_cents)}</td>
          <td><div class="swatches" style="margin:0">${p.colors.map((c) => html`<span class="swatch" title="${colorLabel(c)}" style="background:${colorHex(c)}"></span>`)}</div></td>
          <td class="mono">${p.total_stock}</td>
          <td>${p.active ? html`<span class="status delivered">live</span>` : html`<span class="status cancelled">archived</span>`}</td>
          <td><button class="btn ghost sm" data-edit="${p.id}">Edit</button></td></tr>`)}
      </table></div>`;
    pane.querySelector('#new').onclick = () => editor(null, load);
    pane.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => editor(products.find((p) => p.id === +b.dataset.edit), load)));
  }
  await load();
}

function editor(p, onSaved) {
  const d = p?.design ?? { type: 'bolt', accent: '#00f0ff', accent2: '#ff2bd6', text: '' };
  const m = modal(html`
    <div class="spread"><h2 style="margin:0">${p ? `Edit ${p.name}` : 'New product'}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <form id="pf" class="two-col" style="margin-top:16px">
      <div>
        <div class="field"><label>Name</label><input name="name" required value="${p?.name ?? ''}"></div>
        <div class="fields-2">
          <div class="field"><label>Price (USD)</label><input name="price" type="number" step="0.01" min="1" required value="${p ? (p.price_cents / 100).toFixed(2) : '32.00'}"></div>
          <div class="field"><label>Category</label><input name="category" value="${p?.category ?? 'core'}"></div>
        </div>
        <div class="field"><label>Description</label><textarea name="description" rows="3">${p?.description ?? ''}</textarea></div>
        <div class="field"><label>Colors ${p ? '(existing colors cannot be removed)' : ''}</label>
          <div class="check-grid">${Object.entries(SHIRT_COLORS).map(([k, c]) => html`<label><input type="checkbox" name="colors" value="${k}" ${p?.colors.includes(k) ? raw('checked disabled') : !p && k === 'void-black' ? 'checked' : ''}><span class="swatch" style="background:${c.hex}"></span>${c.label}</label>`)}</div></div>
        ${p ? '' : html`<div class="field"><label>Initial stock per size</label><input name="initial_stock" type="number" min="0" value="10"></div>`}
        <div class="row"><label class="row" style="margin:0;color:var(--text)"><input type="checkbox" name="featured" ${p?.featured ? 'checked' : ''}> Featured</label>
          <label class="row" style="margin:0;color:var(--text)"><input type="checkbox" name="active" ${!p || p.active ? 'checked' : ''}> Live in store</label></div>
      </div>
      <div>
        <div class="design-preview" id="pv"></div>
        <div class="field"><label>Design</label><select name="type">${DESIGN_TYPES.map((t) => html`<option ${t === d.type ? 'selected' : ''}>${t}</option>`)}</select></div>
        <div class="fields-2">
          <div class="field"><label>Accent 1</label><input type="color" name="accent" value="${d.accent}"></div>
          <div class="field"><label>Accent 2</label><input type="color" name="accent2" value="${d.accent2}"></div>
        </div>
        <div class="field"><label>Text (glitch design, max 12)</label><input name="text" maxlength="12" value="${d.text ?? ''}"></div>
        <label>Preview color</label><select id="pvc">${(p?.colors ?? Object.keys(SHIRT_COLORS)).map((c) => html`<option value="${c}">${colorLabel(c)}</option>`)}</select>
      </div>
      <div style="grid-column:1/-1" class="spread">
        <span class="error" id="err"></span>
        <button class="btn">${p ? 'Save changes' : 'Create product'}</button>
      </div>
    </form>`);
  const f = m.el.querySelector('#pf');
  const pv = m.el.querySelector('#pv');
  const design = () => ({ type: f.elements.type.value, accent: f.elements.accent.value, accent2: f.elements.accent2.value, text: f.elements.text.value });
  const preview = () => (pv.innerHTML = shirtSVG({ color: m.el.querySelector('#pvc').value, design: design() }));
  f.addEventListener('input', preview);
  m.el.querySelector('#pvc').addEventListener('change', preview);
  preview();

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const colors = [...f.querySelectorAll('input[name=colors]:checked:not(:disabled)')].map((i) => i.value);
    const body = {
      name: f.elements.name.value, description: f.elements.description.value, category: f.elements.category.value,
      price_cents: Math.round(Number(f.elements.price.value) * 100), design: design(),
      featured: f.elements.featured.checked, active: f.elements.active.checked,
    };
    try {
      if (p) await api(`/admin/products/${p.id}`, { method: 'PUT', body: colors.length ? { ...body, colors } : body });
      else await api('/admin/products', { method: 'POST', body: { ...body, colors, initial_stock: Number(f.elements.initial_stock.value) } });
      toast(p ? 'Product saved' : 'Product created');
      m.close();
      onSaved();
    } catch (ex) { m.el.querySelector('#err').textContent = ex.message; }
  });
}

// ---------- payments ----------
async function payments(pane) {
  const { payments } = await api('/admin/payments');
  const cfg = session.config;
  pane.innerHTML = html`
    <div class="row" style="margin-bottom:16px">
      <span class="chip">Stripe: ${cfg.providers.includes('stripe') ? 'connected' : 'not configured'}</span>
      <span class="chip">Demo payments: ${cfg.providers.includes('demo') ? 'ON (no real money)' : 'off'}</span>
    </div>
    <div class="panel table-wrap">${payments.length ? html`<table>
      <tr><th>When</th><th>Order</th><th>Provider</th><th>Reference</th><th>Amount</th><th>Status</th><th>Detail</th></tr>
      ${payments.map((p) => html`<tr><td style="font-size:12px">${date(p.created_at)}</td><td class="mono">${p.number}</td><td>${p.provider}</td>
        <td class="mono" style="font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis">${p.provider_ref ?? ''}</td>
        <td class="mono">${money(p.amount_cents)}</td><td><span class="status ${p.status}">${p.status.replace('_', ' ')}</span></td><td class="muted" style="font-size:12px">${p.detail ?? ''}</td></tr>`)}
    </table>` : html`<p class="empty">No payments yet.</p>`}</div>`;
}
