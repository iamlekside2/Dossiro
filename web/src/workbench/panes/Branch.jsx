import { useEffect, useState } from 'react';
import api from '../../lib/api.js';
import { ins } from './ins.js';
import { btn, callout, chip } from '../../ui.js';
import { M } from '../../form.js';

/**
 * Inspector bodies for a branch.
 *
 * Every action here reloads the list on success, because a rename or a closure
 * that leaves the row showing stale text makes the user doubt whether it
 * worked and do it twice.
 */

function useAction(onChanged) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  async function run(fn, message) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await fn();
      setDone(message ?? 'Saved');
      onChanged?.();
    } catch (err) {
      setError(err.body?.message ?? err.message);
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, done, run, setError };
}

function Feedback({ error, done }) {
  if (error) {
    return (
      <div className={callout('red')} style={{ marginTop: 12 }}>
        {error}
      </div>
    );
  }
  if (done) {
    return (
      <div className={callout()} style={{ marginTop: 12 }}>
        {done}
      </div>
    );
  }
  return null;
}

/* -- Branch detail --------------------------------------------------------- */

export function BranchPane({ record, onChanged }) {
  const branch = record?.record;
  const [form, setForm] = useState(null);
  const [branches, setBranches] = useState([]);
  const { busy, error, done, run } = useAction(onChanged);

  useEffect(() => {
    if (!branch) return;
    setForm({
      name: branch.name,
      code: branch.code ?? '',
      address: branch.address ?? '',
      phone: branch.phone ?? '',
      parentId: branch.parent?.id ?? '',
      isHeadOffice: branch.isHeadOffice,
    });
  }, [branch]);

  useEffect(() => {
    api.branches.list().then((r) => setBranches(r.items)).catch(() => undefined);
  }, []);

  if (!branch || !form) {
    return <div className={ins.pane}>Select a branch.</div>;
  }

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <div>
      <div className={ins.section}>
        <div className={ins.label}>Branch</div>

        <label className={M.field}>
          <span className={M.fieldLabel}>Name</span>
          <input className={M.input} value={form.name} onChange={set('name')} />
        </label>

        <label className={M.field}>
          <span className={M.fieldLabel}>Code</span>
          <input className={M.input} value={form.code} onChange={set('code')} placeholder="LAG" />
          <span className={M.fieldHint}>Short code used in reports and document references.</span>
        </label>

        <label className={M.field}>
          <span className={M.fieldLabel}>Reports to</span>
          <select className={M.input} value={form.parentId} onChange={set('parentId')}>
            <option value="">Nothing — this is a top-level branch</option>
            {branches
              // A branch cannot report to itself; the API also refuses cycles.
              .filter((b) => b.id !== branch.id)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </label>

        <label className={M.field}>
          <span className={M.fieldLabel}>Address</span>
          <input className={M.input} value={form.address} onChange={set('address')} />
        </label>

        <label className={M.field}>
          <span className={M.fieldLabel}>Phone</span>
          <input className={M.input} value={form.phone} onChange={set('phone')} />
        </label>

        <label style={{ display: 'flex', gap: 9, alignItems: 'center', margin: '12px 0 0', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.isHeadOffice} onChange={set('isHeadOffice')} />
          <span style={{ fontSize: 13 }}>This is the head office</span>
        </label>
        <div className={ins.note}>
          Only one branch can be the head office. Setting this clears it elsewhere.
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
            type="button"
            className={btn('primary')}
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  api.branches.update(branch.id, {
                    name: form.name,
                    code: form.code || null,
                    address: form.address,
                    phone: form.phone,
                    parentId: form.parentId || null,
                    isHeadOffice: form.isHeadOffice,
                  }),
                'Branch updated',
              )
            }
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>

        <Feedback error={error} done={done} />
      </div>

      <div className={ins.section}>
        <div className={ins.label}>At this branch</div>
        <div className={ins.kvrow}>
          <span className={ins.k}>People posted</span>
          <span style={{ fontSize: 14 }}>{branch.people}</span>
        </div>
        <div className={ins.kvrow}>
          <span className={ins.k}>Cabinets</span>
          <span style={{ fontSize: 14 }}>{branch.cabinets}</span>
        </div>
        <div className={ins.kvrow}>
          <span className={ins.k}>Branches below</span>
          <span style={{ fontSize: 14 }}>{branch.children}</span>
        </div>
        <div className={ins.kvrow}>
          <span className={ins.k}>Timezone</span>
          <span style={{ fontSize: 14 }}>{branch.timezone}</span>
        </div>
      </div>

      <div className={ins.section}>
        <div className={ins.label}>Close this branch</div>
        <div className={callout('ochre')}>
          Closing unposts its {branch.people === 1 ? 'one person' : `${branch.people} people`} and
          releases {branch.cabinets === 1 ? 'its cabinet' : `its ${branch.cabinets} cabinets`}.
          Nobody is deleted and no record is lost — they simply stop belonging to an office.
          {branch.children > 0 && ' Move the branches below it first.'}
        </div>
        <button
          type="button"
          className={btn('danger')}
          style={{ marginTop: 12 }}
          disabled={busy || branch.children > 0}
          onClick={() => run(() => api.branches.close(branch.id), 'Branch closed')}
        >
          Close {branch.name}
        </button>
      </div>
    </div>
  );
}

/* -- Who is posted here ---------------------------------------------------- */

export function BranchStaffPane({ record, onChanged }) {
  const branch = record?.record;
  const [people, setPeople] = useState(null);
  const { busy, error, done, run } = useAction(() => {
    load();
    onChanged?.();
  });

  async function load() {
    try {
      const res = await api.users.list({ take: 200 });
      setPeople(res.items);
    } catch {
      setPeople([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (!branch) return <div className={ins.pane}>Select a branch.</div>;
  if (people === null) return <div className={ins.pane}>Loading…</div>;

  const here = people.filter((p) => p.branch?.id === branch.id);
  const elsewhere = people.filter((p) => p.branch?.id !== branch.id);

  return (
    <div>
      <div className={ins.section}>
        <div className={ins.label}>
          Posted to {branch.name} · {here.length}
        </div>
        {here.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Nobody is posted here yet.</div>
        )}
        {here.map((p) => (
          <div
            key={p.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              padding: '8px 0',
              borderBottom: '1px solid var(--border-faint)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13 }}>{p.displayName}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{p.email}</div>
            </div>
            <button
              type="button"
              className={M.linkbtn}
              disabled={busy}
              onClick={() => run(() => api.branches.assign(p.id, null), `${p.displayName} unposted`)}
            >
              Unpost
            </button>
          </div>
        ))}
        <Feedback error={error} done={done} />
      </div>

      <div className={ins.section}>
        <div className={ins.label}>Post someone here</div>
        {elsewhere.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Everyone is already posted here.</div>
        ) : (
          elsewhere.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                padding: '8px 0',
                borderBottom: '1px solid var(--border-faint)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>{p.displayName}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
                  {p.branch?.name ? `Currently at ${p.branch.name}` : 'Not posted anywhere'}
                </div>
              </div>
              <button
                type="button"
                className={M.linkbtn}
                disabled={busy}
                onClick={() =>
                  run(() => api.branches.assign(p.id, branch.id), `${p.displayName} posted to ${branch.name}`)
                }
              >
                Post here
              </button>
            </div>
          ))
        )}
        <div className={ins.note}>
          Somebody is posted to one branch at a time. Posting here removes their previous posting.
        </div>
      </div>
    </div>
  );
}

/* -- Web address ----------------------------------------------------------- */

export function HostnamePane({ record, onChanged }) {
  const host = record?.record;
  const { busy, error, done, run } = useAction(onChanged);

  if (!host) return <div className={ins.pane}>Select a web address.</div>;

  return (
    <div>
      <div className={ins.section}>
        <div className={ins.label}>Web address</div>
        <div style={{ fontSize: 15, fontWeight: 600, wordBreak: 'break-all' }}>{host.hostname}</div>

        <div style={{ display: 'flex', gap: 8, margin: '10px 0 0' }}>
          <span className={chip(host.verifiedAt ? 'green' : 'ochre')}>
            {host.verifiedAt ? 'Verified' : 'Unverified'}
          </span>
          {host.isPrimary && <span className={chip('blue')}>Primary</span>}
        </div>

        {!host.verifiedAt && (
          <>
            <div className={callout('ochre')} style={{ marginTop: 12 }}>
              This address does not resolve yet. Because a hostname selects a tenant before anyone
              has signed in, it must be proven before it works.
            </div>

            <div className={ins.label} style={{ marginTop: 14 }}>
              Prove ownership
            </div>
            <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-muted)' }}>
              Add a DNS TXT record on <strong>{host.hostname}</strong> with this value, then point
              the address at this deployment:
            </p>
            <div className={M.link}>
              <code>{host.verifyToken}</code>
              <button
                type="button"
                className={M.linkbtn}
                onClick={() => navigator.clipboard?.writeText(host.verifyToken ?? '')}
              >
                Copy
              </button>
            </div>

            <button
              type="button"
              className={btn('primary')}
              style={{ marginTop: 12 }}
              disabled={busy}
              onClick={() => run(() => api.organization.verifyHostname(host.id), 'Address verified')}
            >
              {busy ? 'Checking…' : 'Verify'}
            </button>
          </>
        )}

        {host.verifiedAt && !host.isPrimary && (
          <>
            <div className={ins.note} style={{ marginTop: 12 }}>
              Making this primary changes the address used to build share links and invitation
              emails for this organisation.
            </div>
            <button
              type="button"
              className={btn()}
              style={{ marginTop: 10 }}
              disabled={busy}
              onClick={() => run(() => api.organization.makePrimary(host.id), 'Now the primary address')}
            >
              Make primary
            </button>
          </>
        )}

        {host.isPrimary && (
          <div className={callout()} style={{ marginTop: 12 }}>
            Share links and invitation emails for this organisation are built from this address.
          </div>
        )}

        <Feedback error={error} done={done} />
      </div>

      <div className={ins.section}>
        <div className={ins.label}>Remove</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-muted)' }}>
          {host.isPrimary
            ? 'Make another verified address primary first, so existing links keep resolving.'
            : 'Removing this address stops it reaching this organisation.'}
        </p>
        <button
          type="button"
          className={btn('danger')}
          disabled={busy}
          onClick={() => run(() => api.organization.removeHostname(host.id), 'Address removed')}
        >
          Remove {host.hostname}
        </button>
      </div>
    </div>
  );
}
