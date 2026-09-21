import Link from 'next/link';
import { Button, Wrap } from './ui';

const COLS = [
  ['Product', [
    ['/product', 'Overview'],
    ['/security', 'Security'],
    ['/deployment', 'Deployment'],
  ]],
  ['Company', [
    ['/about', 'About'],
    ['/contact', 'Contact'],
  ]],
];

export default function Footer() {
  const year = 2026;
  return (
    <footer className="bg-blue-ink text-on-dark">
      <Wrap className="grid grid-cols-[1.3fr_1fr] gap-12 border-b border-on-dark-line py-[clamp(3rem,6vw,4.5rem)] max-[720px]:grid-cols-1 max-[720px]:gap-10">
        <div>
          <img src="/brand/dossiro-white.svg" alt="Dossiro" className="h-[30px] w-auto" />
          <p className="mt-[1.1rem] max-w-[22rem] text-[0.95rem] text-on-dark-muted">
            The document system that keeps its own record.
          </p>
          <Button as={Link} href="/contact" variant="onDark" className="mt-6">
            Request a demo
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-8">
          {COLS.map(([heading, links]) => (
            <nav key={heading} className="flex flex-col" aria-label={heading}>
              {/* Teal, which on navy is the one place a graphic accent becomes
                  type — see globals.css. */}
              <div className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-g-teal">
                {heading}
              </div>
              {links.map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  className="py-[0.4rem] text-[0.95rem] text-on-dark-muted transition-colors duration-150 hover:text-white"
                >
                  {label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
      </Wrap>

      <Wrap className="flex flex-wrap items-center justify-between gap-3 py-6 text-[0.85rem] text-on-dark-muted">
        <span>© {year} Dossiro. A Calm Global product.</span>
        <span className="tracking-[0.02em]">Hosted · Dedicated · On-premise</span>
      </Wrap>
    </footer>
  );
}
