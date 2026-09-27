import { body, route } from '@/lib/store/api';
import { requireArea } from '@/lib/store/admin';
import { saveOffer } from '@/lib/store/adminMisc';

export const PUT = route(async (req, { params }) => { const u = await requireArea('marketing'); return { id: await saveOffer(await body(req), u.id, Number((await params).id)) }; });
