/** Site-wide settings. Override with environment variables on the host. */

// The Shopify store that holds products, carts, checkout and customer accounts.
// When enrji.in moves to this site, point Shopify at a subdomain (e.g. shop.enrji.in) and update this.
export const STORE_URL = (process.env.NEXT_PUBLIC_SHOPIFY_STORE_URL || 'https://enrji.in').replace(/\/$/, '');

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://enrji.logicubeit.com').replace(/\/$/, '');

export const CONTACT = {
  whatsapp: '917069044494',
  whatsappDisplay: '+91 70690 44494',
  email: 'support@snehworld.com',
};

export const POLICY_LINKS = [
  { label: 'Shipping Policy', href: `${STORE_URL}/policies/shipping-policy` },
  { label: 'Refund Policy', href: `${STORE_URL}/policies/refund-policy` },
  { label: 'Privacy Policy', href: `${STORE_URL}/policies/privacy-policy` },
  { label: 'Terms of Service', href: `${STORE_URL}/policies/terms-of-service` },
];

// Facts taken from the store's own shipping and refund policies (Aug 2025). Keep in sync with them.
export const PROMISES = {
  shipping: 'Free shipping across India',
  dispatch: 'Dispatched in 2–3 working days',
  delivery: 'Delivered in 6–7 working days',
  payment: 'Prepaid: UPI, cards, net banking & wallets',
  returns: 'Wrong or defective item? Tell us within 48 hours of delivery.',
};

// Shown on product pages; the store applies these automatically at checkout.
export const MULTIBUY = [
  { qty: 2, off: 10 },
  { qty: 3, off: 15 },
];

export const accountUrl = `${STORE_URL}/account`;

export function whatsappLink(text: string) {
  return `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text)}`;
}
