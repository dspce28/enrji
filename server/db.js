import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SIZES, SHIRT_COLORS, DESIGN_TYPES } from '../public/js/shirt.js';
import { hashPassword } from './auth.js';

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'core',
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  design TEXT NOT NULL,              -- JSON { type, accent, accent2, text }
  featured INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color TEXT NOT NULL,
  size TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  UNIQUE (product_id, color, size)
);
CREATE TABLE IF NOT EXISTS inventory_movements (
  id INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,  -- restock | adjustment | sale | release | refund
  ref TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  shipping_address TEXT NOT NULL,   -- JSON
  status TEXT NOT NULL DEFAULT 'pending_payment',
  subtotal_cents INTEGER NOT NULL,
  shipping_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  payment_provider TEXT,
  tracking_number TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES variants(id),
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  design TEXT NOT NULL,
  color TEXT NOT NULL,
  size TEXT NOT NULL,
  sku TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_ref TEXT,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,  -- pending | succeeded | failed | refunded
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_mov_variant ON inventory_movements(variant_id);
`;

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

/** Run fn inside a transaction; rolls back on throw. Not re-entrant. */
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function skuFor(slug, color, size) {
  const c = color.split('-').map((p) => p[0]).join('').toUpperCase();
  return `${slug.replace(/[^a-z0-9]/gi, '').slice(0, 10).toUpperCase()}-${c}-${size}`;
}

export function createVariants(db, productId, slug, colors, initialStock = 0, userId = null) {
  const ins = db.prepare('INSERT OR IGNORE INTO variants (product_id, color, size, sku, stock) VALUES (?,?,?,?,?)');
  const mov = db.prepare("INSERT INTO inventory_movements (variant_id, delta, reason, ref, user_id) VALUES (?,?,'restock','initial stock',?)");
  for (const color of colors) {
    for (const size of SIZES) {
      const stock = typeof initialStock === 'function' ? initialStock(color, size) : initialStock;
      const r = ins.run(productId, color, size, skuFor(slug, color, size), stock);
      if (r.changes && stock > 0) mov.run(r.lastInsertRowid, stock, userId);
    }
  }
}

const SEED_PRODUCTS = [
  ['Overcharge', 'bolt', '#00f0ff', '#ff2bd6', '', 'Signature ENRJI bolt with a charged halo. Heavyweight 240gsm organic cotton.', 3400, ['void-black', 'graphite', 'arctic-white'], 1, 'signature'],
  ['Sunset Protocol', 'horizon', '#ffb300', '#ff2bd6', '', 'Retro-future horizon with a wireframe grid that runs to infinity.', 3600, ['void-black', 'midnight-navy', 'plasma-purple'], 1, 'retro-future'],
  ['Motherboard', 'circuit', '#39ff14', '#00f0ff', 'mb', 'Procedurally routed circuit traces. No two print runs look quite alike.', 3200, ['void-black', 'graphite', 'ion-teal'], 0, 'tech'],
  ['Signal Lost', 'glitch', '#00f0ff', '#ff2bd6', 'ENRJI', 'Chromatic-aberration glitch type, printed with reflective ink.', 3000, ['void-black', 'arctic-white', 'solar-red'], 1, 'signature'],
  ['Hive Mind', 'hex', '#ffe600', '#ff7a00', '', 'Honeycomb lattice for collective thinkers.', 3000, ['void-black', 'graphite', 'midnight-navy'], 0, 'tech'],
  ['Low Orbit', 'orbit', '#7b5cff', '#00f0ff', '', 'A ringed world at 400km altitude.', 3400, ['midnight-navy', 'void-black', 'arctic-white'], 1, 'cosmic'],
  ['Frequency', 'wave', '#00f0ff', '#7b5cff', '', 'Nine stacked waveforms tuned to your resonance.', 2900, ['void-black', 'arctic-white', 'ion-teal'], 0, 'retro-future'],
  ['Tesseract', 'cube', '#ff2bd6', '#00f0ff', '', 'A hypercube folded into three dimensions.', 3300, ['void-black', 'plasma-purple', 'graphite'], 0, 'cosmic'],
  ['Prism Stack', 'triangle', '#ff2bd6', '#ffb300', '', 'Six nested prisms refracting neon light.', 3100, ['void-black', 'midnight-navy', 'solar-red'], 0, 'retro-future'],
  ['Rain Code', 'matrix', '#39ff14', '#00f0ff', 'rain', 'Falling glyph streams. Wake up.', 3200, ['void-black', 'graphite'], 1, 'tech'],
  ['Gene Splice', 'helix', '#00f0ff', '#ff2bd6', '', 'A double helix rendered as luminous nodes.', 3500, ['void-black', 'arctic-white', 'plasma-purple'], 0, 'cosmic'],
  ['Watcher', 'eye', '#ff2bd6', '#ffe600', '', 'The cybernetic eye sees every timeline.', 3600, ['void-black', 'solar-red', 'midnight-navy'], 0, 'signature'],
];

export function seed(db, { adminEmail, adminPassword }) {
  const hasUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0;
  if (!hasUsers) {
    db.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, 'Store Admin', ?, 'admin')")
      .run(adminEmail, hashPassword(adminPassword));
  }
  const hasProducts = db.prepare('SELECT COUNT(*) AS n FROM products').get().n > 0;
  if (hasProducts) return { seededAdmin: !hasUsers, seededProducts: false };

  tx(db, () => {
    const ins = db.prepare('INSERT INTO products (slug, name, description, category, price_cents, design, featured) VALUES (?,?,?,?,?,?,?)');
    SEED_PRODUCTS.forEach(([name, type, accent, accent2, text, desc, price, colors, featured, category], i) => {
      if (!DESIGN_TYPES.includes(type) || colors.some((c) => !SHIRT_COLORS[c])) throw new Error(`bad seed ${name}`);
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const design = JSON.stringify({ type, accent, accent2, text: text === 'mb' || text === 'rain' ? '' : text });
      const { lastInsertRowid } = ins.run(slug, name, desc, category, price, design, featured);
      // Deterministic, varied stock so low-stock and sold-out states show up in the demo.
      createVariants(db, lastInsertRowid, slug, colors, (color, size) => {
        const k = (i * 7 + color.length * 3 + SIZES.indexOf(size) * 5) % 23;
        return k < 2 ? 0 : k < 5 ? 3 : k + 4;
      });
    });
  });
  return { seededAdmin: !hasUsers, seededProducts: true };
}
