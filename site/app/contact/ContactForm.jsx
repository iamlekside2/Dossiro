'use client';

import { useState } from 'react';
import { Arrow, Button, Field, FieldRow, Input, Select, Textarea } from '@/components/ui';

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
      <div className="border border-blue-line bg-blue-tint p-6 text-blue-ink">
        <h3 className="mb-2">Thank you — we’ve got it.</h3>
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
      <FieldRow>
        <Field label="Your name">
          <Input id="name" value={form.name} onChange={set('name')} required autoComplete="name" />
        </Field>
        <Field label="Work email">
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={set('email')}
            required
            autoComplete="email"
          />
        </Field>
      </FieldRow>

      <Field label="Organisation">
        <Input
          id="organization"
          value={form.organization}
          onChange={set('organization')}
          required
          autoComplete="organization"
        />
      </Field>

      <FieldRow>
        <Field label="Team size">
          <Select id="size" value={form.size} onChange={set('size')}>
            <option value="">Select…</option>
            <option>Under 25</option>
            <option>25–100</option>
            <option>100–500</option>
            <option>500+</option>
          </Select>
        </Field>
        <Field label="Deployment interest">
          <Select id="deployment" value={form.deployment} onChange={set('deployment')}>
            <option value="">Not sure yet</option>
            <option>Hosted</option>
            <option>Dedicated (our cloud)</option>
            <option>On-premise</option>
          </Select>
        </Field>
      </FieldRow>

      <Field label="Anything we should know? (optional)">
        <Textarea id="message" value={form.message} onChange={set('message')} />
      </Field>

      <Button type="submit" variant="primary" disabled={!ready} className="disabled:opacity-50">
        Request a demo <Arrow />
      </Button>
      <p className="mt-3 text-[0.85rem] text-faint">
        We use your details only to arrange the demo. No newsletter, no reselling.
      </p>
    </form>
  );
}
