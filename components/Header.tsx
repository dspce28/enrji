'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useCart } from './cart';
import { accountUrl } from '@/lib/config';

const NAV = [
  { href: '/shop', label: 'Shop all' },
  { href: '/collections/tees', label: 'Tees' },
  { href: '/collections/sweatshirts', label: 'Sweatshirts' },
  { href: '/trial-room', label: 'Trial Room', isNew: true },
  { href: '/virtual-store', label: 'Virtual Store', isNew: true },
  { href: '/our-story', label: 'Our Story' },
];

export function Header() {
  const path = usePathname();
  const { count, setOpen } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const [bump, setBump] = useState(false);
  const prev = useRef(count);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (count > prev.current) { setBump(true); const t = setTimeout(() => setBump(false), 500); prev.current = count; return () => clearTimeout(t); }
    prev.current = count;
  }, [count]);

  useEffect(() => setMenu(false), [path]);

  return (
    <>
      <header className={`header${scrolled || path !== '/' ? ' scrolled' : ''}`}>
        <div className="container header-inner">
          <Link href="/" className="wordmark" aria-label="ENRJI home"><span className="dot" />ENRJI</Link>
          <nav className="nav" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={n.isNew ? 'new' : undefined} aria-current={path.startsWith(n.href) ? 'page' : undefined}>{n.label}</Link>
            ))}
          </nav>
          <div className="header-actions">
            <a className="icon-btn" href={accountUrl} aria-label="Account">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
            </a>
            <button className="icon-btn" onClick={() => setOpen(true)} aria-label={`Open bag, ${count} items`}>
              <svg viewBox="0 0 24 24"><path d="M5 8h14l-1.2 12H6.2z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
              {count > 0 && <span className={`count${bump ? ' bump' : ''}`}>{count}</span>}
            </button>
            <button className="icon-btn menu-btn" onClick={() => setMenu(true)} aria-label="Open menu" aria-expanded={menu}>
              <svg viewBox="0 0 24 24"><path d="M4 8h16M4 16h16" /></svg>
            </button>
          </div>
        </div>
      </header>
      <div className={`mobile-menu${menu ? ' open' : ''}`} aria-hidden={!menu} inert={!menu}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="wordmark"><span className="dot" />ENRJI</span>
          <button className="icon-btn" onClick={() => setMenu(false)} aria-label="Close menu"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </div>
        <nav aria-label="Mobile">
          {NAV.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
          <a href={accountUrl}>Account</a>
        </nav>
      </div>
    </>
  );
}
