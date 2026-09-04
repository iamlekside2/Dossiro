'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './header.css';

const NAV = [
  ['/product', 'Product'],
  ['/security', 'Security'],
  ['/deployment', 'Deployment'],
  ['/about', 'About'],
];

export default function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  // A hairline appears under the bar only once the page has moved, so the hero
  // reads as one uninterrupted surface at the top.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile menu on navigation.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className={`hdr${scrolled ? ' is-scrolled' : ''}${open ? ' is-open' : ''}`}>
      <div className="wrap hdr__row">
        <Link href="/" className="hdr__brand" aria-label="Dossiro home">
          <img src="/brand/dossiro-logo.svg" alt="Dossiro" width="118" height="32" />
        </Link>

        <nav className="hdr__nav" aria-label="Primary">
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={`hdr__link${pathname === href ? ' is-active' : ''}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="hdr__actions">
          <Link href="/contact" className="btn btn--primary hdr__cta">
            Request a demo
          </Link>
          <button
            type="button"
            className="hdr__burger"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span /><span /><span />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div className="hdr__drawer" hidden={!open}>
        <nav className="hdr__drawerNav" aria-label="Mobile">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="hdr__drawerLink">
              {label}
            </Link>
          ))}
          <Link href="/contact" className="btn btn--primary hdr__drawerCta">
            Request a demo
          </Link>
        </nav>
      </div>
    </header>
  );
}
