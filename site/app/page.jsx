import Link from 'next/link';
import PageStack from '@/components/PageStack';
import {
  Arrow, BandDark, Button, H2, Hero, Section, SectionHead, TextLink, Wrap,
} from '@/components/ui';

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
    body: 'The fastest way to start. Your organisation gets its own sealed and secured tenancy on our managed platform — nothing for you to install, nothing to maintain.',
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
      <div className="relative overflow-hidden border-b border-line">
        <Wrap className="grid grid-cols-[1.05fr_0.95fr] items-center gap-[clamp(2rem,5vw,4rem)] py-[clamp(3rem,7vw,6rem)] max-[900px]:grid-cols-1">
          <div>
            <p className="eyebrow">Enterprise document management</p>
            <Hero className="mb-6">The document system that keeps its own record.</Hero>
            <p className="lede mb-8 text-[clamp(1.125rem,1.7vw,1.35rem)]">
              Dossiro is where a growing organisation’s documents live — and stay
              accountable. Control who sees what, prove who did what, and share
              beyond your walls without ever losing the thread.
            </p>
            <div className="flex flex-wrap items-center gap-[0.85rem]">
              <Button as={Link} href="/contact" variant="primary">
                Request a demo <Arrow />
              </Button>
              <Button as={Link} href="/product" variant="ghost">
                See what it does
              </Button>
            </div>
            <p className="mt-6 text-sm text-faint">
              Hosted, dedicated, or fully on-premise · sales-led onboarding, no credit card
            </p>
          </div>

          {/* Above the copy on a narrow window: the graphic is what says what
              this is before anybody reads a word. */}
          <div className="flex justify-center max-[900px]:order-first max-[900px]:mx-auto max-[900px]:max-w-[360px] [&_svg]:h-auto [&_svg]:w-full [&_svg]:max-w-[460px]">
            <PageStack />
          </div>
        </Wrap>
      </div>

      {/* -- Trust strip: what it is, not fake logos ---------------------- */}
      <div className="border-b border-line bg-surface">
        <Wrap className="flex flex-wrap items-center gap-x-10 gap-y-3 py-5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-faint">Made for</span>
          {['Growing teams', 'Multi-branch organisations', 'Regulated industries', 'Public sector'].map(
            (t, i) => (
              <span key={t} className="contents">
                {i > 0 ? <span className="text-blue" aria-hidden="true">·</span> : null}
                <span className="text-[0.9375rem] font-semibold text-ink-2">{t}</span>
              </span>
            ),
          )}
        </Wrap>
      </div>

      {/* -- The problem -------------------------------------------------- */}
      <Section>
        <Wrap className="grid grid-cols-2 items-start gap-[clamp(2rem,5vw,4rem)] max-[900px]:grid-cols-1">
          <div>
            <p className="eyebrow">The shared-drive problem</p>
            <H2 className="mb-4">A folder on a server answers the wrong question.</H2>
            <p className="lede mb-4">
              Most organisations keep their documents in a shared drive. It tells
              you where a file is. It cannot tell you who is allowed to open it,
              who already did, or whether that record can be trusted six months
              from now.
            </p>
            <p className="text-muted">
              As a team grows — more people, more offices, more outside parties —
              that gap turns into risk. Dossiro is built around the question a
              shared drive can’t answer.
            </p>
          </div>
          <aside className="border-l-2 border-blue pl-6">
            <p className="font-serif text-[clamp(1.25rem,2vw,1.6rem)] leading-[1.35] text-ink">
              “Where is the file” is easy. “Who may open this file, who already
              has, and can we prove it” is the question that actually matters.
            </p>
          </aside>
        </Wrap>
      </Section>

      {/* -- Differentiators --------------------------------------------- */}
      <div className="bg-surface-2">
        <Section>
          <Wrap>
            <SectionHead
              className="mb-[clamp(2rem,4vw,3rem)] max-w-[46rem]"
              eyebrow="What sets it apart"
              title="Six things a shared drive will never do."
              lede="Everything else is a feature. These are the reasons a serious team chooses Dossiro."
            />

            {/* Border on the container's top and left, then on each cell's
                right and bottom, so the outer edge is drawn once rather than
                doubled where cells meet. */}
            <div className="grid grid-cols-3 border-l border-t border-line max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
              {FEATURES.map((f, i) => (
                <article
                  key={f.title}
                  className="border-b border-r border-line bg-surface p-[clamp(1.5rem,2.5vw,2.25rem)]"
                >
                  <div className="mb-4 font-sans text-[0.8125rem] font-bold tracking-[0.08em] tabular-nums text-blue">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <h3 className="mb-[0.6rem] text-xl">{f.title}</h3>
                  <p className="text-[0.9375rem] leading-[1.55] text-muted">{f.body}</p>
                  <p className="mt-4 border-t border-dashed border-line pt-4 text-[0.9rem] italic text-ink-2">
                    {f.say}
                  </p>
                </article>
              ))}
            </div>
          </Wrap>
        </Section>
      </div>

      {/* -- Security teaser --------------------------------------------- */}
      <Section>
        <Wrap className="grid grid-cols-[0.9fr_1.1fr] items-center gap-[clamp(2rem,5vw,4rem)] max-[900px]:grid-cols-1">
          <div>
            <p className="eyebrow">Security &amp; accountability</p>
            <H2 className="mb-4">A trail that cannot be rewritten.</H2>
            <p className="lede">
              Every action leaves a mark, and each mark is sealed to the one
              before it. Change any entry and the chain breaks — visibly.
            </p>
            <div className="mt-6 flex flex-col gap-[1.1rem]">
              <Tick title="Tamper-evident by design">
                The database itself refuses to edit or delete the record — not the app, the database.
              </Tick>
              <Tick title="Single sign-on ready">
                Authenticate through Microsoft or Okta; passwords retire once SSO is connected.
              </Tick>
            </div>
            <p className="mt-7">
              <TextLink as={Link} href="/security">
                How the security model works <Arrow />
              </TextLink>
            </p>
          </div>

          {/* A picture of the audit trail, not a real one. */}
          <div className="border border-line bg-surface" aria-hidden="true">
            <div className="flex items-center justify-between border-b border-line bg-surface-2 px-[1.15rem] py-[0.85rem] text-[0.8125rem] font-bold uppercase tracking-[0.06em] text-muted">
              <span>Audit trail</span>
              <span className="text-blue">Verified ✓</span>
            </div>
            <div className="py-2">
              {AUDIT.map((e) => (
                <div
                  key={e.hash}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-[0.85rem] border-b border-line-soft px-[1.15rem] py-[0.7rem] text-sm last:border-b-0"
                >
                  <span className="font-mono text-xs text-blue">{e.hash}</span>
                  <span>
                    <span className="font-semibold">{e.actor}</span>{' '}
                    <span className="text-muted">{e.what}</span>
                  </span>
                  <span className="text-[0.8rem] tabular-nums text-faint">{e.time}</span>
                </div>
              ))}
            </div>
          </div>
        </Wrap>
      </Section>

      {/* -- Deployment (navy band) -------------------------------------- */}
      <BandDark>
        <Section>
          <Wrap>
            <SectionHead
              className="mb-[clamp(2rem,4vw,3rem)] max-w-[46rem]"
              eyebrow="Deployment"
              title="Run it where your records are allowed to live."
              lede="The same product, three ways. Nothing phones home in any of them."
            />
            <div className="mt-10 grid grid-cols-3 gap-px border border-on-dark-line bg-on-dark-line max-[900px]:grid-cols-1">
              {DEPLOY.map((d) => (
                <div key={d.k} className="bg-blue-ink p-[clamp(1.5rem,2.5vw,2rem)]">
                  <div className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-g-teal">
                    {d.k}
                  </div>
                  <h3 className="mb-2 text-xl text-white">{d.title}</h3>
                  <p className="text-[0.9375rem] leading-[1.55] text-on-dark-muted">{d.body}</p>
                </div>
              ))}
            </div>
          </Wrap>
        </Section>
      </BandDark>

      {/* -- Close -------------------------------------------------------- */}
      <div className="bg-surface-2">
        <Section>
          <Wrap className="text-center">
            <h2 className="mb-4 text-[clamp(1.875rem,4vw,3rem)]">
              See it on your own folder structure.
            </h2>
            <p className="lede mx-auto mb-8 text-center">
              Onboarding is sales-led. We set your organisation up ourselves, so
              the first conversation is about your documents, not a sandbox.
            </p>
            <div className="flex flex-wrap justify-center gap-[0.85rem]">
              <Button as={Link} href="/contact" variant="primary">
                Request a demo <Arrow />
              </Button>
              <Button as={Link} href="/deployment" variant="ghost">
                Where it can run
              </Button>
            </div>
          </Wrap>
        </Section>
      </div>
    </>
  );
}

/** A ticked point beside the audit-trail illustration. */
function Tick({ title, children }) {
  return (
    <div className="flex items-start gap-[0.85rem]">
      <span
        className="mt-0.5 grid h-[22px] w-[22px] flex-none place-items-center bg-blue-tint text-[0.8rem] font-bold text-blue"
        aria-hidden="true"
      >
        ✓
      </span>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-[0.9375rem] text-muted">{children}</div>
      </div>
    </div>
  );
}
