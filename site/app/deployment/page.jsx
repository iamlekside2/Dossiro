import Link from 'next/link';
import '../inner.css';

export const metadata = {
  title: 'Deployment',
  description:
    'Dossiro runs three ways: hosted by Calm Global, dedicated in your own cloud, or fully on-premise and offline. The same product, wherever your records are allowed to live.',
};

const ROWS = [
  ['Where documents live', 'Our managed platform', 'Your cloud account', 'Your own servers'],
  ['Runs without internet', 'no', 'no', 'yes'],
  ['You manage infrastructure', 'no', 'shared', 'yes'],
  ['Isolated from other customers', 'yes', 'yes', 'yes'],
  ['Fastest to start', 'yes', 'no', 'no'],
  ['Data never leaves your building', 'no', 'no', 'yes'],
];

export default function Deployment() {
  return (
    <>
      <section className="phero">
        <div className="wrap phero__inner">
          <p className="eyebrow">Deployment</p>
          <h1 className="phero__title">Run it your way.</h1>
          <p className="lede phero__lede">
            Where your records are allowed to live is your decision, not ours. The
            same Dossiro runs three ways — nothing phones home in any of them.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="caps" style={{ borderTop: 0 }}>
            <article className="cap" style={{ borderTop: '1px solid var(--line)' }}>
              <div>
                <div className="cap__k">Hosted</div>
                <h2 className="cap__title">We run it for you</h2>
              </div>
              <div className="cap__body">
                <p>
                  The fastest way to begin. Your organisation gets its own sealed
                  tenant on our managed platform — no servers to provision, no
                  software to install, no maintenance to own. We keep it patched,
                  backed up and running.
                </p>
                <p style={{ color: 'var(--muted)', fontSize: '0.9375rem' }}>
                  Best for teams who want to be working this week.
                </p>
              </div>
            </article>
            <article className="cap">
              <div>
                <div className="cap__k">Dedicated</div>
                <h2 className="cap__title">Your own cloud</h2>
              </div>
              <div className="cap__body">
                <p>
                  A private instance inside your own cloud account, isolated from
                  every other customer at the infrastructure level. You hold the
                  environment and the data residency; we keep the software healthy.
                </p>
                <p style={{ color: 'var(--muted)', fontSize: '0.9375rem' }}>
                  Best for organisations with cloud and data-residency policies.
                </p>
              </div>
            </article>
            <article className="cap">
              <div>
                <div className="cap__k">On-premise</div>
                <h2 className="cap__title">Inside your walls</h2>
              </div>
              <div className="cap__body">
                <p>
                  The entire system on your own servers, able to run with no
                  internet connection at all. Subscriptions are verified from a
                  signed licence that works offline, and if a renewal is ever late,
                  people keep full access to everything already stored — only new
                  records and new accounts pause.
                </p>
                <p style={{ color: 'var(--muted)', fontSize: '0.9375rem' }}>
                  Best for records that are not permitted to leave the building.
                </p>
              </div>
            </article>
          </div>

          <div className="cmp__wrap">
            <table className="cmp">
              <thead>
                <tr>
                  <th scope="col">&nbsp;</th>
                  <th scope="col">Hosted</th>
                  <th scope="col">Dedicated</th>
                  <th scope="col">On-premise</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r[0]}>
                    {r.map((cell, i) => {
                      if (i === 0) return <td key={i}>{cell}</td>;
                      if (cell === 'yes') return <td key={i} className="yes">Yes</td>;
                      if (cell === 'no') return <td key={i} className="no">—</td>;
                      return <td key={i}>{cell}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section band-dark">
        <div className="wrap cta">
          <h2 className="cta__title">Not sure which fits?</h2>
          <p className="lede cta__lede" style={{ color: 'var(--on-dark-muted)' }}>
            Tell us your constraints — regulator, cloud policy, connectivity — and
            we’ll recommend the model that suits, not the one that suits us.
          </p>
          <div className="cta__actions">
            <Link href="/contact" className="btn btn--on-dark">
              Talk to us <span className="arrow" aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
