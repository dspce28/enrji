import { route, StoreError } from '@/lib/store/api';
import { requireArea } from '@/lib/store/admin';
import { report } from '@/lib/store/adminMisc';

/** GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&kind=gst|products|days → CSV. */
export const GET = route(async (req) => {
  await requireArea('reports');
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from') ?? '', to = sp.get('to') ?? '', kind = sp.get('kind') ?? 'days';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new StoreError('Bad dates');
  const r = await report(from, to);
  const x = (p: number) => (p / 100).toFixed(2);
  const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows: unknown[][] =
    kind === 'gst' ? [['HSN', 'GST rate %', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total tax'], ...r.gst.map((g) => [g.hsn, g.rate, x(g.taxable), x(g.cgst), x(g.sgst), x(g.igst), x(g.cgst + g.sgst + g.igst)])]
      : kind === 'products' ? [['Product', 'Pieces', 'Revenue (after discounts)'], ...r.top.map((t) => [t.title, t.qty, x(t.revenue)])]
        : [['Date', 'Orders', 'Sales'], ...r.byDay.map((d) => [d.day, d.orders, x(d.total)])];
  return new Response('﻿' + rows.map((row) => row.map(esc).join(',')).join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="enrji-${kind}-${from}-to-${to}.csv"` } });
});
