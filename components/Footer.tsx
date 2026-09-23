import Link from 'next/link';
import { CONTACT, POLICY_LINKS, whatsappLink } from '@/lib/config';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <p className="display h3" style={{ marginBottom: 16 }}>Feel it.<br /><span className="gold-text">Live it.</span></p>
            <p className="muted" style={{ maxWidth: 360, margin: 0 }}>Apparel born from the teachings of Sneh Desai. Every piece is a daily reminder of who you decided to become.</p>
          </div>
          <div>
            <h4>Shop</h4>
            <ul>
              <li><Link href="/shop">All products</Link></li>
              <li><Link href="/collections/tees">Tees</Link></li>
              <li><Link href="/collections/sweatshirts">Sweatshirts</Link></li>
              <li><Link href="/collections/limited-edition">Limited edition</Link></li>
              <li><Link href="/lookbook">Lookbook</Link></li>
              <li><Link href="/trial-room">Trial Room</Link></li>
              <li><Link href="/virtual-store">Virtual Store</Link></li>
            </ul>
          </div>
          <div>
            <h4>Help</h4>
            <ul>
              <li><Link href="/size-guide">Size guide</Link></li>
              <li><Link href="/faq">FAQ</Link></li>
              <li><Link href="/contact">Contact</Link></li>
              {POLICY_LINKS.map((p) => <li key={p.href}><a href={p.href}>{p.label}</a></li>)}
            </ul>
          </div>
          <div>
            <h4>Talk to us</h4>
            <ul>
              <li><a href={whatsappLink('Hi ENRJI, I have a question')}>WhatsApp {CONTACT.whatsappDisplay}</a></li>
              <li><a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></li>
              <li><Link href="/our-story">Our story</Link></li>
            </ul>
          </div>
        </div>
        <div className="footer-mega" aria-hidden>ENRJI</div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} ENRJI®. All rights reserved.</span>
          <span>Stay real. Stay rare. Stay ENRJI.</span>
        </div>
      </div>
    </footer>
  );
}
