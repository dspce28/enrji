import { NextResponse, type NextRequest } from 'next/server';
import { getProducts } from '@/lib/catalogue';
import { ownStore } from '@/lib/db';
import { stockFor } from '@/lib/store/catalogue';

/** GET /api/stock?ids=1,2,3 → { "1": true, "2": false } — used by the cart before checkout. */
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get('ids') ?? '')
    .split(',').map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 50);
  if (ownStore) {
    const stock = await stockFor(ids);
    return NextResponse.json(Object.fromEntries(ids.map((id) => [id, (stock.get(id) ?? 0) > 0])), { headers: { 'Cache-Control': 'no-store' } });
  }
  const products = await getProducts();
  const byId = new Map(products.flatMap((p) => p.variants.map((v) => [v.id, v.available] as const)));
  const out: Record<string, boolean> = {};
  for (const id of ids) out[id] = byId.get(id) ?? false;
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
