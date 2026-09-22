import { api, html, shirt, money, colorHex, colorLabel } from '../lib.js';

export function productCards(products) {
  if (!products.length) return html`<div class="empty" style="grid-column:1/-1">No tees match that search.</div>`;
  return products.map((p) => html`
    <a class="card" href="#/product/${p.slug}">
      ${p.total_stock === 0 ? html`<span class="chip flag">Sold out</span>` : p.featured ? html`<span class="chip flag" style="color:var(--cyan)">Featured</span>` : ''}
      <div class="art">${shirt(p.colors[0], p.design)}</div>
      <div class="info">
        <div class="spread"><span class="name">${p.name}</span><span class="price">${money(p.price_cents)}</span></div>
        <div class="swatches">${p.colors.map((c) => html`<span class="swatch" title="${colorLabel(c)}" style="background:${colorHex(c)}"></span>`)}</div>
      </div>
    </a>`);
}

export async function render(el, { query, navigate }) {
  const state = { q: query.q ?? '', category: query.category ?? '', sort: query.sort ?? '' };
  el.innerHTML = html`
    <div class="spread"><div><div class="eyebrow">Catalog</div><h1>The Drop</h1></div></div>
    <div class="filters">
      <input type="search" id="q" placeholder="Search designs…" value="${state.q}" aria-label="Search">
      <div class="row" id="cats"></div>
      <select id="sort" aria-label="Sort" style="margin-left:auto">
        <option value="">Featured</option><option value="new">Newest</option>
        <option value="price-asc">Price: low → high</option><option value="price-desc">Price: high → low</option>
      </select>
    </div>
    <div class="products" id="grid"><div class="spinner"></div></div>`;
  el.querySelector('#sort').value = state.sort;

  let seq = 0;
  async function load() {
    const s = ++seq;
    const qs = new URLSearchParams(Object.entries(state).filter(([, v]) => v)).toString();
    history.replaceState(null, '', `#/shop${qs ? '?' + qs : ''}`);
    const { products, categories } = await api(`/products?${qs}`);
    if (s !== seq) return;
    el.querySelector('#grid').innerHTML = productCards(products);
    el.querySelector('#cats').innerHTML = html`<button class="pill ${state.category ? '' : 'on'}" data-cat="">All</button>${categories.map((c) => html`<button class="pill ${state.category === c ? 'on' : ''}" data-cat="${c}">${c.replace('-', ' ')}</button>`)}`;
  }

  let t;
  el.querySelector('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 250); });
  el.querySelector('#sort').addEventListener('change', (e) => { state.sort = e.target.value; load(); });
  el.querySelector('#cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (b) { state.category = b.dataset.cat; load(); }
  });
  await load();
  return () => clearTimeout(t);
}
