import { route, StoreError } from '@/lib/store/api';
import { requireArea } from '@/lib/store/admin';
import { importStock } from '@/lib/store/adminCatalogue';

/** POST text/csv (sku,stock) → sets counts. */
export const POST = route(async (req) => {
  const u = await requireArea('inventory');
  const text = await req.text();
  if (text.length > 2e6) throw new StoreError('File too large');
  return importStock(text, u.id);
});
