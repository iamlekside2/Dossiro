import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api.js';
import { btn, callout, chip } from '../ui.js';
import { M } from '../form.js';

/**
 * Support access to a tenancy (PLT-2), from the operator's side.
 *
 * The screen is built around the thing that makes the promise credible rather
 * than around the request: what the tenant can see. Every panel here has a
 * counterpart the customer reads, and the copy says so — not as reassurance,
 * but because an operator who forgets it is the risk this feature exists to
 * manage.
 */

const SCOPES = [
  [
    'METADATA',
    'Metadata only',
    'Names, sizes and folder structure. No content of any kind.',
    false,
  ],
  [
    'CONFIGURATION',
    'Configuration',
    'Document types, roles, retention rules and integrations.',
    false,
  ],
  [
    'DOCUMENTS',
    'Documents',
    'The records themselves. Needs a named person in the tenancy to approve it.',
    true,
  ],
];

const STATE_CHIP = {
  ACTIVE: 'green',
  REQUESTED: 'ochre',
  REFUSED: 'red',
  REVOKED: '',
  EXPIRED: '',
};

const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export default function SupportAccess({ tenant, onClose }) {
  const [sessions, setSessions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [asking, setAsking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.support.sessions(tenant.id);
      setSessions(res.items);
    } catch (err) {
      setError(err.body?.message ?? err.message);
    }
  }, [tenant.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(id) {
    setBusy(true);
    try {
      await api.support.revoke(id, 'Finished.');
      await load();
    } catch (err) {
      setError(err.body?.message ?? err.message);
    } finally {
      setBusy(false);
    }
  }

  const active = sessions.filter((s) => s.state === 'ACTIVE');
  const past = sessions.filter((s) => s.state !== 'ACTIVE');

  return (
    <div className={M.backdrop} role="dialog" aria-modal="true" aria-label={`Support access to ${tenant.name}`}>
      <div className={`${M.card} max-w-[720px]`}>
        <h2 className={M.title}>Support access to {tenant.name}</h2>
        <p className={M.lede}>
          You cannot read this customer&rsquo;s records. This is the only route by which that
          changes, and everything you do through it appears in their own audit trail — not just
          ours — where their records manager can end it without asking us.
        </p>

        {error && <div className={callout('red')}>{error}</div>}

        {active.length > 0 && (
          <section className="mb-5">
            <Label>Open now</Label>
            {active.map((s) => (
              <div key={s.id} className="border border-line bg-surface-2 p-3.5">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className={chip(STATE_CHIP[s.state])}>{s.scope.toLowerCase()}</span>
                  {s.breakGlass ? <span className={chip('red')}>break-glass</span> : null}
                  <span className="text-detail text-dim">expires {when(s.expiresAt)}</span>
                  <button
                    type="button"
                    className={`${btn()} ml-auto`}
                    disabled={busy}
                    onClick={() => revoke(s.id)}
                  >
                    End it now
                  </button>
                </div>
                <p className="text-detail leading-[1.55] text-muted">{s.reason}</p>
                {Number(s.viewCount) > 0 && (
                  <p className="mt-1.5 text-chip text-dim">
                    {s.viewCount} record{Number(s.viewCount) === 1 ? '' : 's'} opened. They see the
                    same list, named.
                  </p>
                )}
              </div>
            ))}
          </section>
        )}

        {asking ? (
          <RequestForm
            tenant={tenant}
            onCancel={() => setAsking(false)}
            onDone={async () => {
              setAsking(false);
              await load();
            }}
          />
        ) : (
          <button type="button" className={btn('primary')} onClick={() => setAsking(true)}>
            Request access
          </button>
        )}

        {past.length > 0 && (
          <section className="mt-6">
            <Label>Earlier</Label>
            <div className="border border-line">
              {past.slice(0, 8).map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-baseline gap-2 border-b border-line-faint px-3 py-2 text-detail last:border-b-0"
                >
                  <span className={chip(STATE_CHIP[s.state])}>{s.state.toLowerCase()}</span>
                  <span className="font-medium">{s.scope.toLowerCase()}</span>
                  <span className="min-w-0 flex-1 truncate text-dim">{s.reason}</span>
                  <span className="text-chip text-faint">{when(s.requestedAt)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className={M.actions}>
          <button type="button" className={btn()} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function RequestForm({ tenant, onCancel, onDone }) {
  const [scope, setScope] = useState('METADATA');
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState('4');
  const [breakGlass, setBreakGlass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const needsApproval = scope === 'DOCUMENTS' && !breakGlass;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.support.request({
        organizationId: tenant.id,
        scope,
        reason: reason.trim(),
        hours: Number(hours),
        breakGlass,
      });
      await onDone();
    } catch (err) {
      setError(err.body?.message ?? err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="border border-line bg-surface-2 p-4">
      <Label>What do you need to see</Label>
      <div className="mb-4">
        {SCOPES.map(([id, name, note, heavy]) => (
          <label key={id} className="flex cursor-pointer items-start gap-2.5 py-1.5">
            <input
              type="radio"
              name="scope"
              checked={scope === id}
              onChange={() => setScope(id)}
              className="mt-[3px] h-4 w-4 flex-none accent-blue"
            />
            <span>
              <span className="block text-[13.5px] font-medium">
                {name}
                {heavy ? <span className={`${chip('ochre')} ml-2`}>approval needed</span> : null}
              </span>
              <span className="block text-chip leading-[1.45] text-dim">{note}</span>
            </span>
          </label>
        ))}
      </div>

      <label className="mb-3.5 block">
        <span className={M.fieldLabel}>
          Why — {tenant.name} reads this exactly as you write it
        </span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Investigating the slow search they reported on Tuesday."
          className={`${M.input} h-auto py-2`}
        />
        <span className={M.fieldHint}>
          A ticket number is not a reason. At least ten characters.
        </span>
      </label>

      <label className="mb-3.5 block">
        <span className={M.fieldLabel}>For how long</span>
        <select
          value={breakGlass ? '0.5' : hours}
          disabled={breakGlass}
          onChange={(e) => setHours(e.target.value)}
          className={M.input}
        >
          <option value="1">One hour</option>
          <option value="4">Four hours</option>
          <option value="8">Eight hours</option>
          <option value="24">One day</option>
          {breakGlass && <option value="0.5">Thirty minutes</option>}
        </select>
      </label>

      <label className="mb-1 flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={breakGlass}
          onChange={(e) => setBreakGlass(e.target.checked)}
          className="mt-[3px] h-4 w-4 flex-none accent-blue"
        />
        <span>
          <span className="block text-[13.5px] font-medium">
            Break-glass — confirmed platform outage
          </span>
          <span className="block text-chip leading-[1.45] text-dim">
            Starts without an approver. Capped at thirty minutes, pages the security lead, and is
            reviewed within one business day.
          </span>
        </span>
      </label>

      {breakGlass ? (
        <div className={`${callout('red')} mt-3`}>
          Only for an outage the customer is already living through. Taking this route when
          somebody could have approved it is the thing the review is looking for.
        </div>
      ) : needsApproval ? (
        <div className={`${callout('ochre')} mt-3`}>
          A named person at {tenant.name} has to approve this before you can open anything. They
          see your reason, and can end it at any point.
        </div>
      ) : (
        <div className={`${callout()} mt-3`}>
          Starts immediately, and appears in their audit trail as it does. No content is reachable
          at this scope.
        </div>
      )}

      {error && <div className={`${callout('red')} mt-3`}>{error}</div>}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          className={btn('primary')}
          disabled={busy || reason.trim().length < 10}
        >
          {busy ? 'Asking…' : needsApproval ? 'Request approval from the tenant' : 'Start'}
        </button>
        <button type="button" className={btn()} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const Label = ({ children }) => (
  <div className="mb-2 text-label font-bold uppercase tracking-[0.07em] text-soft">{children}</div>
);
