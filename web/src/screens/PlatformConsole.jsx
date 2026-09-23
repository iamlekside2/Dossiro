import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api.js';
import SupportAccess from './SupportAccess.jsx';
import { CONSOLE_AREAS, REAL, areaById } from './console/areas.js';
import {
  BillingPanel,
  DeploymentPanel,
  OperatorsPanel,
  SupportPanel,
  UnbuiltPanel,
} from './console/panels.jsx';
import { ConsoleInspector } from './console/Inspector.jsx';
import {
  BILLING_PANES,
  DEPLOYMENT_PANES,
  OPERATOR_PANES,
  TENANT_PANES,
  billingPane,
  deploymentPane,
  operatorPane,
  tenantPane,
} from './console/panes.js';

const REGION_LABEL = { 'ng-lagos-1': 'Lagos', 'ng-abuja-1': 'Abuja' };

const EMPTY_HINT = {
  tenants: 'Choose a tenant to see its plan, what it is using, and whether anyone here has looked inside it.',
  deployment: 'Choose a tenant to see the licence its own deployment enforces.',
  billing: 'Choose a tenant to see its seats.',
  operators: 'Choose somebody, or open Rules to see what none of us can do.',
};

/** Which panes an area offers. */
function panesFor(areaId) {
  if (areaId === 'deployment') return DEPLOYMENT_PANES;
  if (areaId === 'billing') return BILLING_PANES;
  if (areaId === 'operators') return OPERATOR_PANES;
  return TENANT_PANES;
}
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
  const [areaId, setAreaId] = useState('tenants');
  const area = areaById(areaId);

  /** Which row the inspector is describing, per area. */
  const [selected, setSelected] = useState({});
  const [pane, setPane] = useState({});

  const pick = (id) => setSelected((m) => ({ ...m, [areaId]: id }));
  const pickPane = (id) => setPane((m) => ({ ...m, [areaId]: id }));

  /**
   * Operators live here rather than inside their panel, because the inspector
   * has to describe whichever one is selected and a list the parent cannot see
   * is a list the parent cannot describe.
   */
  const [operators, setOperators] = useState([]);
  useEffect(() => {
    api.platform.operators().then((r) => setOperators(r.items)).catch(() => setOperators([]));
  }, []);
  const operatorRow = operators.find((o) => o.id === selected.operators) ?? null;

  /** Licences and sessions, fetched per tenant as one is selected. */
  const [detail, setDetail] = useState({});
  const chosenId = selected[areaId];
  const chosen = tenants.find((t) => t.id === chosenId) ?? null;

  useEffect(() => {
    if (!chosen || chosen.isPlatform) return undefined;
    let off = false;
    Promise.all([
      api.platform.license(chosen.id).catch(() => null),
      api.support.sessions(chosen.id).then((r) => r.items).catch(() => []),
    ]).then(([licence, sessions]) => {
      if (!off) setDetail({ licence, sessions });
    });
    return () => {
      off = true;
    };
  }, [chosen]);

  function inspectorSpec() {
    const activePane = pane[areaId] ?? panesFor(areaId)[0][0];

    if (areaId === 'operators') {
      // Rules describes nobody in particular, so it renders without a row.
      return operatorPane(activePane, operatorRow);
    }
    if (!chosen) return null;
    if (areaId === 'deployment') {
      return deploymentPane(activePane, chosen, {
        licence: detail.licence,
        regionCounts: tenants
          .filter((t) => !t.isPlatform)
          .reduce((acc, t) => ({ ...acc, [t.region ?? 'unset']: (acc[t.region ?? 'unset'] ?? 0) + 1 }), {}),
      });
    }
    if (areaId === 'billing') return billingPane(activePane, chosen);

    return tenantPane(activePane, chosen, {
      sessions: detail.sessions ?? [],
      onRequestAccess: () => setSupporting(chosen),
      onSuspend: () => setSuspending(chosen),
      onActivate: () => setStatus(chosen.id, 'ACTIVE'),
      onReactivate: () => setStatus(chosen.id, 'ACTIVE'),
    });
  }

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
      {/* Ochre above ink. The strip exists so that a screenshot of this console
          can never be mistaken for a customer's own tenancy — which matters
          most in the moment somebody is about to act on the wrong one. */}
      <div className="h-[3px] bg-ochre" aria-hidden="true" />
      <header className="flex h-[46px] items-center gap-2.5 bg-ink px-5 text-white">
        <img src="/brand/dossiro-white.svg" alt="Dossiro" className="h-[17px] w-auto shrink-0" />
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

      {/* Areas. An unbuilt one is still listed and still opens — saying what is
          missing is more use than hiding that it was ever meant to exist. */}
      <nav className="flex items-stretch overflow-x-auto border-b border-line bg-chrome" role="tablist">
        {CONSOLE_AREAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={a.id === areaId}
            onClick={() => setAreaId(a.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap border-0 border-r border-line px-[14px] py-2.5 text-ui ${
              a.id === areaId
                ? 'bg-surface font-semibold shadow-[inset_0_-2px_0_var(--color-blue)]'
                : 'bg-transparent hover:bg-line-soft'
            }`}
          >
            {a.label}
            {a.state !== REAL && (
              <span className="border border-ochre-border bg-ochre-bg px-1 py-px text-tag font-bold uppercase tracking-[0.04em] text-ochre">
                Not built
              </span>
            )}
          </button>
        ))}
      </nav>

      <main className="flex min-h-0 flex-1 items-stretch">
        <div className="min-w-0 flex-1 overflow-y-auto px-5 pb-16 pt-8">
        <div className="mb-[22px] flex flex-wrap items-start justify-between gap-5">
          <div>
            <h1 className="mb-1 text-screen font-bold tracking-[-0.02em]">{area.heading}</h1>
            <p className="max-w-[62ch] text-row leading-[1.6] text-muted">{area.note}</p>
          </div>
          {area.id === 'tenants' && (
            <Button tone="primary" onClick={() => setCreating(true)}>
              Provision a tenant
            </Button>
          )}
        </div>

        {error && <Callout tone="red" className="mb-4">{error}</Callout>}

        {issued && <IssuedInvite issued={issued} onDismiss={() => setIssued(null)} />}

        {area.state !== REAL ? (
          <UnbuiltPanel area={area} />
        ) : area.id === 'deployment' ? (
          <DeploymentPanel tenants={tenants} selectedId={selected.deployment} onSelect={pick} />
        ) : area.id === 'billing' ? (
          <BillingPanel tenants={tenants} selectedId={selected.billing} onSelect={pick} />
        ) : area.id === 'support' ? (
          <SupportPanel tenants={tenants} />
        ) : area.id === 'operators' ? (
          <OperatorsPanel
            items={operators}
            selectedId={selected.operators}
            onSelect={pick}
          />
        ) : loading ? (
          <p className="text-row text-dim">Loading tenants…</p>
        ) : (
          /* Rows select rather than carry their own buttons. The actions moved
             into Lifecycle and Support access, where the consequence of each
             is written beside it — a Suspend link in a table row says nothing
             about what suspending does. */
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="w-full border-collapse text-ui">
              <thead>
                <tr>
                  <Th>Organisation</Th>
                  <Th>Status</Th>
                  <Th>Plan</Th>
                  <Th>Seats</Th>
                  <Th>Documents</Th>
                  <Th>Region</Th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => pick(t.id)}
                    className={`cursor-pointer [&:last-child>td]:border-b-0 ${
                      selected[areaId] === t.id ? 'bg-blue-tint' : 'hover:bg-row-hover'
                    }`}
                  >
                    <Td>
                      <div className="text-row font-semibold text-ink">{t.name}</div>
                      <Slug>{t.isPlatform ? 'this console' : t.slug}</Slug>
                    </Td>
                    <Td>
                      <span className={chip(STATUS_CHIP[t.status])}>{t.status}</span>
                    </Td>
                    <Td>{t.plan}</Td>
                    <Td>
                      {t.seatsUsed}
                      {t.seatLimit ? ` / ${t.seatLimit}` : ' / ∞'}
                    </Td>
                    <Td>{Number(t.documents).toLocaleString('en-GB')}</Td>
                    <Td>{REGION_LABEL[t.region] ?? t.region ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

          {area.id === 'tenants' && (
            <p className="mt-4 max-w-[70ch] text-meta leading-[1.6] text-dim">
              Every organisation is one tenancy. There is no self-serve signup — a tenant exists
              because somebody here created it.
            </p>
          )}
        </div>

        {/* One renderer, many panes. Absent on an area with nothing to select
            and on an unbuilt one, where there is nothing to describe. */}
        {area.state === REAL && area.id !== 'support' && (
          <ConsoleInspector
            panes={panesFor(area.id)}
            active={pane[areaId] ?? panesFor(area.id)[0][0]}
            onSelect={pickPane}
            empty={EMPTY_HINT[area.id] ?? 'Choose a row.'}
            spec={inspectorSpec()}
          />
        )}
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
