import { useState } from 'react';
import api from '../lib/api.js';
import { btn, callout } from '../ui.js';
import { M } from '../form.js';

/**
 * The "New …" dialogs behind the toolbar's first verb.
 *
 * One component rather than several because the shape is identical — a few
 * fields, a create call, reload on success — and three near-copies would drift
 * apart the moment anyone touched one of them.
 */

const FORMS = {
  branch: {
    title: 'New branch',
    lede: 'An office of this organisation. Staff are posted to one, and cabinets can belong to one.',
    submit: 'Create branch',
    fields: [
      { key: 'name', label: 'Branch name', required: true, placeholder: 'Kano Office' },
      { key: 'code', label: 'Code', placeholder: 'KAN', hint: 'Short code used in reports.' },
      { key: 'address', label: 'Address' },
      { key: 'phone', label: 'Phone' },
    ],
    async submitFn(values) {
      return api.branches.create({
        name: values.name.trim(),
        code: values.code?.trim() || undefined,
        address: values.address?.trim() || undefined,
        phone: values.phone?.trim() || undefined,
      });
    },
  },

  hostname: {
    title: 'Add a web address',
    lede: 'The address this organisation reaches its records on. It must be proven before it resolves.',
    submit: 'Add address',
    fields: [
      {
        key: 'hostname',
        label: 'Hostname',
        required: true,
        placeholder: 'records.example.gov.ng',
        hint: 'Without https:// — just the host.',
      },
    ],
    async submitFn(values) {
      return api.organization.addHostname(values.hostname.trim());
    },
  },

  person: {
    title: 'Invite someone',
    lede: 'They receive a single-use link to choose a password. There is no self-serve signup.',
    submit: 'Send invitation',
    fields: [
      { key: 'displayName', label: 'Full name', required: true },
      { key: 'email', label: 'Work email', required: true, type: 'email' },
      { key: 'jobTitle', label: 'Job title' },
    ],
    async submitFn(values) {
      return api.users.invite({
        displayName: values.displayName.trim(),
        email: values.email.trim(),
        jobTitle: values.jobTitle?.trim() || undefined,
      });
    },
  },
};

export default function CreateDialog({ kind, onClose, onCreated }) {
  const spec = FORMS[kind];
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  if (!spec) return null;

  const ready = spec.fields.every((f) => !f.required || (values[f.key] ?? '').trim());

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await spec.submitFn(values);
      setResult(res);
      onCreated?.();
    } catch (err) {
      setError(err.body?.message ?? err.message);
    } finally {
      setBusy(false);
    }
  }

  // An invitation returns a link that is shown once. With SMTP off it is the
  // only way in, so the dialog stays open until it has been acknowledged.
  const handoffLink = result?.acceptUrl
    ? `${window.location.origin}${result.acceptUrl}`
    : result?.instructions
      ? null
      : null;

  return (
    <div className={M.backdrop} role="dialog" aria-modal="true" aria-label={spec.title}>
      <form className={M.card} onSubmit={submit}>
        <h2 className={M.title}>
          {spec.title}
        </h2>
        <p className={M.lede}>
          {spec.lede}
        </p>

        {!result ? (
          <>
            {spec.fields.map((f) => (
              <label className={M.field} key={f.key}>
                <span className={M.fieldLabel}>
                  {f.label}
                  {f.required ? '' : ' (optional)'}
                </span>
                <input
                  className={M.input}
                  type={f.type ?? 'text'}
                  value={values[f.key] ?? ''}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
                {f.hint && <span className={M.fieldHint}>{f.hint}</span>}
              </label>
            ))}

            {error && (
              <div className={callout('red')} style={{ margin: '0 0 14px' }}>
                {error}
              </div>
            )}

            <div className={M.actions}>
              <button type="submit" className={btn('primary')} disabled={!ready || busy}>
                {busy ? 'Working…' : spec.submit}
              </button>
              <button type="button" className={btn()} onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {handoffLink && (
              <div className={callout('ochre')}>
                {result.delivery === 'sent'
                  ? `An invitation has been emailed to ${result.user?.email}.`
                  : 'Email is switched off, so nothing was sent. Pass this link on yourself:'}
                {result.delivery !== 'sent' && (
                  <div className={M.link}>
                    <code>{handoffLink}</code>
                    <button
                      type="button"
                      className={M.linkbtn}
                      onClick={() => navigator.clipboard?.writeText(handoffLink)}
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>
            )}

            {result.instructions && (
              <div className={callout('ochre')}>
                <strong>{result.hostname} added.</strong> It does not resolve yet.
                {Array.isArray(result.instructions) ? (
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                    {result.instructions.map((line) => (
                      <li key={line} style={{ marginBottom: 4, wordBreak: 'break-all' }}>
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: '8px 0 0' }}>{result.instructions}</p>
                )}
              </div>
            )}

            {!handoffLink && !result.instructions && (
              <div className={callout()}>Created.</div>
            )}

            <div className={M.actions}>
              <button type="button" className={btn('primary')} onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

/** Which dialog, if any, a toolbar verb opens. */
export function dialogForVerb(area, scopeIndex, verb) {
  if (area !== 'admin') return null;
  if (scopeIndex === 0 && verb.startsWith('Add person')) return 'person';
  if (scopeIndex === 2 && (verb.startsWith('New branch') || verb.startsWith('Open branch'))) return 'branch';
  if (scopeIndex === 3 && verb.startsWith('Add address')) return 'hostname';
  return null;
}
