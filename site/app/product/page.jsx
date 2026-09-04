import Link from 'next/link';
import '../inner.css';

export const metadata = {
  title: 'Product',
  description:
    'What Dossiro does: a repository with real permissions, full-text search, versioning and a recycle bin, sharing that stays under control, and channels for getting documents in.',
};

const CAPS = [
  {
    k: 'Repository',
    title: 'A repository, not a drive',
    body: [
      'Documents live in cabinets, drawers and folders that nest as deep as you need. Every document carries a classification — Internal, Confidential, Restricted — and a child folder can never sit below its parent’s sensitivity.',
    ],
    list: [
      'Folders, sub-folders and locked drawers with their own passcode',
      'Classification inherited down the tree, never weakened by accident',
      'Branches, so a document belongs to an office as well as a folder',
    ],
  },
  {
    k: 'Versions & recovery',
    title: 'Nothing is ever quietly overwritten',
    body: [
      'Each change is a new version pointing back at the last, so the full history stays intact and any version can be restored. Deleting is a soft delete: the file waits in a recycle bin, recoverable, until its retention window closes.',
    ],
    list: [
      'Full version history with restore',
      'Recycle bin with a configurable recovery window',
      'Retention policies and legal holds that block deletion outright',
    ],
  },
  {
    k: 'Search',
    title: 'Find by name, or by what’s inside',
    body: [
      'Search across the whole repository by name, type, owner, date or classification — and, for scanned and text documents, by their actual contents. Results are always scoped to what you are allowed to see, so a search never reveals a document you can’t open.',
    ],
    list: [
      'Metadata search across every field',
      'Full-text search inside documents',
      'Permission-scoped results, always',
    ],
  },
  {
    k: 'Sharing',
    title: 'Send outside, keep control',
    body: [
      'Share a document with someone who has no account. The link can expire, demand a passcode, cap downloads, or allow viewing while blocking download — and you can revoke it the instant you change your mind. The passcode never travels in the address bar.',
    ],
    list: [
      'Expiry, passcodes and download caps per link',
      'View-only that is actually enforced, not just displayed',
      'Instant revocation, and every open recorded',
    ],
  },
  {
    k: 'Channels',
    title: 'Get documents in the way people already work',
    body: [
      'Documents can arrive by email or WhatsApp, not only by upload. An address or number is trusted only once its owner has verified it, so the convenience never becomes a way in for a stranger.',
    ],
    list: [
      'Email-in and WhatsApp-in, filed automatically',
      'Verified sender identities only',
      'Every arrival logged to the same trail as everything else',
    ],
  },
  {
    k: 'Administration',
    title: 'Run the organisation, not just the files',
    body: [
      'People, roles, groups and branches; single sign-on through Microsoft or Okta; custom web addresses; retention and classification rules. The administrative work lives in its own space, separate from the daily document work.',
    ],
    list: [
      'Invite-only membership with tiered roles',
      'Groups and branches that mirror your org chart',
      'SSO-ready; custom domain per organisation',
    ],
  },
];

export default function Product() {
  return (
    <>
      <section className="phero">
        <div className="wrap phero__inner">
          <p className="eyebrow">Product</p>
          <h1 className="phero__title">Everything a growing team needs from its documents.</h1>
          <p className="lede phero__lede">
            Dossiro brings the repository, its permissions, its history and its
            audit trail into one place — reachable from a browser, on any device,
            with no desktop software to install.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="caps">
            {CAPS.map((c) => (
              <article key={c.k} className="cap">
                <div>
                  <div className="cap__k">{c.k}</div>
                  <h2 className="cap__title">{c.title}</h2>
                </div>
                <div className="cap__body">
                  {c.body.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                  <ul className="cap__list">
                    {c.list.map((li) => (
                      <li key={li}>{li}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>

          <p className="statusnote" style={{ marginTop: '2.5rem' }}>
            <strong>Straight about where we are.</strong> The repository, search,
            sharing, versioning, audit and administration are built and tested.
            Scanning with text recognition, invoice capture, e-forms and approval
            routing are on the roadmap — we’ll tell you exactly what’s ready when
            you talk to us, never the other way round.
          </p>
        </div>
      </section>

      <section className="section band-dark">
        <div className="wrap cta">
          <h2 className="cta__title">See it on your own folder structure.</h2>
          <p className="lede cta__lede" style={{ color: 'var(--on-dark-muted)' }}>
            The demo is built around how your organisation actually files things.
          </p>
          <div className="cta__actions">
            <Link href="/contact" className="btn btn--on-dark">
              Request a demo <span className="arrow" aria-hidden="true">→</span>
            </Link>
            <Link href="/security" className="btn btn--ghost-dark">
              How security works
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
