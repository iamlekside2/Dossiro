import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LATER, RAIL, STARTER_CABINETS } from '../setup/plan.js';
import { useSession } from '../session/SessionContext.jsx';
import api from '../lib/api.js';

/**
 * First-run setup: what a tenant administrator completes before their people
 * arrive. A fresh tenancy has roles and nothing else — no cabinets, so nowhere
 * to file, and nobody but the owner.
 *
 * This screen used to be the design's illustration: ten steps whose checklist
 * lived in local state, seeded to look half-finished, with a verification date
 * nobody verified. Completing a step changed nothing. It is now three steps,
 * each real:
 *
 *   cabinets — creates the tenancy's top-level structure (real folders)
 *   roles    — reviews the roles provisioning seeded (real list)
 *   invite   — invites the first people (real invitations, seat-limited)
 *
 * The designed steps this screen no longer shows — domain verification, custom
 * address, single sign-on, branding, retention rules — are in the After-setup
 * list with an honest note each, rather than rendered with invented facts. The
 * deployment model is not asked either: it was decided when the tenancy was
 * provisioned, and a choice that cannot be changed should not look like one.
 */

const ORDER = ['cabinets', 'roles', 'invite'];

const TITLES = {
  cabinets: 'Build your cabinets',
  roles: 'Review your roles',
  invite: 'Invite your people',
};

const LEDE = {
  cabinets:
    'The top level of your repository. Everything your organisation files lives under one of '
    + 'these, and access is granted down from them — so their shape is the shape of who may see '
    + 'what.',
  roles:
    'Provisioning seeded these. A role is what somebody may do; a folder grant is what they may '
    + 'do it to. People can hold more than one.',
  invite:
    'Each person receives a single-use link to choose their own password. There is no self-serve '
    + 'signup — nobody joins a records system uninvited.',
};

export default function TenantSetup() {
  const { user, organization } = useSession();
  const navigate = useNavigate();

  const org = useMemo(
    () => ({
      name: organization?.name ?? user?.organizationName ?? 'Your organisation',
      domain:
        organization?.domains?.[0]?.domain
        ?? organization?.domain
        ?? (user?.email?.includes('@') ? user.email.split('@')[1] : '—'),
    }),
    [organization, user],
  );

  // The one piece of server truth the checklist hangs off. Cabinets are done
  // when the tenancy has roots — not when somebody clicked a button once.
  const [roots, setRoots] = useState(null);
  const loadTree = useCallback(async () => {
    try {
      setRoots(await api.folders.tree());
    } catch {
      setRoots([]);
    }
  }, []);
  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const [rolesAck, setRolesAck] = useState(false);
  const [invited, setInvited] = useState([]);

  const done = {
    cabinets: (roots?.length ?? 0) > 0,
    roles: rolesAck,
    invite: invited.some((i) => i.ok),
  };

  const [step, setStep] = useState('cabinets');
  const current = ORDER.includes(step) ? step : ORDER[0];
  const remaining = ORDER.filter((id) => !done[id]).length;

  // Nobody is invited into a tenancy with nowhere to file. The old gate also
  // demanded retention rules; that screen no longer exists here, so the gate
  // asks only for what this screen can actually deliver.
  const locked = !done.cabinets;

  const summary = {
    cabinets: done.cabinets
      ? `${roots.length} cabinet${roots.length === 1 ? '' : 's'} in place`
      : 'Nothing exists yet — records need somewhere to live',
    roles: done.roles ? 'Reviewed' : 'Seeded at provisioning, worth a look',
    invite: done.invite
      ? `${invited.filter((i) => i.ok).length} invited`
      : locked
        ? 'Held until there are cabinets'
        : 'Single-use links, one per person',
  };

  if (roots === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-3 text-detail text-dim">
        Loading your tenancy…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-stretch bg-surface-3 max-mid:flex-col mid:h-screen mid:overflow-hidden">
      {/* ---- checklist rail ---- */}
      <aside className="flex w-setuprail shrink-0 flex-col border-r border-line bg-surface-2 max-mid:w-full max-mid:border-r-0 max-mid:border-b mid:overflow-y-auto">
        <div className="flex items-center gap-[9px] border-b border-line-soft p-4">
          <span className="h-4 w-4 bg-blue" />
          <span className="text-body font-bold tracking-[-0.01em]">Dossiro</span>
        </div>

        <div className="border-b border-line-soft px-4 py-[14px]">
          <div className="text-row font-semibold">{org.name}</div>
          <div className="mt-0.5 text-meta text-dim">Setting up · {org.domain}</div>
        </div>

        <div className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3">
          <span className="whitespace-nowrap text-chip font-semibold text-muted">
            {ORDER.length - remaining} of {ORDER.length}
          </span>
          <span className="h-1 flex-1 bg-line-soft">
            <span
              className="block h-full bg-green"
              style={{ width: `${((ORDER.length - remaining) / ORDER.length) * 100}%` }}
            />
          </span>
        </div>

        <ol className="flex-1">
          {ORDER.map((id, i) => {
            const isDone = Boolean(done[id]);
            const isLocked = id === 'invite' && locked;
            const on = id === current;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setStep(id)}
                  className={`flex w-full cursor-pointer items-start gap-3 border-b border-line-faint px-4 py-[11px] text-left ${
                    on ? 'bg-blue-tint' : 'hover:bg-row-hover'
                  }`}
                >
                  <span
                    className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center font-bold ${
                      isDone
                        ? 'border border-green bg-green text-meta text-white'
                        : isLocked
                          ? 'border border-line-strong bg-neutral-bg text-[11px] text-ghost'
                          : on
                            ? 'border-2 border-blue bg-surface text-[11px] text-blue'
                            : 'border border-line-strong bg-surface text-[11px] text-dim'
                    }`}
                  >
                    {isDone ? '✓' : isLocked ? '·' : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-row ${on ? 'font-bold' : 'font-medium'}`}>
                      {TITLES[id]}
                    </span>
                    <span className="mt-0.5 block text-chip leading-[1.4] text-dim">
                      {summary[id]}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {remaining === 0 && (
          <div className="border-t border-line px-4 py-4">
            <PrimaryButton onClick={() => navigate('/')}>Open the repository</PrimaryButton>
          </div>
        )}

        <div className="border-t border-line px-4 pb-5 pt-[14px]">
          <div className="mb-[9px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
            After setup
          </div>
          {LATER.map(([title, note]) => (
            <div className="mb-[9px]" key={title}>
              <div className="text-detail font-semibold text-muted">{title}</div>
              <div className="text-chip leading-[1.4] text-dim">{note}</div>
            </div>
          ))}
        </div>
      </aside>

      {/* ---- main panel ---- */}
      <main className="min-w-0 flex-1 overflow-y-auto px-8 pb-14 pt-7 max-mid:px-[18px] max-mid:pb-12 max-mid:pt-5">
        {locked && current === 'invite' ? (
          <div className="mb-[22px] max-w-[720px] border border-ochre-border bg-ochre-bg px-[14px] py-3">
            <div className="mb-[3px] text-row font-bold text-ochre">
              Your people cannot be invited yet
            </div>
            <div className="text-detail leading-[1.55] text-ochre">
              Build the cabinets first, so nobody arrives before there is somewhere correct to put
              what they bring.
            </div>
          </div>
        ) : null}

        <section className="max-w-[720px]">
          <Eyebrow>
            Step {ORDER.indexOf(current) + 1} of {ORDER.length}
            {done[current] ? ' · done' : ''}
          </Eyebrow>
          <Title>{TITLES[current]}</Title>
          <Lede>{LEDE[current]}</Lede>

          {current === 'cabinets' && <CabinetsBody roots={roots} onChanged={loadTree} />}
          {current === 'roles' && (
            <RolesBody acked={rolesAck} onAck={() => setRolesAck(true)} />
          )}
          {current === 'invite' && !locked && (
            <InviteBody invited={invited} onInvited={(rows) => setInvited((v) => [...v, ...rows])} />
          )}
        </section>
      </main>

      {/* ---- explanation rail ---- */}
      <aside className="w-whyrail shrink-0 border-l border-line bg-surface-2 px-6 py-7 max-wide:hidden mid:overflow-y-auto">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">
          Worth knowing
        </div>
        {(RAIL[current] ?? []).map(([title, text]) => (
          <div className="border-b border-line-soft py-[14px]" key={title}>
            <div className="text-ui font-semibold">{title}</div>
            <div className="text-detail leading-[1.6] text-muted">{text}</div>
          </div>
        ))}
        <p className="mt-[18px] text-meta leading-[1.55] text-dim">
          Setup takes minutes, not sessions. You can hand it to a colleague at any point, and every
          change is logged against whoever made it.
        </p>
      </aside>
    </div>
  );
}

/* ---- step bodies ---------------------------------------------------------- */

function CabinetsBody({ roots, onChanged }) {
  // The proposals, each on by default. Unticking is cheaper than deleting.
  const [picked, setPicked] = useState(() => new Set(STARTER_CABINETS.map(([n]) => n)));
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);

  if (roots.length > 0) {
    return (
      <Facts
        rows={roots.map((r) => [r.name, `${r.children?.length ?? 0} folder${(r.children?.length ?? 0) === 1 ? '' : 's'} inside`])}
        note="These are your cabinets. Add more from the Repository whenever — moving one later moves its records and their permissions together, and the move is logged."
      />
    );
  }

  async function create() {
    setBusy(true);
    setErrors([]);
    const names = [
      ...STARTER_CABINETS.filter(([n]) => picked.has(n)).map(([n]) => n),
      ...extra.split(',').map((s) => s.trim()).filter(Boolean),
    ];
    const failed = [];
    // Sequential, not parallel: cabinet order is display order, and a race
    // would shuffle it on every setup.
    for (const name of names) {
      try {
        await api.folders.create({ name });
      } catch (err) {
        failed.push(`${name}: ${err.body?.message ?? err.message}`);
      }
    }
    setErrors(failed);
    setBusy(false);
    await onChanged();
  }

  return (
    <>
      <div className="border border-line bg-surface">
        <PanelHead>Proposed for a first repository</PanelHead>
        {STARTER_CABINETS.map(([name, note]) => (
          <label
            key={name}
            className="flex cursor-pointer items-start gap-2.5 border-b border-line-faint px-[14px] py-[9px] last:border-b-0"
          >
            <input
              type="checkbox"
              checked={picked.has(name)}
              onChange={(e) => {
                const next = new Set(picked);
                if (e.target.checked) next.add(name);
                else next.delete(name);
                setPicked(next);
              }}
              className="mt-[3px]"
            />
            <span>
              <span className="block text-ui font-medium">{name}</span>
              <span className="block text-chip leading-[1.4] text-dim">{note}</span>
            </span>
          </label>
        ))}
      </div>

      <Field label="Your own (optional)" hint="Comma separated. You can nest folders inside each later.">
        <Input
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder="Projects, Board papers"
        />
      </Field>

      {errors.map((e) => (
        <Callout tone="red" key={e}>{e}</Callout>
      ))}

      <Actions>
        <PrimaryButton onClick={busy ? undefined : create}>
          {busy ? 'Creating…' : 'Create these cabinets'}
        </PrimaryButton>
      </Actions>
    </>
  );
}

function RolesBody({ acked, onAck }) {
  const [roles, setRoles] = useState(null);

  useEffect(() => {
    let off = false;
    api.users
      .roles()
      .then((r) => !off && setRoles(r.items ?? r))
      .catch(() => !off && setRoles([]));
    return () => {
      off = true;
    };
  }, []);

  if (roles === null) return <Foot>Loading…</Foot>;

  return (
    <>
      <div className="border border-line bg-surface">
        <PanelHead>Seeded at provisioning</PanelHead>
        {roles.map((r) => (
          <div key={r.id} className="border-b border-line-faint px-[14px] py-[9px] last:border-b-0">
            <div className="text-ui font-medium">{r.name}</div>
            <div className="text-chip leading-[1.4] text-dim">
              {r.description || `${(r.permissions ?? []).length} permissions`}
            </div>
          </div>
        ))}
      </div>
      <Foot>
        Nobody — no role, no owner, not us — can alter the audit trail. That is not a permission
        that exists to grant.
      </Foot>
      <Actions>
        {acked ? (
          <span className="text-detail text-dim">Reviewed. Nothing further is needed here.</span>
        ) : (
          <PrimaryButton onClick={onAck}>These are right for now</PrimaryButton>
        )}
      </Actions>
    </>
  );
}

function InviteBody({ invited, onInvited }) {
  const empty = { displayName: '', email: '', jobTitle: '' };
  const [rows, setRows] = useState([{ ...empty }, { ...empty }, { ...empty }]);
  const [busy, setBusy] = useState(false);

  const set = (i, k) => (e) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, [k]: e.target.value } : row)));

  async function send() {
    setBusy(true);
    const filled = rows.filter((r) => r.email.includes('@') && r.displayName.trim());
    const results = [];
    for (const r of filled) {
      try {
        const res = await api.users.invite({
          displayName: r.displayName.trim(),
          email: r.email.trim(),
          jobTitle: r.jobTitle.trim() || undefined,
        });
        results.push({ ok: true, email: r.email.trim(), acceptUrl: res.acceptUrl ?? null });
      } catch (err) {
        // Shown verbatim: "the free allowance is in use" is an answer, and
        // rewriting it here would hide the route forward it names.
        results.push({ ok: false, email: r.email.trim(), error: err.body?.message ?? err.message });
      }
    }
    onInvited(results);
    setRows([{ ...empty }, { ...empty }, { ...empty }]);
    setBusy(false);
  }

  return (
    <>
      {rows.map((r, i) => (
        <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_140px] gap-2 max-mid:grid-cols-1">
          <Input placeholder="Full name" value={r.displayName} onChange={set(i, 'displayName')} />
          <Input placeholder="work@email" type="email" value={r.email} onChange={set(i, 'email')} />
          <Input placeholder="Job title" value={r.jobTitle} onChange={set(i, 'jobTitle')} />
        </div>
      ))}

      {invited.map((r) =>
        r.ok ? (
          <Callout tone="blue" key={r.email}>
            <strong>{r.email} invited.</strong>
            {r.acceptUrl ? (
              <span className="mt-1 block break-all">
                Email is switched off, so pass this link on yourself:{' '}
                <code>{`${window.location.origin}${r.acceptUrl}`}</code>
              </span>
            ) : null}
          </Callout>
        ) : (
          <Callout tone="red" key={r.email}>
            {r.email}: {r.error}
          </Callout>
        ),
      )}

      <Actions>
        <PrimaryButton onClick={busy ? undefined : send}>
          {busy ? 'Inviting…' : 'Send invitations'}
        </PrimaryButton>
      </Actions>
      <Foot>
        Each link works once and expires. You can invite the rest from Administration whenever —
        nothing about the first wave is special.
      </Foot>
    </>
  );
}

/* ---- primitives ------------------------------------------------------------ */

const Eyebrow = ({ children }) => (
  <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.1em] text-faint">
    {children}
  </div>
);

const Title = ({ children }) => (
  <h1 className="mb-2.5 text-screen font-bold tracking-[-0.02em]">{children}</h1>
);

const Lede = ({ children }) => (
  <p className="mb-[22px] max-w-[62ch] text-body leading-[1.6] text-muted">{children}</p>
);

const Foot = ({ children }) => (
  <p className="mt-2.5 max-w-[62ch] text-detail leading-[1.55] text-dim">{children}</p>
);

const Actions = ({ children }) => (
  <div className="mt-6 border-t border-line-soft pt-[18px]">{children}</div>
);

const PanelHead = ({ children }) => (
  <div className="border-b border-line bg-surface-3 px-[14px] py-2 text-chip font-semibold text-dim">
    {children}
  </div>
);

function PrimaryButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-[30px] cursor-pointer items-center justify-center whitespace-nowrap border border-blue bg-blue px-[14px] text-ui font-semibold text-white hover:border-blue-hover hover:bg-blue-hover"
    >
      {children}
    </button>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      className="h-[38px] w-full min-w-0 flex-1 border border-line-strong bg-surface px-[14px] text-body"
    />
  );
}

function Facts({ rows, note }) {
  return (
    <div className="border border-line bg-surface">
      {rows.map(([k, v]) => (
        <div
          key={k}
          className="grid grid-cols-[180px_1fr] gap-[14px] border-b border-line-faint px-[14px] py-[9px] text-ui [&:last-of-type]:border-b-0 max-mid:grid-cols-1 max-mid:gap-0.5"
        >
          <span className="text-dim">{k}</span>
          <span className="font-medium">{v}</span>
        </div>
      ))}
      {note ? (
        <p className="border-t border-line-soft bg-surface-2 px-[14px] py-[11px] text-detail leading-[1.55] text-muted">
          {note}
        </p>
      ) : null}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="mb-[14px] mt-4 block">
      <span className="mb-[5px] block text-detail font-semibold text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-[5px] block text-chip text-dim">{hint}</span> : null}
    </label>
  );
}

const TONE = {
  blue: 'border-blue-border bg-blue-bg text-muted',
  ochre: 'border-ochre-border bg-ochre-bg text-ochre',
  red: 'border-red-border bg-red-bg text-red',
};

function Callout({ tone = 'blue', children }) {
  return (
    <div className={`mt-2 border px-[14px] py-[9px] text-detail leading-[1.55] ${TONE[tone]}`}>
      {children}
    </div>
  );
}
