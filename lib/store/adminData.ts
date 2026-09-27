import 'server-only';
import { and, asc, desc, eq, gte, inArray, lte, ne, notInArray, sql } from 'drizzle-orm';
import { db, schema } from '../db';

/** Orders that count as sales: placed (paid or COD), not cancelled, not a free exchange replacement. */
export const SOLD = and(notInArray(schema.orders.status, ['pending_payment', 'cancelled']), ne(schema.orders.paymentMethod, 'exchange'))!;
/** Midnight today in India, as a timestamp. */
export const istDayStart = (daysAgo = 0) => sql`(date_trunc('day', now() at time zone 'Asia/Kolkata') - make_interval(days => ${daysAgo})) at time zone 'Asia/Kolkata'`;

export async function dashboard() {
  const d = db();
  const period = async (days: number) => {
    const [r] = await d.select({ revenue: sql<number>`coalesce(sum(${schema.orders.total}), 0)::int`, orders: sql<number>`count(*)::int` })
      .from(schema.orders).where(and(SOLD, gte(schema.orders.placedAt, istDayStart(days))));
    return r;
  };
  const [today, week, month, byStatus, returnsOpen, lowStock, recent, daily, failedPay] = await Promise.all([
    period(0), period(6), period(29),
    d.select({ status: schema.orders.status, n: sql<number>`count(*)::int` }).from(schema.orders).groupBy(schema.orders.status),
    d.select({ n: sql<number>`count(*)::int` }).from(schema.returns).where(inArray(schema.returns.status, ['requested', 'approved', 'picked_up', 'received'])),
    d.select({ id: schema.variants.id, stock: schema.variants.stock, size: schema.variants.size, color: schema.variants.color, title: schema.products.title, handle: schema.products.handle })
      .from(schema.variants).innerJoin(schema.products, eq(schema.products.id, schema.variants.productId))
      .where(and(eq(schema.products.status, 'active'), eq(schema.variants.active, true), lte(schema.variants.stock, 3)))
      .orderBy(asc(schema.variants.stock), asc(schema.products.title)).limit(12),
    d.select().from(schema.orders).orderBy(desc(schema.orders.createdAt)).limit(8),
    d.select({ day: sql<string>`to_char(${schema.orders.placedAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`, revenue: sql<number>`sum(${schema.orders.total})::int` })
      .from(schema.orders).where(and(SOLD, gte(schema.orders.placedAt, istDayStart(13)))).groupBy(sql`1`).orderBy(sql`1`),
    d.select({ n: sql<number>`count(*)::int` }).from(schema.orders).where(and(eq(schema.orders.status, 'cancelled'), eq(schema.orders.paymentStatus, 'paid'))),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?.n ?? 0;
  return {
    today, week, month, daily,
    queue: { toConfirm: count('placed'), toPack: count('confirmed'), toShip: count('packed'), inTransit: count('shipped') + count('out_for_delivery'), returns: returnsOpen[0].n, refundsDue: failedPay[0].n },
    lowStock, recent,
  };
}
