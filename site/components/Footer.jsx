import Link from 'next/link';
import './footer.css';

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
    <footer className="ftr">
      <div className="wrap ftr__top">
        <div className="ftr__brand">
          <img src="/brand/dossiro-white.svg" alt="Dossiro" className="ftr__logo" />
          <p className="ftr__line">
            The document system that keeps its own record.
          </p>
          <Link href="/contact" className="btn btn--on-dark ftr__cta">
            Request a demo
          </Link>
        </div>

        <div className="ftr__cols">
          {COLS.map(([heading, links]) => (
            <nav key={heading} className="ftr__col" aria-label={heading}>
              <div className="ftr__heading">{heading}</div>
              {links.map(([href, label]) => (
                <Link key={href} href={href} className="ftr__link">
                  {label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
      </div>

      <div className="wrap ftr__bottom">
        <span>© {year} Dossiro. A Calm Global product.</span>
        <span className="ftr__meta">Hosted · Dedicated · On-premise</span>
      </div>
    </footer>
  );
}
