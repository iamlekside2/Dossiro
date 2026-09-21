import Link from 'next/link';
import {
  Arrow, BestFor, Button, CallToAction, Capabilities, Capability, CompareWrap, PageHero,
  Section, Td, Th, Wrap,
} from '@/components/ui';

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
      <PageHero
        eyebrow="Deployment"
        title="Run it your way."
        lede="Where your records are allowed to live is your decision, not ours. The same Dossiro runs three ways — nothing phones home in any of them."
      />

      <Section>
        <Wrap>
          <Capabilities>
            <Capability label="Hosted" title="We run it for you">
              <p>
                The fastest way to begin. Your organisation gets its own sealed
                and secured tenancy on our managed platform — no servers for you
                to provision, no software to install, no maintenance to own. We
                keep it patched, backed up and running.
              </p>
              <BestFor>Best for teams who want to be working this week.</BestFor>
            </Capability>

            <Capability label="Dedicated" title="Your own cloud">
              <p>
                A private instance inside your own cloud account, isolated from
                every other customer at the infrastructure level. You hold the
                environment and the data residency; we keep the software healthy.
              </p>
              <BestFor>Best for organisations with cloud and data-residency policies.</BestFor>
            </Capability>

            <Capability label="On-premise" title="Inside your walls">
              <p>
                The entire system on your own servers, able to run with no
                internet connection at all. Subscriptions are verified from a
                signed licence that works offline, and if a renewal is ever late,
                people keep full access to everything already stored — only new
                records and new accounts pause.
              </p>
              <BestFor>Best for records that are not permitted to leave the building.</BestFor>
            </Capability>
          </Capabilities>

          <CompareWrap>
            <thead>
              <tr>
                <Th>&nbsp;</Th>
                <Th>Hosted</Th>
                <Th>Dedicated</Th>
                <Th>On-premise</Th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r[0]}>
                  {r.map((cell, i) => {
                    if (i === 0) return <Td key={i} first>{cell}</Td>;
                    if (cell === 'yes') return <Td key={i} tone="yes">Yes</Td>;
                    if (cell === 'no') return <Td key={i} tone="no">—</Td>;
                    return <Td key={i}>{cell}</Td>;
                  })}
                </tr>
              ))}
            </tbody>
          </CompareWrap>
        </Wrap>
      </Section>

      <CallToAction
        title="Not sure which fits?"
        lede="Tell us your constraints — regulator, cloud policy, connectivity — and we’ll recommend the model that suits, not the one that suits us."
      >
        <Button as={Link} href="/contact" variant="onDark">
          Talk to us <Arrow />
        </Button>
      </CallToAction>
    </>
  );
}
