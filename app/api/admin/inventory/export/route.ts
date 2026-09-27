import { route } from '@/lib/store/api';
import { requireArea } from '@/lib/store/admin';
import { exportStock } from '@/lib/store/adminCatalogue';

export const GET = route(async () => {
  await requireArea('inventory');
  return new Response('﻿' + await exportStock(), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="enrji-stock-${new Date().toISOString().slice(0, 10)}.csv"` } });
});
