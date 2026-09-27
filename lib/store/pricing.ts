import 'server-only';
import { and, count, eq, inArray, ne } from 'drizzle-orm';
import { db, schema, type Tx } from '../db';
import { getSettings, type StoreSettings } from './settings';

/**
 * What an order costs, worked out on the server only (the browser's numbers are never trusted).
 * All money in paise.
 *
 *  subtotal      Σ price × quantity
 *  − offer       automatic "buy more, save more" (best tier for the number of pieces)
 *  − coupon      if valid; when it can't be combined with the offer, whichever saves the shopper more
 *  + shipping    flat fee unless the order is above the free-shipping threshold
 *  + COD fee     when paying on delivery
 *  = total       (GST included in prices; the tax part is worked out per piece for the invoice)
 */

export interface QuoteLine {
  variantId: number; productId: number; handle: string; title: string; kind: 'tee' | 'sweatshirt'; size: string;
  color: string | null; image: string | null; sku: string | null; hsn: string;
  unitPrice: number; compareAt: number | null; quantity: number; stock: number;
  problem?: 'unavailable' | 'short';        // sold out / fewer left than asked
  discount: number; gstRate: number; tax: number;
}
export interface Quote {
  lines: QuoteLine[];
  subtotal: number; mrp: number; offerDiscount: number; offerName: string | null;
  coupon: { code: string; discount: number; freeShipping: boolean; id: number } | null;
  couponMessage: string | null;
  shipping: number; codFee: number; codAllowed: boolean; total: number; taxIncluded: number;
  ok: boolean;                              // every line can be bought
}

type Client = ReturnType<typeof db> | Tx;

export async function quote(
  input: { lines: { variantId: number; quantity: number }[]; couponCode?: string | null; userId?: string | null; payment?: 'cod' | 'online' },
  opts: { tx?: Tx; lock?: boolean; settings?: StoreSettings } = {},
): Promise<Quote> {
  const c: Client = opts.tx ?? db();
  const settings = opts.settings ?? await getSettings();
  const want = new Map<number, number>();
  for (const l of input.lines.slice(0, 50)) {
    const id = Number(l.variantId), q = Math.floor(Number(l.quantity));
    if (Number.isSafeInteger(id) && q > 0) want.set(id, Math.min(10, (want.get(id) ?? 0) + q));
  }
  const ids = [...want.keys()];
  const base = c.select({ v: schema.variants, p: schema.products }).from(schema.variants)
    .innerJoin(schema.products, eq(schema.products.id, schema.variants.productId))
    .where(inArray(schema.variants.id, ids.length ? ids : [-1]));
  const rows = opts.lock ? await base.for('update', { of: schema.variants }) : await base;
  const imgs = rows.length ? await c.select().from(schema.productImages)
    .where(inArray(schema.productImages.productId, rows.map((r) => r.p.id))) : [];

  const lines: QuoteLine[] = [];
  for (const id of ids) {
    const r = rows.find((x) => x.v.id === id);
    if (!r) continue;                         // unknown variant: drop it
    const quantity = want.get(id)!;
    const sellable = r.p.status === 'active' && r.v.active;
    const stock = sellable ? r.v.stock : 0;
    lines.push({
      variantId: id, productId: r.p.id, handle: r.p.handle, title: r.p.title, kind: r.p.kind, size: r.v.size, color: r.v.color,
      image: r.v.image ?? imgs.filter((i) => i.productId === r.p.id).sort((a, b) => a.position - b.position)[0]?.src ?? null,
      sku: r.v.sku, hsn: r.p.hsn, unitPrice: r.v.price, compareAt: r.v.compareAt && r.v.compareAt > r.v.price ? r.v.compareAt : null,
      quantity, stock, problem: stock <= 0 ? 'unavailable' : stock < quantity ? 'short' : undefined,
      discount: 0, gstRate: 0, tax: 0,
    });
  }
  const buyable = lines.filter((l) => !l.problem);
  const subtotal = buyable.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const mrp = buyable.reduce((s, l) => s + (l.compareAt ?? l.unitPrice) * l.quantity, 0);
  const pieces = buyable.reduce((s, l) => s + l.quantity, 0);

  // Automatic offer: best multibuy tier.
  const now = new Date();
  const offers = await c.select().from(schema.offers).where(eq(schema.offers.active, true));
  let offerDiscount = 0, offerName: string | null = null;
  for (const o of offers) {
    if ((o.startsAt && o.startsAt > now) || (o.endsAt && o.endsAt < now)) continue;
    const tier = [...o.rules.tiers].sort((a, b) => b.qty - a.qty).find((t) => pieces >= t.qty);
    const d = tier ? Math.round((subtotal * tier.percent) / 100) : 0;
    if (d > offerDiscount) { offerDiscount = d; offerName = `${o.name}: ${tier!.percent}% off ${tier!.qty}+ pieces`; }
  }

  // Coupon.
  let coupon: Quote['coupon'] = null, couponMessage: string | null = null;
  const code = (input.couponCode ?? '').trim().toUpperCase();
  if (code) {
    const [cp] = await c.select().from(schema.coupons).where(eq(schema.coupons.code, code));
    const eligible = buyable.filter((l) => !cp || cp.appliesTo === 'all' || l.kind === cp.appliesTo).reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const fail = async (): Promise<string | null> => {
      if (!cp || !cp.active) return 'That coupon code isn’t valid.';
      if (cp.startsAt && cp.startsAt > now) return 'That coupon isn’t active yet.';
      if (cp.endsAt && cp.endsAt < now) return 'That coupon has expired.';
      if (!eligible) return `That coupon is for ${cp.appliesTo === 'tee' ? 'tees' : 'sweatshirts'} only.`;
      if (subtotal < cp.minOrder) return `Add ₹${Math.ceil((cp.minOrder - subtotal) / 100)} more to use this coupon (minimum order ₹${cp.minOrder / 100}).`;
      if (cp.usageLimit != null) {
        const [{ n }] = await c.select({ n: count() }).from(schema.couponRedemptions).where(eq(schema.couponRedemptions.couponId, cp.id));
        if (n >= cp.usageLimit) return 'That coupon has been fully used.';
      }
      if (!input.userId) return 'Log in to use a coupon.';
      const [{ n: mine }] = await c.select({ n: count() }).from(schema.couponRedemptions)
        .where(and(eq(schema.couponRedemptions.couponId, cp.id), eq(schema.couponRedemptions.userId, input.userId)));
      if (mine >= cp.perUserLimit) return 'You’ve already used this coupon.';
      if (cp.firstOrderOnly) {
        const [{ n: prior }] = await c.select({ n: count() }).from(schema.orders)
          .where(and(eq(schema.orders.userId, input.userId), ne(schema.orders.status, 'cancelled'), ne(schema.orders.status, 'pending_payment')));
        if (prior > 0) return 'That coupon is for your first order only.';
      }
      return null;
    };
    const why = await fail();
    if (why) couponMessage = why;
    else if (cp) {
      let d = 0;
      if (cp.type === 'percent') d = Math.round((eligible * cp.value) / 100);
      if (cp.type === 'flat') d = Math.min(cp.value, eligible);
      if (cp.maxDiscount != null) d = Math.min(d, cp.maxDiscount);
      coupon = { code: cp.code, discount: d, freeShipping: cp.type === 'free_shipping', id: cp.id };
      if (!cp.combinable && offerDiscount > 0 && cp.type !== 'free_shipping') {
        if (d > offerDiscount) { couponMessage = `${cp.code} saves you more than the automatic offer, so we’ve used it instead.`; offerDiscount = 0; offerName = null; }
        else { couponMessage = `Your automatic offer already saves you more than ${cp.code}.`; coupon = null; }
      }
    }
  }
  const couponDiscount = coupon?.discount ?? 0;
  const afterDiscounts = Math.max(0, subtotal - offerDiscount - couponDiscount);
  const shipping = !buyable.length || coupon?.freeShipping || afterDiscounts >= settings.shipping.freeAbove ? 0 : settings.shipping.flat;
  const codAllowed = settings.cod.enabled && afterDiscounts + shipping + settings.cod.fee <= settings.cod.maxOrder;
  const codFee = input.payment === 'cod' && codAllowed ? settings.cod.fee : 0;
  const total = afterDiscounts + shipping + codFee;

  // Spread the discounts over the pieces (for returns and the invoice), then GST per piece.
  const disc = offerDiscount + couponDiscount;
  let left = disc;
  buyable.forEach((l, i) => {
    const share = i === buyable.length - 1 ? left : Math.round((disc * l.unitPrice * l.quantity) / Math.max(subtotal, 1));
    l.discount = Math.min(share, l.unitPrice * l.quantity);
    left -= l.discount;
    const netUnit = (l.unitPrice * l.quantity - l.discount) / l.quantity;
    l.gstRate = netUnit <= settings.gst.threshold ? settings.gst.rateUpTo : settings.gst.rateAbove;
    l.tax = Math.round(((l.unitPrice * l.quantity - l.discount) * l.gstRate) / (100 + l.gstRate));
  });
  return {
    lines, subtotal, mrp, offerDiscount, offerName, coupon, couponMessage, shipping, codFee, codAllowed, total,
    taxIncluded: buyable.reduce((s, l) => s + l.tax, 0), ok: lines.length > 0 && lines.every((l) => !l.problem),
  };
}

