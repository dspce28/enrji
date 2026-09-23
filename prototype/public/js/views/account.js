import { api, html, money, statusLabel, date, formData, setUser, session, toast } from '../lib.js';
import { rememberedOrders } from './order.js';

function orderRows(orders, withToken) {
  if (!orders.length) return html`<p class="muted">No orders yet. <a href="#/shop">Start shopping</a>.</p>`;
  return html`<div class="table-wrap"><table>
    <tr><th>Order</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th></tr>
    ${orders.map((o) => html`<tr>
      <td><a class="mono" href="#/order/${o.id}${withToken ? `?t=${withToken(o.id)}` : ''}">${o.number}</a></td>
      <td>${date(o.created_at)}</td>
      <td>${o.items.reduce((s, i) => s + i.quantity, 0)}</td>
      <td class="mono">${money(o.total_cents)}</td>
      <td><span class="status ${o.status}">${statusLabel(o.status)}</span></td></tr>`)}
  </table></div>`;
}

export async function render(el, { query, navigate }) {
  if (session.user) {
    const { orders } = await api('/orders');
    el.innerHTML = html`
      <div class="spread"><div><div class="eyebrow">Account</div><h1>Hi, ${session.user.name.split(' ')[0]}</h1></div>
        <button class="btn ghost" id="logout">Sign out</button></div>
      <p class="muted">${session.user.email}${session.user.role === 'admin' ? html` · <a href="#/admin">Open admin console</a>` : ''}</p>
      <div class="panel"><h2>Your orders</h2>${orderRows(orders)}</div>`;
    el.querySelector('#logout').onclick = async () => {
      await api('/auth/logout', { method: 'POST', body: {} });
      setUser(null);
      toast('Signed out');
      navigate('/');
    };
    return;
  }

  let mode = query.mode === 'register' ? 'register' : 'login';
  const guest = rememberedOrders();
  const guestOrders = (await Promise.all(guest.map((g) => api(`/orders/${g.id}?t=${encodeURIComponent(g.token)}`).then((r) => r.order).catch(() => null)))).filter(Boolean);

  function draw() {
    el.innerHTML = html`
      <div style="max-width:440px;margin:0 auto">
        <div class="eyebrow">${mode === 'login' ? 'Welcome back' : 'Join the grid'}</div>
        <h1>${mode === 'login' ? 'Sign in' : 'Create account'}</h1>
        <form class="panel" id="f" novalidate>
          ${mode === 'register' ? html`<div class="field"><label for="name">Name</label><input id="name" name="name" autocomplete="name" required></div>` : ''}
          <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="8" required></div>
          <p class="error" id="err"></p>
          <button class="btn block">${mode === 'login' ? 'Sign in' : 'Create account'}</button>
          <p class="muted" style="text-align:center;margin:14px 0 0;font-size:14px">
            ${mode === 'login' ? html`New here? <a href="#" id="swap">Create an account</a>` : html`Already registered? <a href="#" id="swap">Sign in</a>`}
          </p>
        </form>
      </div>
      ${guestOrders.length ? html`<div class="panel" style="margin-top:32px"><h2>Orders placed in this browser</h2>${orderRows(guestOrders, (id) => encodeURIComponent(guest.find((g) => g.id === id).token))}</div>` : ''}`;

    el.querySelector('#swap').onclick = (e) => { e.preventDefault(); mode = mode === 'login' ? 'register' : 'login'; draw(); };
    el.querySelector('#f').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const { user } = await api(`/auth/${mode}`, { method: 'POST', body: formData(e.target) });
        setUser(user);
        toast(`Signed in as ${user.email}`);
        navigate(query.next?.startsWith('/') ? query.next : user.role === 'admin' ? '/admin' : '/account');
      } catch (ex) { el.querySelector('#err').textContent = ex.message; }
    });
  }
  draw();
}
