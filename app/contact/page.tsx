import type { Metadata } from 'next';
import { CONTACT, whatsappLink } from '@/lib/config';

export const metadata: Metadata = { title: 'Contact', description: 'Talk to the ENRJI team on WhatsApp or email.' };

export default function Contact() {
  return (
    <div className="container">
      <header className="page-head">
        <p className="eyebrow">We&apos;re here</p>
        <h1 className="display h1" style={{ marginTop: 14 }}>Talk to us</h1>
        <p className="lead" style={{ marginTop: 18 }}>Questions about sizing, an order, or a piece you love that sold out? We reply fastest on WhatsApp.</p>
      </header>
      <div className="experiences" style={{ maxWidth: 1000 }}>
        <a className="exp" href={whatsappLink('Hi ENRJI, I have a question')} style={{ minHeight: 280, background: 'var(--bg-2)' }}>
          <div><p className="eyebrow">WhatsApp</p><p className="display h3" style={{ margin: '14px 0' }}>{CONTACT.whatsappDisplay}</p><span className="btn btn-gold btn-sm">Start a chat</span></div>
        </a>
        <a className="exp" href={`mailto:${CONTACT.email}`} style={{ minHeight: 280, background: 'var(--bg-2)' }}>
          <div><p className="eyebrow">Email</p><p className="display h3" style={{ margin: '14px 0', fontSize: 'clamp(18px, 2vw, 28px)', wordBreak: 'break-all' }}>{CONTACT.email}</p><span className="btn btn-light btn-sm">Write to us</span></div>
        </a>
      </div>
      <p className="muted" style={{ marginTop: 32 }}>For a wrong or damaged item, include your order number, photos of the item, packaging and invoice label, and message us within 48 hours of delivery.</p>
    </div>
  );
}
