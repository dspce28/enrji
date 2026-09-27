import { route } from '@/lib/store/api';
import { requireArea } from '@/lib/store/admin';
import { exportOrders } from '@/lib/store/adminOrders';

/** GET ?status=&q=&payment= → orders as CSV (opens in Excel / Google Sheets). */
export const GET = route(async (req) => {
  await requireArea('orders');
  const sp = req.nextUrl.searchParams;
  const csv = await exportOrders({ status: sp.get('status') ?? undefined, q: sp.get('q') ?? undefined, payment: sp.get('payment') ?? undefined, refund: sp.get('refund') === '1' });
  return new Response('﻿' + csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="enrji-orders-${new Date().toISOString().slice(0, 10)}.csv"` } });
});
