import { api, html, art, money, colorLabel, statusLabel, date, formData, toast, session } from '../lib.js';

const GUEST_KEY = 'enrji.orders.v1';

/** Guests keep access links to their orders in this browser. */
export function rememberOrder(id, token) {
  try {
    const list = JSON.parse(localStorage.getItem(GUEST_KEY) || '[]').filter((o) => o.id !== id);
    list.unshift({ id, token });
    localStorage.setItem(GUEST_KEY, JSON.stringify(list.slice(0, 20)));
  } catch { /* storage unavailable */ }
}
export function rememberedOrders() {
  try { return JSON.parse(localStorage.getItem(GUEST_KEY) || '[]'); } catch { return []; }
}

const STEPS = ['paid', 'processing', 'shipped', 'delivered'];

export async function render(el, { params, query }) {
  const token = query.t || rememberedOrders().find((o) => String(o.id) === params.id)?.token || '';
  const tq = token ? `?t=${encodeURIComponent(token)}` : '';
  let order;

  if (query.stripe_session) {
    try {
      const r = await api(`/orders/${params.id}/pay/stripe/confirm`, { method: 'POST', body: { token, sessionId: query.stripe_session } });
      if (r.paid) toast('Payment confirmed — thank you!');
    } catch (e) { toast(e.message, true); }
    history.replaceState(null, '', `#/order/${params.id}${tq}`);
  }
  if (query.cancelled) toast('Payment was cancelled. Your items are held for a little while.', true);

  async function load() {
    ({ order } = await api(`/orders/${params.id}${tq}`));
    draw();
  }

  function draw() {
    const o = order;
    const reached = STEPS.indexOf(o.status);
    const payable = o.status === 'pending_payment' && o.payment_provider === 'demo' && session.config?.providers.includes('demo');
    const a = o.shipping_address;
    el.innerHTML = html`
      <div class="spread">
        <div><div class="eyebrow">Order ${o.number}</div><h1 style="font-size:clamp(24px,4vw,40px)">${
          o.status === 'pending_payment' ? 'Awaiting payment' : o.status === 'cancelled' ? 'Order cancelled' : o.status === 'refunded' ? 'Order refunded' : 'Thanks, you’re charged up ⚡'}</h1></div>
        <span class="status ${o.status}">${statusLabel(o.status)}</span>
      </div>
      ${['cancelled', 'refunded', 'pending_payment'].includes(o.status) ? '' : html`
        <div class="progress">
          <div class="done">Placed</div>
          ${STEPS.map((s, i) => html`<div class="${i <= reached ? 'done' : ''}">${s}</div>`)}
        </div>`}
      ${o.tracking_number ? html`<p>Tracking number: <b class="mono">${o.tracking_number}</b></p>` : ''}

      <div class="checkout">
        <div class="stack">
          ${payable ? html`
            <form class="panel" id="pay" novalidate>
              <h3>Pay with demo card</h3>
              <div class="notice" style="margin-bottom:14px">Test mode: no real charge. Use <b class="mono">4242 4242 4242 4242</b>, any future expiry and any CVC.
                ${session.config?.demoDeclineCard ? html`<b class="mono">${session.config.demoDeclineCard.replace(/(\d{4})/g, '$1 ').trim()}</b> simulates a decline.` : ''}</div>
              <div class="card-visual"><div class="row" style="justify-content:space-between"><span>ENRJI//PAY</span><span>◈</span></div>
                <div class="num" id="cv-num">•••• •••• •••• ••••</div>
                <div class="row" style="justify-content:space-between;font-size:12px"><span id="cv-name">${o.name.toUpperCase()}</span><span id="cv-exp">MM/YY</span></div></div>
              <div class="field"><label for="cardNumber">Card number</label><input id="cardNumber" name="cardNumber" inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242" maxlength="23" required></div>
              <div class="fields-2">
                <div class="field"><label for="expiry">Expiry</label><input id="expiry" name="expiry" autocomplete="cc-exp" placeholder="MM/YY" maxlength="5" required></div>
                <div class="field"><label for="cvc">CVC</label><input id="cvc" name="cvc" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4" required></div>
              </div>
              <p class="error" id="pay-err"></p>
              <button class="btn block" id="pay-btn">Pay ${money(o.total_cents)}</button>
            </form>` : ''}
          ${o.status === 'pending_payment' && o.payment_provider === 'stripe' ? html`<div class="panel"><p>We haven't received confirmation from Stripe yet. If you completed payment, refresh in a moment.</p><button class="btn ghost sm" id="refresh">Refresh</button></div>` : ''}

          <div class="panel">
            <h3>Items</h3>
            ${o.items.map((i) => html`
              <div class="cart-line">
                <div class="thumb">${art(i.color, i.design, i.image)}</div>
                <div><div class="name">${i.product_name} × ${i.quantity}</div><div class="meta">${colorLabel(i.color)} · ${i.size} · <span class="mono">${i.sku}</span></div></div>
                <div class="mono">${money(i.unit_price_cents * i.quantity)}</div>
              </div>`)}
            <div class="totals" style="margin-top:12px">
              <div><span>Subtotal</span><span>${money(o.subtotal_cents)}</span></div>
              <div><span>Shipping</span><span>${o.shipping_cents ? money(o.shipping_cents) : 'Free'}</span></div>
              <div><span>Tax</span><span>${money(o.tax_cents)}</span></div>
              <div class="grand"><span>Total</span><span>${money(o.total_cents)}</span></div>
            </div>
          </div>
        </div>

        <aside class="stack">
          <div class="panel">
            <h3>Ship to</h3>
            <p style="margin:0">${o.name}<br>${a.line1}${a.line2 ? html`<br>${a.line2}` : ''}<br>${a.city}${a.region ? `, ${a.region}` : ''} ${a.postal}<br>${a.country}</p>
            <p class="muted" style="margin:10px 0 0;font-size:13px">Confirmation to ${o.email}</p>
          </div>
          <div class="panel">
            <h3>Timeline</h3>
            <ul class="timeline">${[...o.events].reverse().map((ev) => html`<li><b style="text-transform:capitalize">${statusLabel(ev.status)}</b><div class="muted" style="font-size:13px">${ev.note ?? ''}</div><div class="muted mono" style="font-size:11px">${date(ev.created_at)}</div></li>`)}</ul>
          </div>
          ${['pending_payment', 'paid'].includes(o.status) ? html`<button class="btn danger block" id="cancel">${o.status === 'paid' ? 'Cancel & refund order' : 'Cancel order'}</button>` : ''}
          ${!session.user && token ? html`<p class="muted" style="font-size:12px">Bookmark this page to check your order later, or <a href="#/account">create an account</a> with ${o.email} to see all your orders.</p>` : ''}
        </aside>
      </div>`;

    const pay = el.querySelector('#pay');
    if (pay) {
      const num = pay.querySelector('#cardNumber'), exp = pay.querySelector('#expiry');
      num.addEventListener('input', () => {
        num.value = num.value.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
        el.querySelector('#cv-num').textContent = (num.value + ' •••• •••• •••• ••••'.slice(num.value.length)).slice(0, 19) || '•••• •••• •••• ••••';
      });
      exp.addEventListener('input', (e) => {
        let v = exp.value.replace(/\D/g, '').slice(0, 4);
        if (v.length >= 3 || (v.length === 2 && e.inputType !== 'deleteContentBackward')) v = v.slice(0, 2) + '/' + v.slice(2);
        exp.value = v;
        el.querySelector('#cv-exp').textContent = v || 'MM/YY';
      });
      pay.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = el.querySelector('#pay-btn');
        btn.disabled = true; btn.textContent = 'Processing…';
        try {
          ({ order } = await api(`/orders/${o.id}/pay/demo`, { method: 'POST', body: { token, card: formData(pay) } }));
          toast('Payment successful');
          draw();
        } catch (ex) {
          el.querySelector('#pay-err').textContent = ex.message;
          btn.disabled = false; btn.textContent = `Pay ${money(o.total_cents)}`;
        }
      });
    }
    el.querySelector('#refresh')?.addEventListener('click', load);
    el.querySelector('#cancel')?.addEventListener('click', async () => {
      if (!confirm(o.status === 'paid' ? 'Cancel this order and refund your payment?' : 'Cancel this order?')) return;
      try {
        ({ order } = await api(`/orders/${o.id}/cancel`, { method: 'POST', body: { token } }));
        toast(order.status === 'refunded' ? 'Order cancelled and refunded' : 'Order cancelled');
        draw();
      } catch (ex) { toast(ex.message, true); }
    });
  }

  await load();
}
