'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, Wrap } from './ui';

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
    <header
      className={`sticky top-0 z-50 border-b backdrop-blur-[10px] backdrop-saturate-[1.4] transition-[border-color,background-color] duration-200 ${
        scrolled ? 'border-line bg-paper/[0.92]' : 'border-transparent bg-paper/[0.85]'
      }`}
    >
      <Wrap className="flex h-[68px] items-center gap-8 max-[420px]:gap-3">
        <Link href="/" className="flex flex-none items-center" aria-label="Dossiro home">
          <img src="/brand/dossiro-logo.svg" alt="Dossiro" width="118" height="32" className="h-7 w-auto" />
        </Link>

        <nav className="flex items-center gap-7 max-[820px]:hidden" aria-label="Primary">
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={`border-b-2 py-1 text-[0.9375rem] font-medium transition-[color,border-color] duration-150 ${
                pathname === href
                  ? 'border-blue text-blue'
                  : 'border-transparent text-ink-2 hover:text-ink'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* The auto margin lives here, not on the nav. The nav is hidden below
            820px, and a hidden element's auto margin pushes nothing — which
            left the CTA and the menu button stranded beside the logo with the
            right half of the bar empty. On the actions it holds at every
            width. */}
        <div className="ml-auto flex items-center gap-3">
          <Button
            as={Link}
            href="/contact"
            variant="primary"
            className="px-[1.1rem] py-[0.6rem] max-[420px]:px-[0.8rem] max-[420px]:py-[0.55rem] max-[420px]:text-[0.875rem]"
          >
            Request a demo
          </Button>

          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="hidden h-10 w-10 cursor-pointer flex-col justify-center gap-1 border border-line-strong bg-transparent px-[9px] max-[820px]:flex"
          >
            {/* Three bars that fold into a cross. */}
            <span
              className={`block h-0.5 bg-ink transition-transform duration-200 ${
                open ? 'translate-y-[6px] rotate-45' : ''
              }`}
            />
            <span className={`block h-0.5 bg-ink transition-opacity duration-200 ${open ? 'opacity-0' : ''}`} />
            <span
              className={`block h-0.5 bg-ink transition-transform duration-200 ${
                open ? '-translate-y-[6px] -rotate-45' : ''
              }`}
            />
          </button>
        </div>
      </Wrap>

      {/* Mobile drawer. The primary CTA stays in the bar on mobile — the
          burger only carries the nav links. */}
      <div className="border-t border-line bg-surface min-[821px]:hidden" hidden={!open}>
        <nav
          className="flex flex-col px-[clamp(1.25rem,5vw,3rem)] pb-6 pt-2"
          aria-label="Mobile"
        >
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="border-b border-line-soft py-[0.9rem] text-step-0 font-medium"
            >
              {label}
            </Link>
          ))}
          <Button as={Link} href="/contact" variant="primary" className="mt-5 justify-center">
            Request a demo
          </Button>
        </nav>
      </div>
    </header>
  );
}
