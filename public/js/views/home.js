import { api, html, productArt } from '../lib.js';
import { productCards } from './shop.js';

export async function render(el) {
  const { products } = await api('/products?featured=1');
  const hero = products[0];
  el.innerHTML = html`
    <section class="hero">
      <div>
        <div class="eyebrow">Drop 07 // Now live</div>
        <h1>Wear the <span>future</span>.<br>Charged with ENRJI.</h1>
        <p class="lead">Graphic tees on 240gsm organic cotton, in stock and ready to ship. Walk the store in 3D, try any design on your own photo, check out in seconds.</p>
        <div class="row">
          <a class="btn" href="#/shop">Shop the drop</a>
          <a class="btn ghost" href="#/tour">Enter virtual store →</a>
        </div>
        <div class="row" style="margin-top:28px">
          <span class="chip">⚡ Free shipping over $75</span>
          <span class="chip">↺ 30-day returns</span>
          <span class="chip">♻ Organic cotton</span>
        </div>
      </div>
      <a class="hero-stage" href="#/product/${hero?.slug ?? ''}" aria-label="${hero?.name ?? 'Featured tee'}">
        <div class="ring"></div><div class="ring r2"></div><div class="platform"></div>
        <div class="hero-shirt">${hero ? productArt(hero) : ''}</div>
      </a>
    </section>

    <section class="feature-row">
      <a class="feature" href="#/tour"><div class="ico">🛰</div><h3>Virtual Store Tour</h3><p>Walk a neon showroom in your browser. Click any tee on the wall to inspect and add it to your cart.</p></a>
      <a class="feature" href="#/try-on"><div class="ico">📸</div><h3>Try It On Yourself</h3><p>Upload a photo or use your camera, then fit any design to your shoulders. Your photo never leaves your device.</p></a>
      <a class="feature" href="#/shop"><div class="ico">⚡</div><h3>Ships in 1–2 days</h3><p>Every tee is in stock and dispatched from our warehouse. Free shipping over $75.</p></a>
    </section>

    <section>
      <div class="spread"><h2>Featured</h2><a href="#/shop">View all →</a></div>
      <div class="products" style="margin-top:16px">${productCards(products)}</div>
    </section>`;
}
