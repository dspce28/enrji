'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { checkoutUrl } from '@/lib/checkout';

export interface CartLine {
  variantId: number;
  quantity: number;
  handle: string;
  title: string;
  size: string;
  color: string | null;
  price: number;
  compareAt: number | null;
  image: string | null;
}

interface CartState {
  ownStore: boolean;
  signedIn: boolean;
  wish: Set<number>;
  toggleWish(productId: number): Promise<void>;
  lines: CartLine[];
  count: number;
  subtotal: number;
  open: boolean;
  unavailable: Set<number>;
  setOpen(open: boolean): void;
  add(line: CartLine): void;
  setQty(variantId: number, qty: number): void;
  remove(variantId: number): void;
  clear(): void;
  checkout(): Promise<void>;
  toast(message: string): void;
}

const Ctx = createContext<CartState | null>(null);
const KEY = 'enrji.cart.v1';
const MAX_QTY = 10;

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart outside CartProvider');
  return c;
}

/** Ask the server which variants can still be bought (catalogue refreshes every few minutes). */
async function fetchAvailability(ids: number[]): Promise<Record<string, boolean>> {
  if (!ids.length) return {};
  const res = await fetch(`/api/stock?ids=${ids.join(',')}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('stock check failed');
  return res.json();
}

/** Merge two carts: every variant from both, the larger quantity of each. */
function merge(a: CartLine[], b: CartLine[]) {
  const out = new Map<number, CartLine>();
  for (const l of [...a, ...b]) {
    const cur = out.get(l.variantId);
    out.set(l.variantId, cur ? { ...l, quantity: Math.min(MAX_QTY, Math.max(cur.quantity, l.quantity)) } : l);
  }
  return [...out.values()];
}

export function CartProvider({ children, ownStore = false }: { children: ReactNode; ownStore?: boolean }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [wish, setWish] = useState<Set<number>>(new Set());
  const synced = useRef(false);
  const [open, setOpen] = useState(false);
  const [unavailable, setUnavailable] = useState<Set<number>>(new Set());
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const loaded = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (Array.isArray(saved)) setLines(saved.filter((l) => Number.isInteger(l?.variantId) && l.quantity > 0));
    } catch { /* storage unavailable */ }
    loaded.current = true;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      try { setLines(JSON.parse(e.newValue || '[]')); } catch { /* ignore */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* storage unavailable */ }
  }, [lines]);

  // Signed in to ENRJI's own store: bring in the cart saved on the account (merged with this device's),
  // then keep the account copy up to date so the bag follows the shopper across devices.
  useEffect(() => {
    if (!ownStore) return;
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/cart', { cache: 'no-store' }).catch(() => null);
      if (!res?.ok || cancelled) return;
      setSignedIn(true);
      const server = ((await res.json()).lines ?? []) as CartLine[];
      let local: CartLine[] = [];
      try { local = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { /* ignore */ }
      synced.current = true;
      setLines(merge(server, local));
      fetch('/api/wishlist', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setWish(new Set(j.ids))).catch(() => {});
    })();
    return () => { cancelled = true; };
  }, [ownStore]);

  useEffect(() => {
    if (!synced.current) return;
    const t = setTimeout(() => {
      fetch('/api/cart', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })) }) }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [lines]);

  const toggleWish = useCallback(async (productId: number) => {
    if (!signedIn) { window.location.href = `/login?next=${encodeURIComponent(location.pathname)}`; return; }
    const on = !wish.has(productId);
    setWish((w) => { const n = new Set(w); if (on) n.add(productId); else n.delete(productId); return n; });
    const res = await fetch('/api/wishlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, on }) }).catch(() => null);
    if (res?.ok) setWish(new Set((await res.json()).ids));
  }, [signedIn, wish]);

  // Re-check stock whenever the drawer opens.
  useEffect(() => {
    if (!open || !lines.length) return;
    fetchAvailability(lines.map((l) => l.variantId))
      .then((a) => setUnavailable(new Set(lines.filter((l) => a[l.variantId] === false).map((l) => l.variantId))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    document.documentElement.style.overflow = open ? 'hidden' : '';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const toast = useCallback((message: string) => {
    setToastMsg(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const add = useCallback((line: CartLine) => {
    setLines((cur) => {
      const found = cur.find((l) => l.variantId === line.variantId);
      if (found) return cur.map((l) => (l.variantId === line.variantId ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + line.quantity) } : l));
      return [...cur, { ...line, quantity: Math.min(MAX_QTY, line.quantity) }];
    });
  }, []);

  const setQty = useCallback((variantId: number, qty: number) => {
    setLines((cur) => (qty <= 0 ? cur.filter((l) => l.variantId !== variantId) : cur.map((l) => (l.variantId === variantId ? { ...l, quantity: Math.min(MAX_QTY, qty) } : l))));
  }, []);

  const remove = useCallback((variantId: number) => setLines((cur) => cur.filter((l) => l.variantId !== variantId)), []);
  const clear = useCallback(() => setLines([]), []);

  const checkout = useCallback(async () => {
    try {
      const a = await fetchAvailability(lines.map((l) => l.variantId));
      const gone = lines.filter((l) => a[l.variantId] === false);
      if (gone.length) {
        setUnavailable(new Set(gone.map((l) => l.variantId)));
        toast(`${gone[0].title} (${gone[0].size}) just sold out — remove it to continue`);
        return;
      }
    } catch { /* checkout re-checks stock anyway */ }
    window.location.href = ownStore ? '/checkout' : checkoutUrl(lines);
  }, [lines, toast, ownStore]);

  const value = useMemo<CartState>(() => ({
    ownStore, signedIn, wish, toggleWish,
    lines,
    count: lines.reduce((s, l) => s + l.quantity, 0),
    subtotal: lines.reduce((s, l) => s + l.price * l.quantity, 0),
    open, unavailable, setOpen, add, setQty, remove, clear, checkout, toast,
  }), [ownStore, signedIn, wish, toggleWish, lines, open, unavailable, add, setQty, remove, clear, checkout, toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className={`toast${toastMsg ? ' show' : ''}`} role="status" aria-live="polite">{toastMsg}</div>
    </Ctx.Provider>
  );
}
