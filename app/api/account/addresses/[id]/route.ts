import { body, requireUser, route } from '@/lib/store/api';
import { deleteAddress, parseAddress, saveAddress } from '@/lib/store/account';

export const PUT = route(async (req, { params }) => ({ address: await saveAddress((await requireUser()).id, parseAddress(await body(req)), (await params).id) }));
export const DELETE = route(async (_req, { params }) => { await deleteAddress((await requireUser()).id, (await params).id); return { ok: true }; });
