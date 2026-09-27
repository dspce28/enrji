import { body, requireUser, route } from '@/lib/store/api';
import { listAddresses, parseAddress, saveAddress } from '@/lib/store/account';

export const GET = route(async () => ({ addresses: await listAddresses((await requireUser()).id) }));
export const POST = route(async (req) => ({ address: await saveAddress((await requireUser()).id, parseAddress(await body(req))) }));
