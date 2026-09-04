import Link from 'next/link';
import '../inner.css';

export const metadata = {
  title: 'Security',
  description:
    'How Dossiro protects documents: specificity-based permissions, a tamper-evident audit trail enforced by the database, complete tenant isolation, and single sign-on.',
};

const CLAIMS = [
  {
    title: 'Permission by specificity',
    body: 'Access is decided on the document first, then its folder, then each folder above. The first level with a rule wins, and a block beats an allow at the same level. That is what lets you open a department and carve one folder back out.',
  },
  {
    title: 'A trail that cannot be rewritten',
    body: 'Every action is written to a chain where each entry is sealed to the one before. Edit any entry and the chain breaks. The database refuses updates and deletes outright — the guarantee does not depend on the application behaving.',
  },
  {
    title: 'A link is not a login',
    body: 'External recipients get a document, not an account. Their access carries only what the link allows — an expiry, a passcode, a download cap — and it can be revoked in an instant. None of it grants a way into anything else.',
  },
  {
    title: 'Single sign-on ready',
    body: 'Authenticate through Microsoft Entra or Okta. Once SSO is connected it becomes the default and passwords retire, so identity lives with your provider, not in another password store.',
  },
  {
    title: 'Optional single-session sign-in',
    body: 'For accounts that must not be shared, an organisation can require one active session at a time — and when a second sign-in appears, it shows where the first one is rather than simply turning someone away.',
  },
];

export default function Security() {
  return (
    <>
      <section className="phero">
        <div className="wrap phero__inner">
          <p className="eyebrow">Security &amp; accountability</p>
          <h1 className="phero__title">Built so the record can be trusted.</h1>
          <p className="lede phero__lede">
            Access control and an unbreakable audit trail are not features bolted
            on the side of Dossiro. They are the reason it exists.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="claims">
            {CLAIMS.map((c) => (
              <article key={c.title} className="claim">
                <h2 className="claim__title">{c.title}</h2>
                <p className="claim__body">{c.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section band-tint">
        <div className="wrap">
          <div className="shead">
            <p className="eyebrow">The audit trail</p>
            <h2 className="h-section shead__title">Why it can’t be quietly changed.</h2>
            <p className="lede">
              Three properties, working together, turn “we have logs” into
              evidence that survives scrutiny.
            </p>
          </div>
          <div className="steps">
            <div>
              <span className="step__n">01</span>
              <h3 className="step__title">Chained</h3>
              <p className="step__body">
                Each entry carries a fingerprint of the entry before it. Alter one
                and every entry after it stops matching — the break is obvious and
                it points to exactly where.
              </p>
            </div>
            <div>
              <span className="step__n">02</span>
              <h3 className="step__title">Enforced by the database</h3>
              <p className="step__body">
                A database rule rejects any attempt to update or delete a record —
                including a cascading delete. Not the app’s promise; the
                database’s refusal.
              </p>
            </div>
            <div>
              <span className="step__n">03</span>
              <h3 className="step__title">Verifiable</h3>
              <p className="step__body">
                The whole chain can be recomputed on demand and reported as intact
                or broken, so you can prove integrity rather than assert it.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section band-dark">
        <div className="wrap cta">
          <h2 className="cta__title">Ask us the hard questions.</h2>
          <p className="lede cta__lede" style={{ color: 'var(--on-dark-muted)' }}>
            Bring your compliance and IT people. The security model is meant to be
            interrogated.
          </p>
          <div className="cta__actions">
            <Link href="/contact" className="btn btn--on-dark">
              Request a demo <span className="arrow" aria-hidden="true">→</span>
            </Link>
            <Link href="/deployment" className="btn btn--ghost-dark">
              Where it can run
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
