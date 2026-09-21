import Link from 'next/link';
import {
  Arrow, Button, CallToAction, Card, CardGrid, H2, PageHero, Prose, Section, Wrap,
} from '@/components/ui';

export const metadata = {
  title: 'About',
  description:
    'Dossiro is a Calm Global product — an enterprise document system built for organisations that need to control access and prove accountability.',
};

const VALUES = [
  {
    title: 'Honest about what’s ready',
    body: 'We tell you exactly what is built and what is still on the roadmap. A demo that shows fiction is how a project loses trust before it starts.',
  },
  {
    title: 'Accountability first',
    body: 'The record that says who did what is not an add-on. We designed the whole product around making it trustworthy and impossible to quietly rewrite.',
  },
  {
    title: 'Your data, your terms',
    body: 'Hosted, dedicated or fully offline. Nothing phones home. Where your records live is a decision we hand to you, not one we make for you.',
  },
];

export default function About() {
  return (
    <>
      <PageHero
        eyebrow="About"
        title="A document system for organisations that have to be sure."
        lede="Dossiro is a Calm Global product, built for teams whose documents carry weight — where the wrong person seeing a file, or a record that can’t be trusted, is a real problem rather than an inconvenience."
      />

      <Section>
        <Wrap>
          <Prose>
            <p className="eyebrow">Why we built it</p>
            <H2 className="mb-4">
              Most organisations outgrow the shared drive without noticing.
            </H2>
            <p>
              It starts as a few folders on a server. Then there are more people,
              more offices, more outside parties who need one document but not the
              rest — and a tool that only knows where a file is can no longer
              answer who may open it, who already has, or whether the history can
              be believed.
            </p>
            <p>
              We built Dossiro to answer those questions properly, and to do it in
              a browser rather than a piece of desktop software chained to one
              machine. It is multi-tenant by design: one deployment serves many
              organisations, each sealed from the others, each with its own people,
              branches and rules.
            </p>
            <p>
              Calm Global builds and delivers software for organisations across
              health, government and enterprise. Dossiro is where that experience —
              of records that must be accurate, private and accountable — became a
              product.
            </p>
          </Prose>

          <CardGrid cols={3} className="mt-10">
            {VALUES.map((v) => (
              <Card key={v.title} title={v.title}>
                {v.body}
              </Card>
            ))}
          </CardGrid>
        </Wrap>
      </Section>

      <CallToAction
        title="Let’s talk about your documents."
        lede="Onboarding is sales-led — we set your organisation up, so the first conversation is a real one."
      >
        <Button as={Link} href="/contact" variant="onDark">
          Request a demo <Arrow />
        </Button>
      </CallToAction>
    </>
  );
}
