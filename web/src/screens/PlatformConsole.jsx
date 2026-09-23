import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api.js';
import SupportAccess from './SupportAccess.jsx';
import { useSession } from '../session/SessionContext.jsx';
import { chip } from '../ui.js';
import {
  Button, Callout, Field, Modal, ModalActions, ModalLede, ModalRow, ModalTitle, TextInput,
} from './parts.jsx';

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
  ACTIVE: 'green',
  TRIAL: 'blue',
  SUSPENDED: 'ochre',
  CLOSED: 'red',
};

export default function PlatformConsole() {
  const { user, signOut } = useSession();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState(null);
  const [suspending, setSuspending] = useState(null);
  /** Which tenant's support access is open, if any. */
  const [supporting, setSupporting] = useState(null);

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
    <div className="allow-scroll min-h-screen bg-surface-3">
      {/* Ink chrome, so this is never mistaken for a customer's own tenancy. */}
      <header className="flex h-[46px] items-center gap-2.5 bg-ink px-5 text-white">
        <span className="h-[14px] w-[14px] shrink-0 bg-blue-on-dark" aria-hidden="true" />
        <span className="text-row font-bold">Platform</span>
        <span className="text-detail text-ghost">Tenant administration</span>
        <span className="flex-1" />
        <span className="text-detail text-ghost">{user?.email}</span>
        <button
          type="button"
          onClick={signOut}
          className="h-[26px] cursor-pointer border border-[#4a4f57] bg-transparent px-2.5 text-detail font-semibold text-white hover:bg-ink-2"
        >
          Sign out
        </button>
      </header>

      <main className="mx-auto max-w-[1120px] px-5 pb-16 pt-8">
        <div className="mb-[22px] flex flex-wrap items-start justify-between gap-5">
          <div>
            <h1 className="mb-1 text-screen font-bold tracking-[-0.02em]">Tenants</h1>
            <p className="max-w-[62ch] text-row leading-[1.6] text-muted">
              Each client company is one organisation. There is no self-serve signup — a tenant
              exists because someone here created it.
            </p>
          </div>
          <Button tone="primary" onClick={() => setCreating(true)}>
            Provision a tenant
          </Button>
        </div>

        {error && <Callout tone="red" className="mb-4">{error}</Callout>}

        {issued && <IssuedInvite issued={issued} onDismiss={() => setIssued(null)} />}

        {loading ? (
          <p className="text-row text-dim">Loading tenants…</p>
        ) : (
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="w-full border-collapse text-ui">
              <thead>
                <tr>
                  <Th>Organisation</Th>
                  <Th>Status</Th>
                  <Th>Plan</Th>
                  <Th>Seats</Th>
                  <Th>Documents</Th>
                  <Th>Domains</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id} className="[&:last-child>td]:border-b-0">
                    <Td>
                      <div className="text-row font-semibold text-ink">{t.name}</div>
                      <Slug>{t.slug}</Slug>
                    </Td>
                    <Td>
                      <span className={chip(STATUS_CHIP[t.status])}>{t.status}</span>
                    </Td>
                    <Td>{t.plan}</Td>
                    <Td>
                      {t.seatsUsed}
                      {t.seatLimit ? ` / ${t.seatLimit}` : ' / ∞'}
                    </Td>
                    <Td>{t.documents}</Td>
                    <Td>
                      {t.domains.length
                        ? t.domains.map((d) => (
                            <div key={d.domain} className="flex items-center gap-1.5 whitespace-nowrap">
                              {d.domain}
                              {!d.verifiedAt && <span className={chip('ochre')}>unverified</span>}
                            </div>
                          ))
                        : '—'}
                    </Td>
                    <Td className="flex gap-2.5 whitespace-nowrap">
                      {/* The platform realm cannot be suspended — offering the
                          action would only ever produce a refusal. */}
                      {t.isPlatform ? (
                        <Slug>This console</Slug>
                      ) : t.status === 'SUSPENDED' || t.status === 'CLOSED' ? (
                        <LinkButton onClick={() => setStatus(t.id, 'ACTIVE')}>Reactivate</LinkButton>
                      ) : (
                        <>
                          {/* Only a trial has anywhere to be activated to.
                              Offering it on an already-active tenant is a
                              button that does nothing. */}
                          {t.status === 'TRIAL' && (
                            <LinkButton onClick={() => setStatus(t.id, 'ACTIVE')}>Activate</LinkButton>
                          )}
                          {/* Never fires straight from the button. This locks a
                              whole company out of its own records, and the
                              reason is written to a trail nobody can edit
                              afterwards — so it is asked for first. */}
                          {/* The only route to a customer's records, and it
                              is deliberately as visible as Suspend — hiding it
                              would not make it rarer, only less considered. */}
                          <LinkButton onClick={() => setSupporting(t)}>Support access</LinkButton>
                          <LinkButton danger onClick={() => setSuspending(t)}>
                            Suspend
                          </LinkButton>
                        </>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 max-w-[70ch] text-meta leading-[1.6] text-dim">
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

      {supporting && (
        <SupportAccess tenant={supporting} onClose={() => setSupporting(null)} />
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
    <Modal label={`Suspend ${tenant.name}`} onSubmit={submit}>
      <ModalTitle>Suspend {tenant.name}</ModalTitle>
      <ModalLede>
        Every session in the organisation is revoked immediately and nobody there can sign in
        again until you reactivate them. Their documents are untouched.
      </ModalLede>

      <Field label="Why">
        <TextInput
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Non-payment, 60 days overdue"
          maxLength={500}
          autoFocus
          required
        />
      </Field>
      {/* Pulled up against the field it explains, rather than reading as a
          separate paragraph about nothing in particular. */}
      <ModalLede className="-mt-1.5 mb-[18px]">
        Written to the audit trail of both this tenant and the platform. It cannot be edited or
        removed afterwards.
      </ModalLede>

      {error && <Callout tone="red" className="mb-[14px]">{error}</Callout>}

      <ModalActions>
        <Button type="submit" tone="danger" disabled={!ready || busy}>
          {busy ? 'Suspending…' : `Suspend ${tenant.name}`}
        </Button>
        <Button type="button" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </ModalActions>
    </Modal>
  );
}

/** The invite link is shown once. With SMTP off it is the only way in. */
function IssuedInvite({ issued, onDismiss }) {
  const notSent = issued.delivery !== 'sent';
  return (
    <Callout tone={notSent ? 'ochre' : 'blue'} className="mb-4">
      <strong>{issued.organization.name} created.</strong>{' '}
      {issued.delivery === 'sent'
        ? `An invitation has been emailed to ${issued.owner.email}.`
        : issued.delivery === 'disabled'
          ? 'Email is switched off, so nothing was sent. Pass this link to the administrator yourself:'
          : 'The invitation email failed. Pass this link on instead:'}
      {notSent && (
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <code className="break-all border border-line-strong bg-surface px-[7px] py-1 text-meta">
            {issued.inviteUrl}
          </code>
          <LinkButton onClick={() => navigator.clipboard?.writeText(issued.inviteUrl)}>
            Copy
          </LinkButton>
        </div>
      )}
      <div className="mt-2">
        <LinkButton onClick={onDismiss}>Dismiss</LinkButton>
      </div>
    </Callout>
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
    <Modal label="Provision a tenant" onSubmit={submit}>
      <ModalTitle>Provision a tenant</ModalTitle>
      <ModalLede>
        Creates the organisation, seeds its roles, and invites its first administrator.
      </ModalLede>

      <Field label="Company name">
        <TextInput value={form.name} onChange={set('name')} autoFocus required />
      </Field>

      <ModalRow>
        <Field label="First administrator">
          <TextInput value={form.ownerName} onChange={set('ownerName')} required />
        </Field>
        <Field label="Their work email">
          <TextInput type="email" value={form.ownerEmail} onChange={set('ownerEmail')} required />
        </Field>
      </ModalRow>

      <Field
        label="Email domains"
        hint="Comma separated. Staff on these domains resolve to this tenant at sign-in. Public providers like gmail.com are refused."
      >
        <TextInput value={form.domains} onChange={set('domains')} placeholder="acme.com, acme.co.uk" />
      </Field>

      <ModalRow>
        <Field label="Plan">
          <TextInput value={form.plan} onChange={set('plan')} />
        </Field>
        <Field label="Seat limit">
          <TextInput
            type="number"
            min="1"
            value={form.seatLimit}
            onChange={set('seatLimit')}
            placeholder="Unlimited"
          />
        </Field>
      </ModalRow>

      {error && <Callout tone="red" className="mb-[14px]">{error}</Callout>}

      <ModalActions>
        <Button type="submit" tone="primary" disabled={!ready || busy}>
          {busy ? 'Creating…' : 'Create tenant'}
        </Button>
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
      </ModalActions>
    </Modal>
  );
}

/* -- Console-local pieces --------------------------------------------------

   The table was styled by element through `.console th` / `.console td`
   descendant selectors. As components the styling travels with the cell
   rather than depending on an ancestor's class being present.
   -------------------------------------------------------------------------- */

const Th = ({ children }) => (
  <th className="whitespace-nowrap border-b border-line bg-surface-3 px-3 py-2 text-left text-label font-bold uppercase tracking-[0.07em] text-soft">
    {children}
  </th>
);

const Td = ({ className = '', children }) => (
  <td className={`border-b border-line-faint px-3 py-2.5 align-top text-ink-2 ${className}`}>
    {children}
  </td>
);

const Slug = ({ children }) => <div className="mt-px text-chip text-dim">{children}</div>;

/** Reads as a link but is a button, because it performs an action. */
function LinkButton({ danger, children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`cursor-pointer border-0 bg-transparent p-0 text-detail font-semibold hover:underline ${
        danger ? 'text-red' : 'text-blue'
      }`}
    >
      {children}
    </button>
  );
}
