import { body, requireUser, route, str } from '@/lib/store/api';
import { startPayment } from '@/lib/store/orders';

/** POST { number } → payment details to (re)open the gateway for an unpaid order. */
export const POST = route(async (req) => startPayment(str((await body(req)).number, 30), (await requireUser()).id));
