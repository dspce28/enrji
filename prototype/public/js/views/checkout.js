import { api, html, art, money, colorLabel, cart, session, formData, toast } from '../lib.js';
import { rememberOrder } from './order.js';

export async function render(el, { navigate }) {
  if (!cart.items.length) {
    el.innerHTML = html`<div class="empty"><h2>Your cart is empty</h2><a class="btn" href="#/shop">Browse the drop</a></div>`;
    return;
  }
  const q = await cart.quote();
  const providers = session.config?.providers ?? [];
  const u = session.user;

  el.innerHTML = html`
    <div class="eyebrow">Secure checkout</div><h1>Checkout</h1>
    <div class="checkout">
      <form id="form" class="panel" novalidate>
        <h3>Contact</h3>
        ${u ? html`<p class="muted">Signed in as <b>${u.email}</b></p>`
            : html`<div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
                   <p class="muted" style="font-size:13px">Have an account? <a href="#/account?next=/checkout">Sign in</a> to track orders. Guest checkout works too.</p>`}
        <h3 style="margin-top:20px">Shipping address</h3>
        <div class="field"><label for="name">Full name</label><input id="name" name="name" autocomplete="name" required value="${u?.name ?? ''}"></div>
        <div class="field"><label for="line1">Address</label><input id="line1" name="line1" autocomplete="address-line1" required></div>
        <div class="field"><label for="line2">Apartment, suite (optional)</label><input id="line2" name="line2" autocomplete="address-line2"></div>
        <div class="fields-3">
          <div class="field"><label for="city">City</label><input id="city" name="city" autocomplete="address-level2" required></div>
          <div class="field"><label for="region">State / region</label><input id="region" name="region" autocomplete="address-level1"></div>
          <div class="field"><label for="postal">Postal code</label><input id="postal" name="postal" autocomplete="postal-code" required></div>
        </div>
        <div class="field"><label for="country">Country code</label><input id="country" name="country" autocomplete="country" maxlength="2" value="US" required style="max-width:120px;text-transform:uppercase"></div>

        <h3 style="margin-top:20px">Payment</h3>
        <div class="pay-opts">
          ${providers.includes('stripe') ? html`<label class="pay-opt"><input type="radio" name="provider" value="stripe" checked> <span><b>Card, Apple Pay, Google Pay</b><br><span class="muted" style="font-size:12px">Secure hosted checkout by Stripe</span></span></label>` : ''}
          ${providers.includes('demo') ? html`<label class="pay-opt"><input type="radio" name="provider" value="demo" ${providers.includes('stripe') ? '' : 'checked'}> <span><b>Demo card</b><br><span class="muted" style="font-size:12px">Simulated payment for testing. No real money moves.</span></span></label>` : ''}
          ${!providers.length ? html`<p class="error">No payment method is configured on this store.</p>` : ''}
        </div>
        <p class="error" id="err"></p>
        <button class="btn block" id="submit" ${!providers.length || q.problems.length ? 'disabled' : ''}>Place order · ${money(q.total_cents)}</button>
        <p class="muted" style="font-size:12px;margin-top:10px">Stock is reserved for 30 minutes while you pay.</p>
      </form>

      <aside class="panel">
        <h3>Order summary</h3>
        ${q.lines.map((l) => html`
          <div class="cart-line">
            <div class="thumb">${art(l.color, l.design, l.image)}</div>
            <div><div class="name">${l.name} × ${l.quantity}</div><div class="meta">${colorLabel(l.color)} · ${l.size}</div>
              ${q.problems.find((p) => p.variantId === l.id) ? html`<div class="warn">${q.problems.find((p) => p.variantId === l.id).error}</div>` : ''}</div>
            <div class="mono">${money(l.line_total_cents)}</div>
          </div>`)}
        <div class="totals" style="margin-top:12px">
          <div><span>Subtotal</span><span>${money(q.subtotal_cents)}</span></div>
          <div><span>Shipping</span><span>${q.shipping_cents ? money(q.shipping_cents) : 'Free'}</span></div>
          <div><span>Tax (${Math.round((session.config?.pricing.taxRate ?? 0) * 100)}%)</span><span>${money(q.tax_cents)}</span></div>
          <div class="grand"><span>Total</span><span>${money(q.total_cents)}</span></div>
        </div>
        ${q.problems.length ? html`<p class="error">Some items changed. <a href="#" id="open-cart">Update your cart</a>.</p>` : ''}
      </aside>
    </div>`;

  el.querySelector('#open-cart')?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('cart-btn').click(); });

  el.querySelector('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const err = el.querySelector('#err');
    const btn = el.querySelector('#submit');
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Reserving stock…';
    try {
      const out = await api('/checkout', {
        method: 'POST',
        body: {
          items: cart.items, email: f.email, name: f.name, provider: f.provider,
          address: { line1: f.line1, line2: f.line2, city: f.city, region: f.region, postal: f.postal, country: f.country },
        },
      });
      rememberOrder(out.order.id, out.token);
      cart.clear();
      if (out.redirectUrl) { btn.textContent = 'Redirecting to Stripe…'; location.href = out.redirectUrl; return; }
      navigate(`/order/${out.order.id}?t=${out.token}`);
    } catch (ex) {
      err.textContent = ex.data?.problems ? ex.data.problems.map((p) => p.error).join(' · ') : ex.message;
      if (ex.data?.problems) toast('Your cart changed — please review it', true);
      btn.disabled = false;
      btn.textContent = `Place order · ${money(q.total_cents)}`;
    }
  });
}
