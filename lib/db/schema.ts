import { sql } from 'drizzle-orm';
import {
  bigint, bigserial, boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

/**
 * ENRJI's own store. Money is always integer paise. Products imported from Shopify keep their Shopify ids,
 * so existing carts, links and caches keep working; new products continue the same id sequence.
 */

const id64 = (name: string) => bigint(name, { mode: 'number' });
const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// ---------- Catalogue ----------
export const products = pgTable('products', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  handle: text('handle').notNull().unique(),
  title: text('title').notNull(),
  baseName: text('base_name').notNull(),
  kind: text('kind').notNull().$type<'tee' | 'sweatshirt'>(),
  status: text('status').notNull().default('active').$type<'active' | 'draft' | 'archived'>(),
  limited: boolean('limited').notNull().default(false),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  story: jsonb('story').notNull().default([]).$type<string[]>(),
  details: jsonb('details').notNull().default([]).$type<string[]>(),
  care: text('care'),
  hsn: text('hsn').notNull().default('6109'),                // 6109 T-shirts, 6110 sweatshirts
  seoTitle: text('seo_title'),
  seoDescription: text('seo_description'),
  createdAt: created(),
  updatedAt: updated(),
});

export const productImages = pgTable('product_images', {
  id: serial('id').primaryKey(),
  productId: id64('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  src: text('src').notNull(),
  width: integer('width').notNull().default(0),
  height: integer('height').notNull().default(0),
  alt: text('alt').notNull().default(''),
  colors: text('colors').array().notNull().default(sql`'{}'::text[]`),
  position: integer('position').notNull().default(0),
}, (t) => [index('product_images_product').on(t.productId)]);

export const variants = pgTable('variants', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  productId: id64('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  sku: text('sku').unique(),
  size: text('size').notNull(),
  color: text('color'),
  price: integer('price').notNull(),                 // paise
  compareAt: integer('compare_at'),                  // paise (MRP), null when not on sale
  stock: integer('stock').notNull().default(0),
  image: text('image'),
  weightGrams: integer('weight_grams').notNull().default(300),
  position: integer('position').notNull().default(0),
  active: boolean('active').notNull().default(true),
}, (t) => [index('variants_product').on(t.productId)]);

export const inventoryMovements = pgTable('inventory_movements', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  variantId: id64('variant_id').notNull().references(() => variants.id, { onDelete: 'cascade' }),
  delta: integer('delta').notNull(),
  reason: text('reason').notNull().$type<'import' | 'adjust' | 'order' | 'cancel' | 'return' | 'restock' | 'expired'>(),
  orderId: id64('order_id'),
  note: text('note'),
  byUser: uuid('by_user'),
  at: created(),
}, (t) => [index('inv_variant').on(t.variantId)]);

// ---------- People ----------
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').notNull().unique(),           // +91XXXXXXXXXX
  name: text('name'),
  email: text('email'),
  role: text('role').notNull().default('customer').$type<'customer' | 'staff' | 'admin'>(),
  marketingConsent: boolean('marketing_consent').notNull().default(false),
  blocked: boolean('blocked').notNull().default(false),
  createdAt: created(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export const otpCodes = pgTable('otp_codes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  phone: text('phone').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  usedAt: timestamp('used_at', { withTimezone: true }),
  ip: text('ip'),
  createdAt: created(),
}, (t) => [index('otp_phone').on(t.phone, t.createdAt), index('otp_ip').on(t.ip, t.createdAt)]);

export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  userAgent: text('user_agent'),
  createdAt: created(),
}, (t) => [index('sessions_user').on(t.userId)]);

export const addresses = pgTable('addresses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  label: text('label'),                               // Home, Work…
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  line1: text('line1').notNull(),
  line2: text('line2'),
  landmark: text('landmark'),
  city: text('city').notNull(),
  state: text('state').notNull(),
  pincode: text('pincode').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: created(),
}, (t) => [index('addresses_user').on(t.userId)]);

export const wishlist = pgTable('wishlist', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: id64('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  createdAt: created(),
}, (t) => [primaryKey({ columns: [t.userId, t.productId] })]);

export const cartItems = pgTable('cart_items', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  variantId: id64('variant_id').notNull().references(() => variants.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').notNull(),
  updatedAt: updated(),
}, (t) => [primaryKey({ columns: [t.userId, t.variantId] })]);

// ---------- Offers & coupons ----------
export const coupons = pgTable('coupons', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),              // stored upper-case
  description: text('description'),
  type: text('type').notNull().$type<'percent' | 'flat' | 'free_shipping'>(),
  value: integer('value').notNull().default(0),       // percent (0–100) or paise
  minOrder: integer('min_order').notNull().default(0),
  maxDiscount: integer('max_discount'),               // paise cap for percent coupons
  appliesTo: text('applies_to').notNull().default('all').$type<'all' | 'tee' | 'sweatshirt'>(),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  usageLimit: integer('usage_limit'),
  perUserLimit: integer('per_user_limit').notNull().default(1),
  firstOrderOnly: boolean('first_order_only').notNull().default(false),
  combinable: boolean('combinable').notNull().default(false),   // with automatic offers
  active: boolean('active').notNull().default(true),
  createdAt: created(),
});

/** Automatic offers, e.g. { tiers: [{ qty: 2, percent: 10 }, { qty: 3, percent: 15 }] }. */
export const offers = pgTable('offers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull().$type<'multibuy'>(),
  rules: jsonb('rules').notNull().$type<{ tiers: { qty: number; percent: number }[] }>(),
  active: boolean('active').notNull().default(true),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  createdAt: created(),
});

// ---------- Orders ----------
export type OrderStatus = 'pending_payment' | 'placed' | 'confirmed' | 'packed' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'returned';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded' | 'cod_pending' | 'cod_collected';
export interface AddressSnapshot { name: string; phone: string; line1: string; line2?: string | null; landmark?: string | null; city: string; state: string; pincode: string }

export const orders = pgTable('orders', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  number: text('number').notNull().unique(),          // ENR-100001
  userId: uuid('user_id').notNull().references(() => users.id),
  status: text('status').notNull().$type<OrderStatus>(),
  paymentMethod: text('payment_method').notNull().$type<'razorpay' | 'cod' | 'test'>(),
  paymentStatus: text('payment_status').notNull().$type<PaymentStatus>(),
  subtotal: integer('subtotal').notNull(),            // sum of line prices (paise)
  offerDiscount: integer('offer_discount').notNull().default(0),
  couponDiscount: integer('coupon_discount').notNull().default(0),
  couponCode: text('coupon_code'),
  shipping: integer('shipping').notNull().default(0),
  codFee: integer('cod_fee').notNull().default(0),
  total: integer('total').notNull(),
  taxIncluded: integer('tax_included').notNull().default(0),   // GST contained in total
  address: jsonb('address').notNull().$type<AddressSnapshot>(),
  email: text('email'),
  razorpayOrderId: text('razorpay_order_id').unique(),
  razorpayPaymentId: text('razorpay_payment_id'),
  courier: text('courier'),
  awb: text('awb'),
  trackingUrl: text('tracking_url'),
  cancelReason: text('cancel_reason'),
  stockReleased: boolean('stock_released').notNull().default(false),
  placedAt: timestamp('placed_at', { withTimezone: true }),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index('orders_user').on(t.userId, t.createdAt), index('orders_status').on(t.status)]);

export const orderItems = pgTable('order_items', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  orderId: id64('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  variantId: id64('variant_id').notNull(),
  productId: id64('product_id').notNull(),
  handle: text('handle').notNull(),
  title: text('title').notNull(),
  size: text('size').notNull(),
  color: text('color'),
  image: text('image'),
  sku: text('sku'),
  unitPrice: integer('unit_price').notNull(),
  compareAt: integer('compare_at'),
  quantity: integer('quantity').notNull(),
  discount: integer('discount').notNull().default(0),  // share of order discounts
  hsn: text('hsn').notNull(),
  gstRate: integer('gst_rate').notNull(),
}, (t) => [index('order_items_order').on(t.orderId)]);

export const orderEvents = pgTable('order_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  orderId: id64('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  note: text('note'),
  byUser: uuid('by_user'),
  at: created(),
}, (t) => [index('order_events_order').on(t.orderId)]);

export const couponRedemptions = pgTable('coupon_redemptions', {
  couponId: integer('coupon_id').notNull().references(() => coupons.id),
  orderId: id64('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  at: created(),
}, (t) => [primaryKey({ columns: [t.couponId, t.orderId] })]);

export const payments = pgTable('payments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  orderId: id64('order_id').references(() => orders.id),
  provider: text('provider').notNull(),
  providerId: text('provider_id'),
  event: text('event').notNull(),
  amount: integer('amount'),
  raw: jsonb('raw'),
  at: created(),
}, (t) => [uniqueIndex('payments_event_once').on(t.provider, t.providerId, t.event)]);

export const returns = pgTable('returns', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  orderId: id64('order_id').notNull().references(() => orders.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: text('type').notNull().$type<'return' | 'exchange'>(),
  status: text('status').notNull().$type<'requested' | 'approved' | 'rejected' | 'picked_up' | 'received' | 'refunded' | 'exchanged' | 'closed'>(),
  reason: text('reason').notNull(),
  items: jsonb('items').notNull().$type<{ orderItemId: number; quantity: number; exchangeVariantId?: number }[]>(),
  refundAmount: integer('refund_amount'),
  notes: text('notes'),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index('returns_order').on(t.orderId)]);

// ---------- Store settings & audit ----------
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
});

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id'),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  data: jsonb('data'),
  at: created(),
});
