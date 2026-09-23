import { useEffect, useState } from 'react';
import api from '../../lib/api.js';
import { btn, callout, chip } from '../../ui.js';

/**
 * The console's area bodies.
 *
 * Each is a plain table over data that exists. There is no inspector here on
 * purpose — the operator's questions are comparative ("which tenants are near
 * their seat limit", "who has looked inside anyone this month") rather than
 * about one row at a time, and a three-pane workbench would make every one of
 * them take two clicks instead of none.
 */

const naira = (n) =>
  n >= 1_000_000_000
    ? `₦${(n / 1_000_000_000).toFixed(1)}bn`
    : n >= 1_000_000
      ? `₦${(n / 1_000_000).toFixed(1)}m`
      : `₦${Number(n).toLocaleString('en-GB')}`;

const when = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

/* -- shared furniture ------------------------------------------------------ */

export function Table({ head, children }) {
  return (
    <div className="overflow-x-auto border border-line bg-surface">
      <table className="w-full min-w-[720px] border-collapse text-detail">
        <thead>
          <tr className="border-b border-line bg-surface-3 text-left">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold text-soft">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ children, className = '' }) => (
  <td className={`border-b border-line-faint px-3 py-2.5 align-top ${className}`}>{children}</td>
);

export const Note = ({ children }) => (
  <p className="mt-3 max-w-[78ch] text-meta leading-[1.6] text-dim">{children}</p>
);

function useLoad(fn, deps = []) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let off = false;
    setState({ loading: true });
    fn()
      .then((data) => !off && setState({ loading: false, data }))
      .catch((err) => !off && setState({ loading: false, error: err.body?.message ?? err.message }));
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

const Loading = () => <p className="text-detail text-dim">Loading…</p>;
const Failed = ({ error }) => <div className={callout('red')}>{error}</div>;

/* -- Deployment ------------------------------------------------------------- */

const REGION_NAME = {
  'ng-lagos-1': 'Lagos',
  'ng-abuja-1': 'Abuja',
};

export function DeploymentPanel({ tenants }) {
  const real = tenants.filter((t) => !t.isPlatform);
  const [licences, setLicences] = useState({});

  // One request per tenant. Fine at this scale and honest about what it is:
  // each answer is that deployment's own view of its licence, not a summary we
  // computed centrally from data the deployment never sees.
  useEffect(() => {
    let off = false;
    Promise.all(
      real.map((t) =>
        api.platform
          .license(t.id)
          .then((l) => [t.id, l])
          .catch(() => [t.id, null]),
      ),
    ).then((pairs) => !off && setLicences(Object.fromEntries(pairs)));
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenants.length]);

  const byRegion = real.reduce((acc, t) => {
    const key = t.region ?? 'unset';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <Table head={['Tenant', 'Region', 'Licence', 'Seats', 'Writes', 'Expires']}>
        {real.map((t) => {
          const l = licences[t.id];
          return (
            <tr key={t.id}>
              <Td className="font-medium">{t.name}</Td>
              <Td>{REGION_NAME[t.region] ?? t.region ?? '—'}</Td>
              <Td>
                {!l ? (
                  <span className="text-dim">…</span>
                ) : (
                  <span className={chip(l.state === 'active' ? 'green' : l.state === 'unlicensed' ? 'ochre' : 'red')}>
                    {l.state}
                  </span>
                )}
              </Td>
              <Td>
                {l ? `${l.seatsUsed} / ${l.seatsAllowed ?? '∞'}` : '—'}
              </Td>
              <Td>
                {l ? (
                  l.writable ? (
                    <span className="text-green">Allowed</span>
                  ) : (
                    <span className="text-red">Refused</span>
                  )
                ) : (
                  '—'
                )}
              </Td>
              <Td>{l?.expiresAt ? when(l.expiresAt) : 'No expiry'}</Td>
            </tr>
          );
        })}
      </Table>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="border border-line bg-surface p-3.5">
          <div className="mb-2 text-label font-bold uppercase tracking-[0.07em] text-soft">
            Where records live
          </div>
          {Object.entries(byRegion).map(([region, n]) => (
            <div key={region} className="flex justify-between py-1 text-detail">
              <span>{REGION_NAME[region] ?? region}</span>
              <span className="text-dim">
                {n} {n === 1 ? 'tenancy' : 'tenancies'}
              </span>
            </div>
          ))}
          <Note>Fixed at the first record. No operator action moves a tenancy between regions.</Note>
        </div>

        <div className={callout('red')}>
          <strong>There is no remote access path.</strong>
          <p className="mt-1.5">
            A self-hosted deployment is diagnosed by the customer exporting a bundle, us reading it
            in a sandbox, and them applying a signed patch. Nothing on this screen reaches their
            server, and there is no back door to fall back on.
          </p>
        </div>
      </div>

      <Note>
        Seat counts here are read from each deployment’s signed licence, not from its seat column —
        which is why raising the number in the database changes nothing the deployment enforces
        (PLT-5). An air-gapped installation verifies the same signature with no network at all
        (PLT-4).
      </Note>
    </>
  );
}

/* -- Billing ---------------------------------------------------------------- */

/** Annual value per seat, in naira. The only figure here that is a decision. */
const PER_SEAT = 48_000;

export function BillingPanel({ tenants }) {
  const real = tenants.filter((t) => !t.isPlatform);
  const seats = real.reduce((n, t) => n + (t.seatsUsed ?? 0), 0);
  const licensed = real.reduce((n, t) => n + (t.seatLimit ?? 0), 0);

  return (
    <>
      <Table head={['Tenant', 'Plan', 'Seats used', 'Seat limit', 'Documents', 'Annual value']}>
        {real.map((t) => (
          <tr key={t.id}>
            <Td className="font-medium">{t.name}</Td>
            <Td>{t.plan}</Td>
            <Td>{t.seatsUsed}</Td>
            <Td>{t.seatLimit ?? '∞'}</Td>
            <Td>{Number(t.documents).toLocaleString('en-GB')}</Td>
            <Td>{naira((t.seatLimit ?? t.seatsUsed) * PER_SEAT)}</Td>
          </tr>
        ))}
        <tr className="bg-surface-3 font-semibold">
          <Td>Across the platform</Td>
          <Td>—</Td>
          <Td>{seats}</Td>
          <Td>{licensed}</Td>
          <Td>{real.reduce((n, t) => n + Number(t.documents ?? 0), 0).toLocaleString('en-GB')}</Td>
          <Td>{naira(licensed * PER_SEAT)}</Td>
        </tr>
      </Table>

      <div className={`${callout()} mt-4`}>
        <strong>External recipients never consume a seat.</strong>
        <p className="mt-1.5">
          A customer sharing with a thousand counterparties pays nothing further (PLT-8). Seats
          count people who sign in, not people who read.
        </p>
      </div>

      <Note>
        Reserved and pooled seats are not built. The schema holds one seat limit per tenant, so
        every figure above is a limit rather than a pool with a high-water mark — the distinction
        PLT-6 and PLT-7 turn on is a pricing decision still open, and inventing the numbers here
        would be inventing the decision.
      </Note>
    </>
  );
}

/* -- Support ---------------------------------------------------------------- */

export function SupportPanel({ tenants }) {
  const real = tenants.filter((t) => !t.isPlatform);
  const state = useLoad(
    () =>
      Promise.all(
        real.map((t) =>
          api.support
            .sessions(t.id)
            .then((r) => r.items.map((s) => ({ ...s, tenantName: t.name })))
            .catch(() => []),
        ),
      ).then((lists) => lists.flat()),
    [tenants.length],
  );

  if (state.loading) return <Loading />;
  if (state.error) return <Failed error={state.error} />;

  const all = (state.data ?? []).sort(
    (a, b) => new Date(b.requestedAt) - new Date(a.requestedAt),
  );
  const open = all.filter((s) => s.state === 'ACTIVE');

  return (
    <>
      {open.length > 0 && (
        <div className={`${callout('ochre')} mb-4`}>
          <strong>
            {open.length} tenancy{open.length === 1 ? '' : 'ies'} open to support right now.
          </strong>
          <p className="mt-1.5">
            Each of those customers can see this and end it without asking us.
          </p>
        </div>
      )}

      {all.length === 0 ? (
        <p className="text-detail text-dim">
          Nobody has asked to look inside a tenancy. That is the expected state.
        </p>
      ) : (
        <Table head={['Tenant', 'State', 'Scope', 'Why', 'Operator', 'Asked']}>
          {all.slice(0, 50).map((s) => (
            <tr key={s.id}>
              <Td className="font-medium">{s.tenantName}</Td>
              <Td>
                <span
                  className={chip(
                    s.state === 'ACTIVE' ? 'green' : s.state === 'REQUESTED' ? 'ochre' : s.state === 'REFUSED' ? 'red' : '',
                  )}
                >
                  {s.state.toLowerCase()}
                </span>
              </Td>
              <Td>
                {s.scope.toLowerCase()}
                {s.breakGlass ? <span className={`${chip('red')} ml-1.5`}>break-glass</span> : null}
              </Td>
              <Td className="max-w-[300px]">{s.reason}</Td>
              <Td>{s.operatorName}</Td>
              <Td>{when(s.requestedAt)}</Td>
            </tr>
          ))}
        </Table>
      )}

      <Note>
        This is the same list each customer reads in their own administration, and every line is in
        their audit trail as well as ours. A record of who looked inside a tenancy would be worth
        nothing if the only copy belonged to the people who looked.
      </Note>
    </>
  );
}

/* -- Operators --------------------------------------------------------------- */

/** What nobody on this side can do. Enforced in the platform, not here. */
const RULES = [
  ['Read a tenant’s documents unasked', 'Only through a support session the tenant can see and end.'],
  ['Alter a tenant’s audit trail', 'The database refuses modification and deletion outright.'],
  ['Move records between regions', 'Residency is fixed at the first record. No operator action changes it.'],
  ['Delete anything under legal hold', 'A hold outranks retention, an administrator, and us.'],
  ['Act without leaving an entry', 'Every consequential action is recorded, including refusals.'],
];

export function OperatorsPanel() {
  const state = useLoad(() => api.platform.operators(), []);

  if (state.loading) return <Loading />;
  if (state.error) return <Failed error={state.error} />;

  const items = state.data?.items ?? [];

  return (
    <>
      <Table head={['Operator', 'Email', 'Tier', 'Two-factor', 'Roles', 'Last signed in']}>
        {items.map((o) => (
          <tr key={o.id}>
            <Td className="font-medium">{o.displayName}</Td>
            <Td>{o.email}</Td>
            <Td>{String(o.tier).replace(/_/g, ' ').toLowerCase()}</Td>
            <Td>
              {o.mfaEnabled ? (
                <span className={chip('green')}>on</span>
              ) : (
                <span className={chip('ochre')}>off</span>
              )}
            </Td>
            <Td>{(o.roles ?? []).join(', ') || '—'}</Td>
            <Td>{when(o.lastLoginAt)}</Td>
          </tr>
        ))}
      </Table>

      <div className="mt-5">
        <div className="mb-2 text-label font-bold uppercase tracking-[0.07em] text-soft">
          What none of us can do
        </div>
        <div className="border border-line bg-surface">
          {RULES.map(([rule, how]) => (
            <div key={rule} className="border-b border-line-faint px-3.5 py-2.5 last:border-b-0">
              <div className="text-[13.5px] font-medium">{rule}</div>
              <div className="text-chip leading-[1.5] text-dim">{how}</div>
            </div>
          ))}
        </div>
        <div className={`${callout()} mt-3`}>
          These are enforced in the platform, not in this interface. Removing the buttons would not
          remove the capability — the capability was never granted.
        </div>
      </div>
    </>
  );
}

/* -- Not built --------------------------------------------------------------- */

export function UnbuiltPanel({ area }) {
  return (
    <div className="max-w-[70ch]">
      <div className={callout('ochre')}>
        <strong>Not built.</strong>
        <p className="mt-1.5">{area.note}</p>
      </div>
      <div className="mt-4">
        <div className="mb-1.5 text-label font-bold uppercase tracking-[0.07em] text-soft">
          What it would take
        </div>
        <p className="text-detail leading-[1.6] text-muted">{area.needs}</p>
      </div>
    </div>
  );
}

export { btn };
