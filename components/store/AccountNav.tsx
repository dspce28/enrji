import Link from 'next/link';
import { LogoutButton } from './LogoutButton';

const LINKS = [
  { href: '/account', label: 'Profile' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/wishlist', label: 'Wishlist' },
];

/** Side navigation for the account area. */
export function AccountShell({ active, title, children, admin }: { active: string; title: string; children: React.ReactNode; admin?: boolean }) {
  return (
    <div className="container account">
      <header className="page-head" style={{ paddingBottom: 24 }}>
        <p className="eyebrow">Your account</p>
        <h1 className="display h2" style={{ marginTop: 12 }}>{title}</h1>
      </header>
      <div className="account-grid">
        <nav className="account-nav" aria-label="Account">
          {LINKS.map((l) => <Link key={l.href} href={l.href} aria-current={active === l.href ? 'page' : undefined}>{l.label}</Link>)}
          {admin && <Link href="/admin">Store admin</Link>}
          <LogoutButton />
        </nav>
        <div className="account-main">{children}</div>
      </div>
    </div>
  );
}
