// Small shared helpers: API calls, formatting, DOM, cart and session state.
import { shirtSVG, SHIRT_COLORS } from './shirt.js';

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, data });
  return data;
}

export const money = (cents) => `$${(cents / 100).toFixed(2)}`;
export const colorLabel = (c) => SHIRT_COLORS[c]?.label ?? c;
export const colorHex = (c) => SHIRT_COLORS[c]?.hex ?? '#000';
export const statusLabel = (s) => s.replace('_', ' ');
export const date = (s) => new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z')).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

class Safe {
  constructor(s) { this.__raw = s; }
  toString() { return this.__raw; }
}

/** Tagged template that escapes interpolations unless they are html`` / raw() results. */
export function html(strings, ...vals) {
  const part = (v) => (v instanceof Safe ? v.__raw : v === false || v == null ? '' : esc(v));
  return new Safe(strings.reduce((out, s, i) => {
    const v = vals[i - 1];
    return out + (Array.isArray(v) ? v.map(part).join('') : part(v)) + s;
  }));
}
export const raw = (s) => new Safe(String(s));
export const shirt = (color, design) => raw(shirtSVG({ color, design }));

export function toast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = `toast${isError ? ' err' : ''}`;
  el.textContent = msg;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 3800);
}

export function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// ---------- event bus ----------
const bus = new EventTarget();
export const on = (evt, fn) => { bus.addEventListener(evt, fn); return () => bus.removeEventListener(evt, fn); };
export const emit = (evt, detail) => bus.dispatchEvent(new CustomEvent(evt, { detail }));

// ---------- session ----------
export const session = { user: null, config: null };

export async function loadSession() {
  const [me, cfg] = await Promise.all([api('/auth/me'), api('/config')]);
  session.user = me.user;
  session.config = cfg;
  emit('session');
}

export function setUser(user) {
  session.user = user;
  emit('session');
}

// ---------- cart (browser-side; server re-prices at checkout) ----------
const CART_KEY = 'enrji.cart.v1';

function readCart() {
  try {
    const v = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(v) ? v.filter((l) => Number.isInteger(l.variantId) && l.quantity > 0) : [];
  } catch { return []; }
}

export const cart = {
  items: readCart(),
  save() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(this.items)); } catch { /* storage unavailable */ }
    emit('cart');
  },
  count() { return this.items.reduce((s, l) => s + l.quantity, 0); },
  add(variantId, quantity = 1) {
    const line = this.items.find((l) => l.variantId === variantId);
    if (line) line.quantity = Math.min(10, line.quantity + quantity);
    else this.items.push({ variantId, quantity });
    this.save();
  },
  set(variantId, quantity) {
    this.items = quantity > 0
      ? this.items.map((l) => (l.variantId === variantId ? { ...l, quantity: Math.min(10, quantity) } : l))
      : this.items.filter((l) => l.variantId !== variantId);
    this.save();
  },
  clear() { this.items = []; this.save(); },
  quote() { return api('/cart/quote', { method: 'POST', body: { items: this.items } }); },
};

window.addEventListener('storage', (e) => { if (e.key === CART_KEY) { cart.items = readCart(); emit('cart'); } });

// ---------- product cache for tour / try-on ----------
let productsPromise = null;
export function allProducts() {
  productsPromise ??= api('/products').then((d) => d.products).catch((e) => { productsPromise = null; throw e; });
  return productsPromise;
}
