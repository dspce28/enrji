import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { createVariants, tx } from '../db.js';
import { HttpError, STATUSES, getOrder, transition } from '../orders.js';
import { productRow, makeRefunder } from './store.js';
import { SHIRT_COLORS, DESIGN_TYPES } from '../../public/js/shirt.js';

const HEX = /^#[0-9a-f]{6}$/i;

function cleanProduct(body, partial = false) {
  const out = {};
  const has = (k) => body[k] !== undefined;
  if (!partial || has('name')) {
    out.name = String(body.name ?? '').trim().slice(0, 80);
    if (!out.name) throw new HttpError(400, 'Name is required');
  }
  if (has('description')) out.description = String(body.description).slice(0, 2000);
  if (has('category')) out.category = String(body.category).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40) || 'core';
  if (!partial || has('price_cents')) {
    out.price_cents = Number(body.price_cents);
    if (!Number.isInteger(out.price_cents) || out.price_cents < 100 || out.price_cents > 100000) throw new HttpError(400, 'Price must be between $1 and $1000');
  }
  if (!partial || has('design')) {
    const d = body.design ?? {};
    if (!DESIGN_TYPES.includes(d.type)) throw new HttpError(400, 'Unknown design type');
    if (!HEX.test(d.accent ?? '') || !HEX.test(d.accent2 ?? '')) throw new HttpError(400, 'Accent colors must be #rrggbb');
    out.design = JSON.stringify({ type: d.type, accent: d.accent, accent2: d.accent2, text: String(d.text ?? '').slice(0, 12) });
  }
  if (has('featured')) out.featured = body.featured ? 1 : 0;
  if (has('active')) out.active = body.active ? 1 : 0;
  return out;
}

export function adminRoutes(cfg) {
  const { db } = cfg;
  const r = Router();
  r.use(requireAdmin);

  r.get('/stats', (_req, res) => {
    const paidStatuses = "('paid','processing','shipped','delivered')";
    const revenue = db.prepare(`SELECT COALESCE(SUM(total_cents),0) AS cents, COUNT(*) AS n FROM orders WHERE status IN ${paidStatuses}`).get();
    const byStatus = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all().map((r) => [r.status, r.n]));
    const daily = db.prepare(`SELECT date(created_at) AS day, SUM(total_cents) AS cents, COUNT(*) AS n FROM orders
                              WHERE status IN ${paidStatuses} AND created_at >= date('now','-13 days') GROUP BY day ORDER BY day`).all();
    const lowStock = db.prepare(`SELECT v.id, v.sku, v.color, v.size, v.stock, v.low_stock_threshold, p.name FROM variants v
                                 JOIN products p ON p.id = v.product_id WHERE p.active = 1 AND v.stock <= v.low_stock_threshold
                                 ORDER BY v.stock ASC, p.name LIMIT 12`).all();
    const top = db.prepare(`SELECT oi.product_name AS name, SUM(oi.quantity) AS units, SUM(oi.quantity * oi.unit_price_cents) AS cents
                            FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status IN ${paidStatuses}
                            GROUP BY oi.product_id ORDER BY units DESC LIMIT 5`).all();
    const units = db.prepare('SELECT COALESCE(SUM(stock),0) AS n, COUNT(*) AS skus, SUM(stock = 0) AS soldOut FROM variants v JOIN products p ON p.id = v.product_id WHERE p.active = 1').get();
    const customers = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'customer'").get().n;
    const refundsNeeded = db.prepare("SELECT COUNT(*) AS n FROM payments WHERE status = 'needs_refund'").get().n;
    res.json({ revenue_cents: revenue.cents, paid_orders: revenue.n, byStatus, daily, lowStock, top, inventory: units, customers, refundsNeeded });
  });

  // ---------- products ----------
  const variantsFor = db.prepare('SELECT id, color, size, sku, stock, low_stock_threshold FROM variants WHERE product_id = ? ORDER BY id');

  r.get('/products', (_req, res) => {
    const rows = db.prepare('SELECT * FROM products ORDER BY active DESC, id DESC').all();
    res.json({ products: rows.map((p) => productRow(p, variantsFor.all(p.id))), colors: SHIRT_COLORS, designTypes: DESIGN_TYPES });
  });

  r.get('/products/:id', (req, res) => {
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!p) throw new HttpError(404, 'Product not found');
    const variants = variantsFor.all(p.id);
    res.json({ product: { ...productRow(p, variants), variants } });
  });

  function validColors(colors) {
    if (!Array.isArray(colors) || !colors.length) throw new HttpError(400, 'Pick at least one color');
    for (const c of colors) if (!SHIRT_COLORS[c]) throw new HttpError(400, `Unknown color ${c}`);
    return [...new Set(colors)];
  }

  r.post('/products', (req, res) => {
    const p = cleanProduct(req.body ?? {});
    const colors = validColors(req.body?.colors);
    const initial = Math.max(0, Math.min(10000, Number(req.body?.initial_stock) || 0));
    let slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tee';
    if (db.prepare('SELECT 1 FROM products WHERE slug = ?').get(slug)) slug = `${slug}-${Date.now().toString(36)}`;
    const id = tx(db, () => {
      const { lastInsertRowid } = db.prepare(`INSERT INTO products (slug, name, description, category, price_cents, design, featured, active)
        VALUES (?,?,?,?,?,?,?,?)`).run(slug, p.name, p.description ?? '', p.category ?? 'core', p.price_cents, p.design, p.featured ?? 0, p.active ?? 1);
      createVariants(db, lastInsertRowid, slug, colors, initial, req.user.id);
      return lastInsertRowid;
    });
    res.status(201).json({ id: Number(id), slug });
  });

  r.put('/products/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!existing) throw new HttpError(404, 'Product not found');
    const p = cleanProduct(req.body ?? {}, true);
    tx(db, () => {
      const keys = Object.keys(p);
      if (keys.length) db.prepare(`UPDATE products SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => p[k]), existing.id);
      if (req.body?.colors) createVariants(db, existing.id, existing.slug, validColors(req.body.colors), 0, req.user.id);
    });
    res.json({ ok: true });
  });

  // Products referenced by orders are archived, never hard-deleted.
  r.delete('/products/:id', (req, res) => {
    const info = db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
    if (!info.changes) throw new HttpError(404, 'Product not found');
    res.json({ ok: true });
  });

  // ---------- inventory ----------
  r.get('/inventory', (req, res) => {
    const where = [];
    const args = [];
    if (req.query.q) { where.push('(p.name LIKE ? OR v.sku LIKE ?)'); const q = `%${String(req.query.q).slice(0, 60)}%`; args.push(q, q); }
    if (req.query.low) where.push('v.stock <= v.low_stock_threshold');
    if (!req.query.archived) where.push('p.active = 1');
    const rows = db.prepare(`SELECT v.*, p.name AS product_name, p.slug, p.design, p.active FROM variants v JOIN products p ON p.id = v.product_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.name, v.color, v.id`).all(...args);
    res.json({ variants: rows.map((v) => ({ ...v, design: JSON.parse(v.design) })) });
  });

  r.post('/inventory/:variantId/adjust', (req, res) => {
    const reason = String(req.body?.reason ?? 'adjustment');
    if (!['restock', 'adjustment', 'damaged', 'count'].includes(reason)) throw new HttpError(400, 'Unknown reason');
    const note = String(req.body?.note ?? '').slice(0, 200) || null;
    const out = tx(db, () => {
      const v = db.prepare('SELECT * FROM variants WHERE id = ?').get(req.params.variantId);
      if (!v) throw new HttpError(404, 'Variant not found');
      let delta;
      if (reason === 'count') {
        const target = Number(req.body?.set);
        if (!Number.isInteger(target) || target < 0) throw new HttpError(400, 'Count must be a whole number ≥ 0');
        delta = target - v.stock;
      } else {
        delta = Number(req.body?.delta);
        if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10000) throw new HttpError(400, 'Delta must be a non-zero whole number');
      }
      if (v.stock + delta < 0) throw new HttpError(400, `Only ${v.stock} in stock`);
      if (delta !== 0) {
        db.prepare('UPDATE variants SET stock = stock + ? WHERE id = ?').run(delta, v.id);
        db.prepare('INSERT INTO inventory_movements (variant_id, delta, reason, ref, user_id) VALUES (?,?,?,?,?)').run(v.id, delta, reason, note, req.user.id);
      }
      return db.prepare('SELECT * FROM variants WHERE id = ?').get(v.id);
    });
    res.json({ variant: out });
  });

  r.put('/inventory/:variantId', (req, res) => {
    const t = Number(req.body?.low_stock_threshold);
    if (!Number.isInteger(t) || t < 0 || t > 1000) throw new HttpError(400, 'Threshold must be 0–1000');
    const info = db.prepare('UPDATE variants SET low_stock_threshold = ? WHERE id = ?').run(t, req.params.variantId);
    if (!info.changes) throw new HttpError(404, 'Variant not found');
    res.json({ ok: true });
  });

  r.get('/inventory/movements', (req, res) => {
    const args = [];
    let where = '';
    if (req.query.variant) { where = 'WHERE m.variant_id = ?'; args.push(Number(req.query.variant)); }
    const rows = db.prepare(`SELECT m.*, v.sku, p.name AS product_name, u.email AS user_email FROM inventory_movements m
      JOIN variants v ON v.id = m.variant_id JOIN products p ON p.id = v.product_id LEFT JOIN users u ON u.id = m.user_id
      ${where} ORDER BY m.id DESC LIMIT 200`).all(...args);
    res.json({ movements: rows });
  });

  // ---------- orders ----------
  r.get('/orders', (req, res) => {
    const where = [];
    const args = [];
    if (req.query.status && STATUSES.includes(req.query.status)) { where.push('status = ?'); args.push(req.query.status); }
    if (req.query.q) { where.push('(number LIKE ? OR email LIKE ? OR name LIKE ?)'); const q = `%${String(req.query.q).slice(0, 60)}%`; args.push(q, q, q); }
    const rows = db.prepare(`SELECT o.id, o.number, o.email, o.name, o.status, o.total_cents, o.payment_provider, o.created_at, o.updated_at,
        (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS units
      FROM orders o ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.id DESC LIMIT 300`).all(...args);
    res.json({ orders: rows, statuses: STATUSES });
  });

  r.get('/orders/:id', (req, res) => {
    const o = getOrder(db, Number(req.params.id));
    if (!o) throw new HttpError(404, 'Order not found');
    res.json({ order: o });
  });

  r.post('/orders/:id/status', async (req, res) => {
    const order = await transition(db, Number(req.params.id), String(req.body?.status ?? ''), {
      note: String(req.body?.note ?? '').slice(0, 300) || undefined,
      trackingNumber: req.body?.trackingNumber,
      refund: makeRefunder(cfg),
    });
    res.json({ order });
  });

  r.get('/payments', (_req, res) => {
    const rows = db.prepare(`SELECT pm.*, o.number, o.email FROM payments pm JOIN orders o ON o.id = pm.order_id ORDER BY pm.id DESC LIMIT 300`).all();
    res.json({ payments: rows });
  });

  return r;
}
