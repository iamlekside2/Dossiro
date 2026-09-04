import ContactForm from './ContactForm';
import '../inner.css';

export const metadata = {
  title: 'Request a demo',
  description:
    'Ask for a guided Dossiro walkthrough, built around your own folder structure. Onboarding is sales-led — no self-serve signup, no credit card.',
};

export default function Contact() {
  return (
    <>
      <section className="phero">
        <div className="wrap phero__inner">
          <p className="eyebrow">Request a demo</p>
          <h1 className="phero__title">See Dossiro on your own documents.</h1>
          <p className="lede phero__lede">
            A short, guided walkthrough — no obligation and no sales script. Tell
            us a little about your organisation and we’ll shape the session around
            how you actually file things.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap contact__grid">
          <aside className="contact__aside">
            <h3>What to expect</h3>
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
              <a className="txtlink" href="mailto:hello@dossiro.com" style={{ display: 'inline' }}>
                hello@dossiro.com
              </a>
              .
            </p>
          </aside>

          <div>
            <ContactForm />
          </div>
        </div>
      </section>
    </>
  );
}
