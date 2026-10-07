/** Site-wide settings. Override with environment variables on the host. */

// The Shopify store that holds products, carts, checkout and customer accounts.
// When enrji.in moves to this site, point Shopify at a subdomain (e.g. shop.enrji.in) and update this.
export const STORE_URL = (process.env.NEXT_PUBLIC_SHOPIFY_STORE_URL || 'https://enrji.in').replace(/\/$/, '');

// This site's own address: canonical links, sitemap, and the share pictures WhatsApp/Instagram fetch.
// Stays on the working Vercel address until enrji.logicubeit.com resolves; then set NEXT_PUBLIC_SITE_URL on Vercel.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://enrji.vercel.app').replace(/\/$/, '');

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

// The delivery promise above, in working days from payment, for the "arrives by" date on product pages.
export const DELIVERY_DAYS = { min: 6, max: 7 };

// Who's wearing what in the product photos, shown under the size picker. Leave null until the team confirms
// the real numbers; never guess them. e.g. tee: "Model is 6'0\" (183 cm) and wears L".
export const MODEL_FIT: Record<'tee' | 'sweatshirt', string | null> = { tee: null, sweatshirt: null };

// Shown on product pages; the store applies these automatically at checkout.
export const MULTIBUY = [
  { qty: 2, off: 10 },
  { qty: 3, off: 15 },
];

export const accountUrl = `${STORE_URL}/account`;

export function whatsappLink(text: string) {
  return `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text)}`;
}
