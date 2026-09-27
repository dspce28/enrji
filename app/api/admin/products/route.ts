import { body, route } from '@/lib/store/api';
import { requireArea } from '@/lib/store/admin';
import { parseProduct, saveProduct } from '@/lib/store/adminCatalogue';

export const POST = route(async (req) => {
  const u = await requireArea('catalogue');
  return { id: await saveProduct(parseProduct(await body(req)), u.id) };
});
