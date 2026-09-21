import ContactForm from './ContactForm';
import { PageHero, Section, Wrap } from '@/components/ui';

export const metadata = {
  title: 'Request a demo',
  description:
    'Ask for a guided Dossiro walkthrough, built around your own folder structure. Onboarding is sales-led — no self-serve signup, no credit card.',
};

export default function Contact() {
  return (
    <>
      <PageHero
        eyebrow="Request a demo"
        title="See Dossiro on your own documents."
        lede="A short, guided walkthrough — no obligation and no sales script. Tell us a little about your organisation and we’ll shape the session around how you actually file things."
      />

      <Section>
        <Wrap className="grid grid-cols-[0.9fr_1.1fr] items-start gap-[clamp(2rem,5vw,4rem)] max-[820px]:grid-cols-1">
          {/* A blue rule rather than a box: the aside is context, not a card. */}
          <aside className="border-l-2 border-blue pl-6 [&>p+p]:mt-[0.85rem] [&>p]:text-[0.9375rem] [&>p]:text-muted">
            <h3 className="mb-[0.85rem] text-xl">What to expect</h3>
            <p>
              A real person from Calm Global, not a chatbot. We provision your
              organisation ourselves — there’s no self-serve signup — so the first
              conversation sets up a genuine trial rather than a sandbox.
            </p>
            <p>
              Bring your IT and compliance people if you have them. The security
              model is meant to be questioned, and the deployment choice —
              hosted, dedicated or on-premise — is easier to make out loud.
            </p>
            <p>
              Prefer email? Reach us at{' '}
              <a
                className="font-semibold text-blue hover:text-blue-hover"
                href="mailto:hello@dossiro.com"
              >
                hello@dossiro.com
              </a>
              .
            </p>
          </aside>

          <div>
            <ContactForm />
          </div>
        </Wrap>
      </Section>
    </>
  );
}
