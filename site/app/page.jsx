import Link from 'next/link';
import PageStack from '@/components/PageStack';
import './page.css';

const FEATURES = [
  {
    title: 'Control who sees what',
    body: 'Permission is decided at the most specific level — the document, then its folder, then the folders above. Open a whole department, then close one folder back out of it. No reshuffling, and nobody gets in by accident.',
    say: 'Give Finance the whole cabinet, then lock Payroll to two people.',
  },
  {
    title: 'A record you can trust',
    body: 'Every view, download, change and sign-in is written to a trail where each entry is sealed against the one before it. It cannot be edited or deleted — not by a user, not by an administrator, not by IT.',
    say: 'When someone asks who opened that file in March, you have an answer.',
  },
  {
    title: 'Share out without losing control',
    body: 'Send a document to someone with no account. Set it to expire, require a passcode, cap the downloads, or allow reading while blocking download. Change your mind and the link dies on the spot.',
    say: 'Seven days, view-only, passcode. Revoked at four o’clock means gone at four.',
  },
  {
    title: 'Built for real organisations',
    body: 'Branches for your offices and departments. Roles and groups that mirror how your teams actually work. One person posted to Kano inherits everything granted to the North-West zone above them.',
    say: 'Structure the system around your org chart, not the other way round.',
  },
  {
    title: 'Every version, kept',
    body: 'Documents are never overwritten. Each change is a new version pointing at the old one, so history stays intact — and a deleted file waits in the recycle bin, recoverable, until its retention window closes.',
    say: 'Roll back to last quarter’s draft without losing this quarter’s.',
  },
  {
    title: 'Runs where you need it',
    body: 'Hosted by us, on a dedicated server in your own cloud, or entirely inside your building with no internet at all. The same product, three ways. Nothing phones home.',
    say: 'If your policy says the records never leave the building, they never do.',
  },
];

const DEPLOY = [
  {
    k: 'Hosted',
    title: 'We run it for you',
    body: 'The fastest way to start. Your organisation gets its own sealed tenant on our managed platform — nothing to install, nothing to maintain.',
  },
  {
    k: 'Dedicated',
    title: 'Your own cloud',
    body: 'A private instance in your cloud account, isolated from every other customer. You hold the infrastructure; we keep it running.',
  },
  {
    k: 'On-premise',
    title: 'Inside your walls',
    body: 'The whole system on your own servers, fully offline if you need it. For organisations whose records are not allowed to leave the building.',
  },
];

const AUDIT = [
  { hash: '9f3a…', actor: 'A. Okoro', what: 'signed MSA_Northwind v3.2', time: '14:02' },
  { hash: 'c1b7…', actor: 'External', what: 'opened via share link', time: '14:19' },
  { hash: '5e20…', actor: 'M. Bello', what: 'changed folder permission', time: '15:41' },
];

export default function Home() {
  return (
    <>
      {/* -- Hero ---------------------------------------------------------- */}
      <section className="hero">
        <div className="wrap hero__grid">
          <div>
            <p className="eyebrow hero__eyebrow">Enterprise document management</p>
            <h1 className="h-hero hero__title">
              The document system that keeps its own record.
            </h1>
            <p className="lede hero__lede">
              Dossiro is where a growing organisation’s documents live — and stay
              accountable. Control who sees what, prove who did what, and share
              beyond your walls without ever losing the thread.
            </p>
            <div className="hero__actions">
              <Link href="/contact" className="btn btn--primary">
                Request a demo <span className="arrow" aria-hidden="true">→</span>
              </Link>
              <Link href="/product" className="btn btn--ghost">
                See what it does
              </Link>
            </div>
            <p className="hero__note">
              Hosted, dedicated, or fully on-premise · sales-led onboarding, no credit card
            </p>
          </div>

          <div className="hero__art">
            <PageStack />
          </div>
        </div>
      </section>

      {/* -- Trust strip: what it is, not fake logos ---------------------- */}
      <section className="trust">
        <div className="wrap trust__row">
          <span className="trust__label">Made for</span>
          <span className="trust__item">Growing teams</span>
          <span className="trust__dot" aria-hidden="true">·</span>
          <span className="trust__item">Multi-branch organisations</span>
          <span className="trust__dot" aria-hidden="true">·</span>
          <span className="trust__item">Regulated industries</span>
          <span className="trust__dot" aria-hidden="true">·</span>
          <span className="trust__item">Public sector</span>
        </div>
      </section>

      {/* -- The problem -------------------------------------------------- */}
      <section className="section">
        <div className="wrap problem__grid">
          <div className="problem__body">
            <p className="eyebrow">The shared-drive problem</p>
            <h2 className="h-section shead__title">
              A folder on a server answers the wrong question.
            </h2>
            <p className="lede" style={{ marginBottom: '1rem' }}>
              Most organisations keep their documents in a shared drive. It tells
              you where a file is. It cannot tell you who is allowed to open it,
              who already did, or whether that record can be trusted six months
              from now.
            </p>
            <p style={{ color: 'var(--muted)' }}>
              As a team grows — more people, more offices, more outside parties —
              that gap turns into risk. Dossiro is built around the question a
              shared drive can’t answer.
            </p>
          </div>
          <aside className="problem__aside">
            <p className="problem__quote">
              “Where is the file” is easy. “Who may open this file, who already
              has, and can we prove it” is the question that actually matters.
            </p>
          </aside>
        </div>
      </section>

      {/* -- Differentiators --------------------------------------------- */}
      <section className="section band-tint">
        <div className="wrap">
          <div className="shead">
            <p className="eyebrow">What sets it apart</p>
            <h2 className="h-section shead__title">
              Six things a shared drive will never do.
            </h2>
            <p className="lede">
              Everything else is a feature. These are the reasons a serious team
              chooses Dossiro.
            </p>
          </div>

          <div className="feat">
            {FEATURES.map((f, i) => (
              <article key={f.title} className="feat__cell">
                <div className="feat__n tnum">{String(i + 1).padStart(2, '0')}</div>
                <h3 className="feat__title">{f.title}</h3>
                <p className="feat__body">{f.body}</p>
                <p className="feat__say">{f.say}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* -- Security teaser --------------------------------------------- */}
      <section className="section">
        <div className="wrap sec__grid">
          <div>
            <p className="eyebrow">Security &amp; accountability</p>
            <h2 className="h-section shead__title">
              A trail that cannot be rewritten.
            </h2>
            <p className="lede">
              Every action leaves a mark, and each mark is sealed to the one
              before it. Change any entry and the chain breaks — visibly.
            </p>
            <div className="sec__list">
              <div className="sec__item">
                <span className="sec__tick" aria-hidden="true">✓</span>
                <div>
                  <div className="sec__itemTitle">Tamper-evident by design</div>
                  <div className="sec__itemBody">The database itself refuses to edit or delete the record — not the app, the database.</div>
                </div>
              </div>
              <div className="sec__item">
                <span className="sec__tick" aria-hidden="true">✓</span>
                <div>
                  <div className="sec__itemTitle">Each tenant fully sealed</div>
                  <div className="sec__itemBody">One organisation can never see another’s documents, people, or even totals.</div>
                </div>
              </div>
              <div className="sec__item">
                <span className="sec__tick" aria-hidden="true">✓</span>
                <div>
                  <div className="sec__itemTitle">Single sign-on ready</div>
                  <div className="sec__itemBody">Authenticate through Microsoft or Okta; passwords retire once SSO is connected.</div>
                </div>
              </div>
            </div>
            <p style={{ marginTop: '1.75rem' }}>
              <Link href="/security" className="txtlink">
                How the security model works <span className="arrow" aria-hidden="true">→</span>
              </Link>
            </p>
          </div>

          <div className="sec__card" aria-hidden="true">
            <div className="sec__cardHead">
              <span>Audit trail</span>
              <span style={{ color: 'var(--blue)' }}>Verified ✓</span>
            </div>
            <div className="sec__chain">
              {AUDIT.map((e) => (
                <div key={e.hash} className="sec__event">
                  <span className="sec__hash">{e.hash}</span>
                  <span>
                    <span className="sec__evActor">{e.actor}</span>{' '}
                    <span className="sec__evWhat">{e.what}</span>
                  </span>
                  <span className="sec__evTime tnum">{e.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* -- Deployment (navy band) -------------------------------------- */}
      <section className="section band-dark">
        <div className="wrap">
          <div className="shead">
            <p className="eyebrow">Deployment</p>
            <h2 className="h-section shead__title">Run it your way.</h2>
            <p className="lede">
              The same product, three ways — because where your records are
              allowed to live is not our decision to make.
            </p>
          </div>
          <div className="deploy__grid">
            {DEPLOY.map((d) => (
              <div key={d.k} className="deploy__cell">
                <div className="deploy__k">{d.k}</div>
                <h3 className="deploy__title">{d.title}</h3>
                <p className="deploy__body">{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -- Closing CTA ------------------------------------------------- */}
      <section className="section band-tint">
        <div className="wrap cta">
          <h2 className="cta__title" style={{ color: 'var(--ink)' }}>
            See Dossiro on your own documents.
          </h2>
          <p className="lede cta__lede">
            A short, guided walkthrough with your real folder structure in mind.
            No obligation, no sales script.
          </p>
          <div className="cta__actions">
            <Link href="/contact" className="btn btn--primary">
              Request a demo <span className="arrow" aria-hidden="true">→</span>
            </Link>
            <Link href="/product" className="btn btn--ghost">
              Explore the product
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
