import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT, POLICY_LINKS, PROMISES, whatsappLink } from '@/lib/config';

export const metadata: Metadata = { title: 'FAQ', description: 'Shipping, payment, sizing and returns at ENRJI.' };

// Answers restate the store's published shipping and refund policies (Aug 2025).
const FAQS: [string, React.ReactNode][] = [
  ['Is shipping free?', <>Yes. {PROMISES.shipping} on every order.</>],
  ['How long does delivery take?', <>Orders are dispatched from our warehouse within 2–3 working days of payment, and most locations in India receive them within 6–7 working days. Festivals, sales and courier delays can add time.</>],
  ['How do I track my order?', <>Once your order ships we send a tracking link by email or WhatsApp.</>],
  ['Which payment methods do you accept?', <>{PROMISES.payment}. We don&apos;t offer cash on delivery.</>],
  ['What if I receive a wrong, damaged or defective item?', <>Contact us within 48 hours of delivery on WhatsApp ({CONTACT.whatsappDisplay}) or at {CONTACT.email} with clear photos or a video of the issue, the packaging and the invoice label, plus your order number. After verification we arrange a replacement, or a full refund to your original payment method if the item is out of stock.</>],
  ['Can I return something because I changed my mind?', <>No. We only accept returns for wrong, damaged or defective items. Check the <Link href="/size-guide" style={{ textDecoration: 'underline' }}>size guide</Link> or try it on in the <Link href="/trial-room" style={{ textDecoration: 'underline' }}>Trial Room</Link> before ordering.</>],
  ['How do the sizes run?', <>Unisex regular fit, S to 3XL. If you&apos;re between sizes or like a relaxed fit, go one size up.</>],
  ['What are the tees and sweatshirts made of?', <>100% combed cotton, bio-washed. Tees are 220 GSM; sweatshirts are 250–260 GSM.</>],
  ['How do I care for my ENRJI piece?', <>Machine wash cold, inside out, with similar colours. Don&apos;t bleach, don&apos;t iron directly on the print, and dry in shade.</>],
  ['Is the limited edition going to be restocked?', <>No. The Live Like Krishna pieces were made once, in a small edition, and will never be reprinted.</>],
];

export default function Faq() {
  return (
    <div className="container">
      <header className="page-head">
        <p className="eyebrow">Help</p>
        <h1 className="display h1" style={{ marginTop: 14 }}>FAQ</h1>
      </header>
      <div className="faq" style={{ maxWidth: 860 }}>
        {FAQS.map(([q, a], i) => (
          <details key={q} className="acc" open={i === 0}><summary>{q}</summary><div className="acc-body">{a}</div></details>
        ))}
        <p className="muted" style={{ marginTop: 32 }}>
          Full policies: {POLICY_LINKS.map((p, i) => <span key={p.href}>{i ? ' · ' : ''}<a href={p.href} style={{ textDecoration: 'underline' }}>{p.label}</a></span>)}
        </p>
        <a className="btn btn-gold" href={whatsappLink('Hi ENRJI, I have a question')} style={{ marginTop: 20 }}>Still stuck? WhatsApp us</a>
      </div>
    </div>
  );
}
