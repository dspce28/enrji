import { body, route } from '@/lib/store/api';
import { requireArea } from '@/lib/store/admin';
import { saveCoupon } from '@/lib/store/adminMisc';

export const POST = route(async (req) => { const u = await requireArea('marketing'); return { id: await saveCoupon(await body(req), u.id) }; });
