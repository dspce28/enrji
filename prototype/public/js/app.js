import { cart, on, loadSession, session, html, raw, art, money, colorLabel, toast } from './lib.js';

// Route table: pattern → lazy view module. Views export render(el, ctx) and may return a cleanup fn.
const routes = [
  ['/', () => import('./views/home.js')],
  ['/shop', () => import('./views/shop.js')],
  ['/product/:slug', () => import('./views/product.js')],
  ['/tour', () => import('./views/tour.js'), { full: true }],
  ['/try-on', () => import('./views/tryon.js')],
  ['/checkout', () => import('./views/checkout.js')],
  ['/order/:id', () => import('./views/order.js')],
  ['/account', () => import('./views/account.js')],
  ['/admin', () => import('./views/admin.js')],
  ['/admin/:tab', () => import('./views/admin.js')],
];

const app = document.getElementById('app');
let cleanup = null;
let navToken = 0;

function match(path) {
  for (const [pattern, load, opts] of routes) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
    const m = re.exec(path);
    if (m) return { load, opts: opts || {}, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

export function parseHash() {
  const h = location.hash.startsWith('#/') ? location.hash.slice(1) : '/';
  const [path, qs = ''] = h.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs)) };
}

async function navigate() {
  if (location.hash && !location.hash.startsWith('#/')) return; // in-page anchors
  const token = ++navToken;
  const { path, query } = parseHash();
  const route = match(path);
  if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
  cleanup = null;

  document.querySelectorAll('.nav a').forEach((a) => {
    const href = a.getAttribute('href').slice(1);
    a.classList.toggle('active', href !== '/' && path.startsWith(href));
  });
  document.getElementById('nav').classList.remove('open');
  app.classList.toggle('full', !!route?.opts.full);
  document.querySelector('.footer').hidden = !!route?.opts.full;

  if (!route) {
    app.innerHTML = html`<div class="empty"><h1>404</h1><p>This sector of the grid does not exist.</p><a class="btn" href="#/shop">Back to shop</a></div>`;
    return;
  }
  app.innerHTML = '<div class="spinner" aria-label="Loading"></div>';
  try {
    const mod = await route.load();
    if (token !== navToken) return;
    app.innerHTML = '';
    const out = await mod.render(app, { params: route.params, query, navigate: go });
    if (token !== navToken) { if (typeof out === 'function') out(); return; }
    cleanup = out;
  } catch (err) {
    console.error(err);
    if (token !== navToken) return;
    app.innerHTML = html`<div class="empty"><h2>Signal interrupted</h2><p>${err.message}</p><button class="btn ghost" id="retry">Retry</button></div>`;
    app.querySelector('#retry').onclick = navigate;
  }
  window.scrollTo(0, 0);
}

export function go(path) {
  if (location.hash === '#' + path) navigate();
  else location.hash = path;
}

// ---------- header ----------
function renderHeader() {
  const acct = document.getElementById('nav-account');
  acct.textContent = session.user ? 'My account' : 'Sign in';
  document.getElementById('nav-admin').hidden = session.user?.role !== 'admin';
}

function renderBadge(bump) {
  const b = document.getElementById('cart-count');
  b.textContent = cart.count();
  b.hidden = cart.count() === 0;
  if (bump) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
}

document.querySelector('.nav-toggle').addEventListener('click', (e) => {
  const nav = document.getElementById('nav');
  nav.classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', nav.classList.contains('open'));
});

// ---------- cart drawer ----------
const drawer = document.getElementById('drawer');
const drawerBody = document.getElementById('drawer-body');

export function openCart() {
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  renderDrawer();
}
function closeCart() {
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
}

let drawerSeq = 0;
async function renderDrawer() {
  if (!drawer.classList.contains('open')) return;
  const seq = ++drawerSeq;
  if (!cart.items.length) {
    drawerBody.innerHTML = html`<div class="empty"><p>Your cart is empty.</p><a class="btn" href="#/shop" data-close-drawer>Browse the drop</a></div>`;
    return;
  }
  let q;
  try { q = await cart.quote(); } catch (e) { drawerBody.innerHTML = html`<p class="error">${e.message}</p>`; return; }
  if (seq !== drawerSeq) return;
  const problems = Object.fromEntries(q.problems.map((p) => [p.variantId, p.error]));
  const known = new Set(q.lines.map((l) => l.id));
  const stale = cart.items.filter((l) => !known.has(l.variantId));
  if (stale.length) { cart.items = cart.items.filter((l) => known.has(l.variantId)); cart.save(); toast('Removed items that are no longer available'); return; }
  const freeGap = session.config?.pricing.freeShippingOverCents - q.subtotal_cents;
  drawerBody.innerHTML = html`
    ${q.lines.map((l) => html`
      <div class="cart-line">
        <div class="thumb">${art(l.color, l.design, l.image)}</div>
        <div>
          <a class="name" href="#/product/${l.slug}" data-close-drawer>${l.name}</a>
          <div class="meta">${colorLabel(l.color)} · ${l.size} · ${money(l.price_cents)}</div>
          ${problems[l.id] ? html`<div class="warn">${problems[l.id]}</div>` : ''}
          <div class="qty" style="margin-top:6px">
            <button data-dec="${l.id}" aria-label="Decrease">−</button><span>${l.quantity}</span><button data-inc="${l.id}" aria-label="Increase">+</button>
          </div>
        </div>
        <div class="mono">${money(l.line_total_cents)}</div>
      </div>`)}
    <div style="margin-top:auto;padding-top:16px">
      ${freeGap > 0 ? html`<p class="muted" style="font-size:13px">Add ${money(freeGap)} more for free shipping.</p>` : html`<p class="muted" style="font-size:13px">✓ Free shipping unlocked</p>`}
      <div class="totals">
        <div><span>Subtotal</span><span>${money(q.subtotal_cents)}</span></div>
        <div><span>Shipping</span><span>${q.shipping_cents ? money(q.shipping_cents) : 'Free'}</span></div>
        <div><span>Tax</span><span>${money(q.tax_cents)}</span></div>
        <div class="grand"><span>Total</span><span>${money(q.total_cents)}</span></div>
      </div>
      <a class="btn block" href="#/checkout" data-close-drawer style="margin-top:14px" ${raw(q.problems.length ? 'aria-disabled="true"' : '')}>Checkout</a>
      ${q.problems.length ? html`<p class="error">Fix the highlighted items to continue.</p>` : ''}
    </div>`;
}

drawer.addEventListener('click', (e) => {
  if (e.target === drawer || e.target.closest('[data-close-drawer]')) closeCart();
  const inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]');
  if (inc) { const id = +inc.dataset.inc; cart.set(id, (cart.items.find((l) => l.variantId === id)?.quantity || 0) + 1); }
  if (dec) { const id = +dec.dataset.dec; cart.set(id, (cart.items.find((l) => l.variantId === id)?.quantity || 0) - 1); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCart(); });
document.getElementById('cart-btn').addEventListener('click', openCart);

on('cart', () => { renderBadge(true); renderDrawer(); });
on('open-cart', openCart);
on('session', renderHeader);

window.addEventListener('hashchange', navigate);
renderBadge(false);
loadSession().catch(() => toast('Could not reach the store server', true)).finally(navigate);
