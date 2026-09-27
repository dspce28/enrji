import { body, requireUser, route, StoreError } from '@/lib/store/api';
import { setWishlisted, wishlistIds } from '@/lib/store/account';

/** GET → { ids } of wishlisted products. POST { productId, on } adds or removes one. */
export const GET = route(async () => ({ ids: await wishlistIds((await requireUser()).id) }));
export const POST = route(async (req) => {
  const u = await requireUser();
  const b = await body(req);
  const id = Number(b.productId);
  if (!Number.isSafeInteger(id)) throw new StoreError('Bad product');
  await setWishlisted(u.id, id, b.on !== false);
  return { ids: await wishlistIds(u.id) };
});
