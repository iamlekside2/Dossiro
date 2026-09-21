import Link from 'next/link';
import {
  Arrow, Button, CallToAction, Card, CardGrid, PageHero, Section, SectionHead, Step, Steps, Wrap,
} from '@/components/ui';

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
      <PageHero
        eyebrow="Security & accountability"
        title="Built so the record can be trusted."
        lede="Access control and an unbreakable audit trail are not features bolted on the side of Dossiro. They are the reason it exists."
      />

      <Section>
        <Wrap>
          <CardGrid cols={2}>
            {CLAIMS.map((c) => (
              <Card key={c.title} title={c.title}>
                {c.body}
              </Card>
            ))}
          </CardGrid>
        </Wrap>
      </Section>

      <div className="bg-surface-2">
        <Section>
          <Wrap>
            <SectionHead
              eyebrow="The audit trail"
              title="Why it can’t be quietly changed."
              lede="Three properties, working together, turn “we have logs” into evidence that survives scrutiny."
            />
            <Steps>
              <Step n="01" title="Chained">
                Each entry carries a fingerprint of the entry before it. Alter one
                and every entry after it stops matching — the break is obvious and
                it points to exactly where.
              </Step>
              <Step n="02" title="Enforced by the database">
                A database rule rejects any attempt to update or delete a record —
                including a cascading delete. Not the app’s promise; the
                database’s refusal.
              </Step>
              <Step n="03" title="Verifiable">
                The whole chain can be recomputed on demand and reported as intact
                or broken, so you can prove integrity rather than assert it.
              </Step>
            </Steps>
          </Wrap>
        </Section>
      </div>

      <CallToAction
        title="Ask us the hard questions."
        lede="Bring your compliance and IT people. The security model is meant to be interrogated."
      >
        <Button as={Link} href="/contact" variant="onDark">
          Request a demo <Arrow />
        </Button>
        <Button as={Link} href="/deployment" variant="ghostDark">
          Where it can run
        </Button>
      </CallToAction>
    </>
  );
}
