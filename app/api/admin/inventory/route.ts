import { body, route, str } from '@/lib/store/api';
import { requireArea } from '@/lib/store/admin';
import { adjustStock } from '@/lib/store/adminCatalogue';

/** POST { variantId, mode: 'set' | 'add', value, reason, note } → { stock }. */
export const POST = route(async (req) => {
  const u = await requireArea('inventory');
  const b = await body(req);
  return adjustStock(Number(b.variantId), b.mode === 'add' ? 'add' : 'set', Number(b.value), str(b.reason, 20), str(b.note, 200), u.id);
});
