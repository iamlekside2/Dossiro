'use client';

import { useState } from 'react';

/**
 * Demo-request capture. Front-end only for now — on submit it validates and
 * shows the confirmation state; wiring it to an email/CRM endpoint is a later
 * step, called out plainly rather than faked.
 */
export default function ContactForm() {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    organization: '',
    size: '',
    deployment: '',
    message: '',
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const ready = form.name.trim() && form.email.includes('@') && form.organization.trim();

  function submit(e) {
    e.preventDefault();
    if (!ready) return;
    // TODO(wire): POST to the demo-request endpoint / CRM once chosen.
    setSent(true);
  }

  if (sent) {
    return (
      <div className="form__ok">
        <h3>Thank you — we’ve got it.</h3>
        <p>
          Someone from Calm Global will reach out to {form.name.split(' ')[0]} at{' '}
          <strong>{form.email}</strong> to arrange a walkthrough built around{' '}
          {form.organization}’s own folder structure.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="field__row">
        <div className="field">
          <label htmlFor="name">Your name</label>
          <input id="name" value={form.name} onChange={set('name')} required autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="email">Work email</label>
          <input id="email" type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
        </div>
      </div>

      <div className="field">
        <label htmlFor="organization">Organisation</label>
        <input id="organization" value={form.organization} onChange={set('organization')} required autoComplete="organization" />
      </div>

      <div className="field__row">
        <div className="field">
          <label htmlFor="size">Team size</label>
          <select id="size" value={form.size} onChange={set('size')}>
            <option value="">Select…</option>
            <option>Under 25</option>
            <option>25–100</option>
            <option>100–500</option>
            <option>500+</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="deployment">Deployment interest</label>
          <select id="deployment" value={form.deployment} onChange={set('deployment')}>
            <option value="">Not sure yet</option>
            <option>Hosted</option>
            <option>Dedicated (our cloud)</option>
            <option>On-premise</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="message">Anything we should know? (optional)</label>
        <textarea id="message" value={form.message} onChange={set('message')} />
      </div>

      <button type="submit" className="btn btn--primary" disabled={!ready}>
        Request a demo <span className="arrow" aria-hidden="true">→</span>
      </button>
      <p className="form__note">
        We use your details only to arrange the demo. No newsletter, no reselling.
      </p>
    </form>
  );
}
