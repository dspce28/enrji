// Copies the catalogue from Shopify into the store database: products, images, variants (prices, MRP),
// and store defaults (shipping, COD, GST, returns, the multibuy offer). Safe to re-run: existing products
// are updated, stock is only set for new variants.
//
//   DATABASE_URL=… node --experimental-strip-types scripts/db-import-shopify.mjs [--stock 20]
//
// Shopify's public feed says only whether a size is in stock, not how many: in-stock sizes get --stock
// units (default 20), sold-out sizes 0. Set real counts afterwards in the admin.
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { isHidden, normalise } from '../lib/shopify.ts';

const STORE = (process.env.NEXT_PUBLIC_SHOPIFY_STORE_URL || 'https://enrji.in').replace(/\/$/, '');
const stockArg = process.argv.indexOf('--stock');
const START_STOCK = stockArg > 0 ? Number(process.argv[stockArg + 1]) : 20;
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }

let raw;
try {
  const res = await fetch(`${STORE}/products.json?limit=250`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(String(res.status));
  raw = (await res.json()).products;
  console.log(`[import] ${raw.length} products from ${STORE}`);
} catch (e) {
  raw = JSON.parse(readFileSync('data/catalogue-snapshot.json', 'utf8')).products;
  console.log(`[import] live feed unavailable (${e.message}); using the snapshot (${raw.length} products)`);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
const paise = (r) => (r == null ? null : Math.round(r * 100));
let nP = 0, nV = 0, newV = 0;

await sql.begin(async (tx) => {
  for (const r of raw) {
    if (isHidden(r)) continue;
    const p = normalise(r);
    await tx`
      insert into products (id, handle, title, base_name, kind, status, limited, tags, story, details, care, hsn, created_at)
      values (${p.id}, ${p.handle}, ${p.title}, ${p.baseName}, ${p.kind}, 'active', ${p.limited}, ${p.tags},
              ${tx.json(p.story)}, ${tx.json(p.details)}, ${p.care}, ${p.kind === 'sweatshirt' ? '6110' : '6109'}, ${p.createdAt})
      on conflict (id) do update set handle = excluded.handle, title = excluded.title, base_name = excluded.base_name,
        kind = excluded.kind, limited = excluded.limited, tags = excluded.tags, story = excluded.story,
        details = excluded.details, care = excluded.care, hsn = excluded.hsn, updated_at = now()`;
    await tx`delete from product_images where product_id = ${p.id}`;
    for (const [i, im] of p.images.entries()) {
      await tx`insert into product_images (product_id, src, width, height, alt, colors, position)
               values (${p.id}, ${im.src}, ${im.width}, ${im.height}, ${im.alt}, ${im.colors}, ${i})`;
    }
    for (const [i, v] of p.variants.entries()) {
      const sku = `ENR-${p.handle}-${[v.color, v.size].filter(Boolean).join('-')}`.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/-+$/, '');
      const [row] = await tx`
        insert into variants (id, product_id, sku, size, color, price, compare_at, stock, image, position)
        values (${v.id}, ${p.id}, ${sku}, ${v.size}, ${v.color}, ${paise(v.price)}, ${paise(v.compareAt)},
                ${v.available ? START_STOCK : 0}, ${v.image}, ${i})
        on conflict (id) do update set size = excluded.size, color = excluded.color, price = excluded.price,
          compare_at = excluded.compare_at, image = excluded.image, position = excluded.position
        returning (xmax = 0) as inserted`;
      if (row.inserted) {
        newV++;
        if (v.available) await tx`insert into inventory_movements (variant_id, delta, reason, note) values (${v.id}, ${START_STOCK}, 'import', 'Opening stock (Shopify showed in stock)')`;
      }
      nV++;
    }
    nP++;
  }
  // New products and variants continue after the imported ids.
  await tx`select setval(pg_get_serial_sequence('products', 'id'), greatest((select max(id) from products), 1))`;
  await tx`select setval(pg_get_serial_sequence('variants', 'id'), greatest((select max(id) from variants), 1))`;

  // Store defaults (only if not set yet).
  const defaults = {
    shipping: { flat: 0, freeAbove: 0 },                         // paise; free shipping across India
    cod: { enabled: true, fee: 0, maxOrder: 500000 },            // COD up to ₹5,000
    returns: { windowDays: 7, exchangeOnly: false },
    gst: { threshold: 250000, rateUpTo: 5, rateAbove: 18 },      // apparel: 5% up to ₹2,500 a piece, 18% above
    store: { name: 'ENRJI', gstin: '', address: '' },
  };
  for (const [key, value] of Object.entries(defaults)) {
    await tx`insert into settings (key, value) values (${key}, ${tx.json(value)}) on conflict (key) do nothing`;
  }
  const [{ n }] = await tx`select count(*)::int as n from offers`;
  if (!n) {
    await tx`insert into offers (name, type, rules) values ('Buy more, save more', 'multibuy', ${tx.json({ tiers: [{ qty: 2, percent: 10 }, { qty: 3, percent: 15 }] })})`;
  }
});
console.log(`[import] ${nP} products, ${nV} variants (${newV} new, opening stock ${START_STOCK} for in-stock sizes)`);
await sql.end();
