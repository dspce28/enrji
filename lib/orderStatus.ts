/** Shopper-facing words for order and payment states (shared by the account pages and the admin). */
export const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Awaiting payment', placed: 'Order placed', confirmed: 'Confirmed', packed: 'Packed',
  shipped: 'Shipped', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned',
  refunded: 'Refunded', refund_pending: 'Refund pending',
};
export const PAYMENT_LABEL: Record<string, string> = {
  pending: 'Payment pending', paid: 'Paid online', failed: 'Payment failed', refunded: 'Refunded',
  partially_refunded: 'Partly refunded', cod_pending: 'Cash on delivery', cod_collected: 'Paid (cash)',
};
export const TRACK = ['placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered'] as const;
export const rs = (p: number) => `₹${(p / 100).toLocaleString('en-IN', (p % 100 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 }))}`;
