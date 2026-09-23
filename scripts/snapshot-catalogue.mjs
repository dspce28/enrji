// Saves a copy of the live Shopify catalogue so builds still work if the store is unreachable.
// Usage: npm run snapshot
import { writeFileSync } from 'node:fs';

const store = (process.env.NEXT_PUBLIC_SHOPIFY_STORE_URL || 'https://enrji.in').replace(/\/$/, '');
const res = await fetch(`${store}/products.json?limit=250`, { headers: { 'User-Agent': 'enrji-web snapshot' } });
if (!res.ok) throw new Error(`${store}/products.json → ${res.status}`);
const { products } = await res.json();
writeFileSync(new URL('../data/catalogue-snapshot.json', import.meta.url), JSON.stringify({ fetchedAt: new Date().toISOString(), products }, null, 0));
console.log(`Saved ${products.length} products from ${store}`);
