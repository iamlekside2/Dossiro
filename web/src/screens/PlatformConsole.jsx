import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api.js';
import { useSession } from '../session/SessionContext.jsx';

/**
 * Calm Global's operator console.
 *
 * Deliberately not the workbench. Operators do not read documents — they run
 * tenant lifecycle — so this is a different surface with a different shape,
 * and the platform organisation holds no records for it to show.
 *
 * Same visual language as the product: zero radius, 1px borders, one blue.
 */

const STATUS_CHIP = {
  ACTIVE: 'chip--green',
  TRIAL: 'chip--blue',
  SUSPENDED: 'chip--ochre',
  CLOSED: 'chip--red',
};

export default function PlatformConsole() {
  const { user, signOut } = useSession();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState(null);
  const [suspending, setSuspending] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTenants(await api.platform.listOrganizations());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(id, status, reason) {
    try {
      await api.platform.setStatus(id, status, reason);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="console">
      <header className="console__bar">
        <span className="console__mark" aria-hidden="true" />
        <span className="console__title">Platform</span>
        <span className="console__sub">Tenant administration</span>
        <span style={{ flex: '1 1 auto' }} />
        <span className="console__who">{user?.email}</span>
        <button type="button" className="console__signout" onClick={signOut}>
          Sign out
        </button>
      </header>

      <main className="console__body">
        <div className="console__head">
          <div>
            <h1 className="console__h1">Tenants</h1>
            <p className="console__lede">
              Each client company is one organisation. There is no self-serve signup — a tenant
              exists because someone here created it.
            </p>
          </div>
          <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
            Provision a tenant
          </button>
        </div>

        {error && (
          <div className="callout callout--red" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        {issued && <IssuedInvite issued={issued} onDismiss={() => setIssued(null)} />}

        {loading ? (
          <p className="console__muted">Loading tenants…</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Organisation</th>
                  <th>Status</th>
                  <th>Plan</th>
                  <th>Seats</th>
                  <th>Documents</th>
                  <th>Domains</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div className="console__name">{t.name}</div>
                      <div className="console__slug">{t.slug}</div>
                    </td>
                    <td>
                      <span className={`chip ${STATUS_CHIP[t.status] ?? ''}`}>{t.status}</span>
                    </td>
                    <td>{t.plan}</td>
                    <td>
                      {t.seatsUsed}
                      {t.seatLimit ? ` / ${t.seatLimit}` : ' / ∞'}
                    </td>
                    <td>{t.documents}</td>
                    <td>
                      {t.domains.length
                        ? t.domains.map((d) => (
                            <div key={d.domain} className="console__domain">
                              {d.domain}
                              {!d.verifiedAt && <span className="chip chip--ochre">unverified</span>}
                            </div>
                          ))
                        : '—'}
                    </td>
                    <td className="console__actions">
                      {/* The platform realm cannot be suspended — offering the
                          action would only ever produce a refusal. */}
                      {t.isPlatform ? (
                        <span className="console__slug">This console</span>
                      ) : t.status === 'SUSPENDED' || t.status === 'CLOSED' ? (
                        <button type="button" className="linkbtn" onClick={() => setStatus(t.id, 'ACTIVE')}>
                          Reactivate
                        </button>
                      ) : (
                        <>
                          {/* Only a trial has anywhere to be activated to.
                              Offering it on an already-active tenant is a
                              button that does nothing. */}
                          {t.status === 'TRIAL' && (
                            <button type="button" className="linkbtn" onClick={() => setStatus(t.id, 'ACTIVE')}>
                              Activate
                            </button>
                          )}
                          {/* Never fires straight from the button. This locks a
                              whole company out of its own records, and the
                              reason is written to a trail nobody can edit
                              afterwards — so it is asked for first. */}
                          <button
                            type="button"
                            className="linkbtn linkbtn--danger"
                            onClick={() => setSuspending(t)}
                          >
                            Suspend
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="console__foot">
          Suspending a tenant revokes every session and blocks new sign-ins immediately. Documents
          are untouched — suspension is a commercial state, not a delete.
        </p>
      </main>

      {creating && (
        <ProvisionDialog
          onClose={() => setCreating(false)}
          onCreated={(res) => {
            setCreating(false);
            setIssued(res);
            void load();
          }}
        />
      )}

      {suspending && (
        <SuspendDialog
          tenant={suspending}
          onClose={() => setSuspending(null)}
          onConfirm={async (reason) => {
            await setStatus(suspending.id, 'SUSPENDED', reason);
            setSuspending(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Asks why before locking a tenant out.
 *
 * Not a yes/no confirmation: the point is not to slow the operator down, it is
 * that the reason has to exist. Six months later, in a dispute, "suspended by
 * ootitolaye@calmglobal.com on 14 August" answers nothing on its own.
 */
function SuspendDialog({ tenant, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ready = reason.trim().length >= 4;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={`Suspend ${tenant.name}`}>
      <form className="modal__card" onSubmit={submit}>
        <h2 className="console__h1" style={{ fontSize: 19, marginBottom: 4 }}>
          Suspend {tenant.name}
        </h2>
        <p className="console__lede" style={{ marginBottom: 18 }}>
          Every session in the organisation is revoked immediately and nobody there can sign in
          again until you reactivate them. Their documents are untouched.
        </p>

        <label className="field">
          <span className="field__label">Why</span>
          <input
            className="mfield"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Non-payment, 60 days overdue"
            maxLength={500}
            autoFocus
            required
          />
        </label>
        <p className="console__lede" style={{ marginTop: -6, marginBottom: 18 }}>
          Written to the audit trail of both this tenant and the platform. It cannot be edited or
          removed afterwards.
        </p>

        {error && <div className="callout callout--red" style={{ marginBottom: 14 }}>{error}</div>}

        <div className="modal__actions">
          <button type="submit" className="btn btn--danger" disabled={!ready || busy}>
            {busy ? 'Suspending…' : `Suspend ${tenant.name}`}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/** The invite link is shown once. With SMTP off it is the only way in. */
function IssuedInvite({ issued, onDismiss }) {
  const notSent = issued.delivery !== 'sent';
  return (
    <div className={`callout ${notSent ? 'callout--ochre' : 'callout--blue'}`} style={{ marginBottom: 16 }}>
      <strong>{issued.organization.name} created.</strong>{' '}
      {issued.delivery === 'sent'
        ? `An invitation has been emailed to ${issued.owner.email}.`
        : issued.delivery === 'disabled'
          ? 'Email is switched off, so nothing was sent. Pass this link to the administrator yourself:'
          : 'The invitation email failed. Pass this link on instead:'}
      {notSent && (
        <div className="console__link">
          <code>{issued.inviteUrl}</code>
          <button
            type="button"
            className="linkbtn"
            onClick={() => navigator.clipboard?.writeText(issued.inviteUrl)}
          >
            Copy
          </button>
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <button type="button" className="linkbtn" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

function ProvisionDialog({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    ownerName: '',
    ownerEmail: '',
    domains: '',
    seatLimit: '',
    plan: 'standard',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const ready = form.name.trim() && form.ownerName.trim() && form.ownerEmail.includes('@');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.platform.provision({
        name: form.name.trim(),
        ownerName: form.ownerName.trim(),
        ownerEmail: form.ownerEmail.trim(),
        domains: form.domains
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean),
        plan: form.plan,
        seatLimit: form.seatLimit ? Number(form.seatLimit) : undefined,
      });
      onCreated(res);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Provision a tenant">
      <form className="modal__card" onSubmit={submit}>
        <h2 className="console__h1" style={{ fontSize: 19, marginBottom: 4 }}>
          Provision a tenant
        </h2>
        <p className="console__lede" style={{ marginBottom: 18 }}>
          Creates the organisation, seeds its roles, and invites its first administrator.
        </p>

        <label className="field">
          <span className="field__label">Company name</span>
          <input className="mfield" value={form.name} onChange={set('name')} autoFocus required />
        </label>

        <div className="modal__row">
          <label className="field">
            <span className="field__label">First administrator</span>
            <input className="mfield" value={form.ownerName} onChange={set('ownerName')} required />
          </label>
          <label className="field">
            <span className="field__label">Their work email</span>
            <input className="mfield" type="email" value={form.ownerEmail} onChange={set('ownerEmail')} required />
          </label>
        </div>

        <label className="field">
          <span className="field__label">Email domains</span>
          <input className="mfield" value={form.domains} onChange={set('domains')} placeholder="acme.com, acme.co.uk" />
          <span className="field__hint">
            Comma separated. Staff on these domains resolve to this tenant at sign-in. Public
            providers like gmail.com are refused.
          </span>
        </label>

        <div className="modal__row">
          <label className="field">
            <span className="field__label">Plan</span>
            <input className="mfield" value={form.plan} onChange={set('plan')} />
          </label>
          <label className="field">
            <span className="field__label">Seat limit</span>
            <input className="mfield" type="number" min="1" value={form.seatLimit} onChange={set('seatLimit')} placeholder="Unlimited" />
          </label>
        </div>

        {error && (
          <div className="callout callout--red" style={{ margin: '0 0 14px' }}>
            {error}
          </div>
        )}

        <div className="modal__actions">
          <button type="submit" className="btn btn--primary" disabled={!ready || busy}>
            {busy ? 'Creating…' : 'Create tenant'}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
