import { useState } from 'react';
import { chipClass } from '../../data/areas.js';

/* -- Details: the generic key/value body --------------------------------- */

/**
 * When a row carries a live record, describe that instead of the sample
 * fields — otherwise the inspector would confidently show one person's
 * details beside another person's name.
 */
function livePersonDetails(user) {
  const roles = (user.roles ?? []).map((r) => r.role.name).join(', ');
  const groups = (user.groupMemberships ?? []).map((g) => g.group.name).join(', ');

  return [
    [
      'Person',
      [
        ['Name', user.displayName, ''],
        ['Email', user.email, ''],
        ['Job title', user.jobTitle || '—', ''],
        ['Tier', user.tier.replace('_', ' ').toLowerCase(), ''],
        ['Roles', roles || '—', ''],
        ['Unit', groups || '—', ''],
      ],
    ],
    [
      'Account',
      [
        ['Status', user.status.toLowerCase(), ''],
        ['Two-factor', user.mfaEnabled ? 'Enabled' : 'Not enabled', ''],
        [
          'Last sign-in',
          user.lastLoginAt
            ? new Date(user.lastLoginAt).toLocaleString('en-GB', {
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Never',
          '',
        ],
        [
          'Invited',
          user.invitedAt
            ? new Date(user.invitedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
            : '—',
          '',
        ],
      ],
    ],
  ];
}

/** An audit entry, described as an auditor would read it. */
function liveEventDetails(e) {
  const when = e.createdAt
    ? new Date(e.createdAt).toLocaleString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    : '—';

  return [
    [
      'Event',
      [
        ['Action', e.action.replace(/_/g, ' ').toLowerCase(), ''],
        ['When', when, ''],
        ['Subject', e.resourceName || '—', ''],
        ['Kind', e.resourceType || '—', ''],
        ['Channel', (e.channel || 'WEB').toLowerCase(), ''],
      ],
    ],
    [
      'Who',
      [
        ['Person', e.actor?.displayName ?? e.actorLabel ?? 'System', ''],
        ['Email', e.actor?.email ?? '—', ''],
        ['Address', e.ip || '—', ''],
      ],
    ],
    [
      'Integrity',
      [
        // The chain is the point of this record, so the fingerprints are shown
        // rather than hidden: an auditor can compare them against an export.
        ['Entry hash', e.hash ? `${e.hash.slice(0, 24)}…` : '—', ''],
        ['Follows', e.prevHash ? `${e.prevHash.slice(0, 24)}…` : 'First entry in the chain', ''],
      ],
    ],
  ];
}

/**
 * Which describer fits this record.
 *
 * Deliberately keyed on the record's own shape rather than on the active area:
 * switching tabs leaves the previous selection in place for a render, so the
 * area says "audit" while the record is still a document. Reading the record
 * itself is the only test that cannot be out of step with it.
 */
function describerFor(live) {
  if (!live) return null;
  if (live.email && live.tier) return livePersonDetails;
  if (live.action && live.hash) return liveEventDetails;
  return null;
}

export function DetailsPane({ details, detailNote, record }) {
  const live = record?.record;
  const describe = describerFor(live);
  const groups = describe ? describe(live) : details;

  // The sample note is advice about a fictional row ("this actor has two
  // blocked attempts…"), so it must not appear under a real one. Only the
  // person notes below are derived from the record in front of us.
  const isPerson = describe === livePersonDetails;
  const note = describe && !isPerson ? null : isPerson
    ? live.status === 'INVITED'
      ? 'This person has been invited but has not accepted yet. Resending replaces their previous invitation link.'
      : live.status === 'SUSPENDED'
        ? 'Suspended. Their audit history is preserved; every session and share link they created was revoked.'
        : detailNote
    : detailNote;

  return <DetailRows groups={groups} note={note} />;
}

function DetailRows({ groups: details, note: detailNote }) {
  return (
    <div>
      {details.map(([label, rows]) => (
        <div className="ins__section" key={label}>
          <div className="ins__label">{label}</div>
          {rows.map(([k, v, conf]) => (
            <div className="kvrow" key={k}>
              <span className="kv__k">{k}</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 14 }}>{v}</span>
                {conf ? <span className="kv__conf">{conf}</span> : null}
              </span>
            </div>
          ))}
        </div>
      ))}
      {detailNote ? (
        <div className="ins">
          <div className="callout callout--blue">{detailNote}</div>
        </div>
      ) : null}
    </div>
  );
}

/* -- Summary -------------------------------------------------------------- */

const FINDINGS = [
  ['ochre', 'The liability cap doubled from six to twelve months of fees.', 'Clause 11.2 · page 4'],
  ['blue', 'Termination for convenience needs ninety days written notice.', 'Clause 14.1 · page 6'],
  ['blue', 'Governing law is Delaware; disputes go to arbitration in New York.', 'Clause 22 · page 11'],
  ['green', 'Payment terms are unchanged at thirty days from invoice.', 'Clause 7.3 · page 3'],
];

const DOT = { ochre: 'var(--ochre)', blue: 'var(--blue)', green: 'var(--green)' };

export function SummaryPane({ record, details }) {
  return (
    <div>
      <div className="ins__section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="ins__label ins__label--blue" style={{ marginBottom: 0 }}>
            Summary
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>regenerated 2 minutes ago</span>
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.65, margin: '10px 0 0', color: 'var(--ink-2)' }}>
          A master services agreement with Northwind Logistics for regional freight, running
          thirty-six months from 1 September 2026. The commercial terms are unchanged from the prior
          version except the liability cap, which has doubled. One signature is outstanding.
        </p>
      </div>

      <div className="ins__section">
        <div className="ins__label">What matters here</div>
        {FINDINGS.map(([tone, text, cite]) => (
          <div key={cite} style={{ display: 'flex', gap: 9, padding: '7px 0' }}>
            <span
              style={{ width: 7, height: 7, flex: '0 0 7px', marginTop: 6, background: DOT[tone] }}
            />
            <div>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>{text}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>{cite}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="ins__section">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="Ask a question about this document"
            style={{
              flex: '1 1 auto',
              minWidth: 0,
              height: 30,
              padding: '0 9px',
              border: '1px solid var(--border-strong)',
              fontSize: 12.5,
            }}
          />
          <button type="button" className="btn btn--primary">
            Ask
          </button>
        </div>
        <div className="ins__note">
          Every summary cites the clause it came from. Answers link back to the source text.
        </div>
      </div>

      <DetailRows groups={details} note={null} />
      <div style={{ padding: '0 16px 16px', fontSize: 11.5, color: 'var(--text-dim)' }}>
        Record: {record[1]}
      </div>
    </div>
  );
}

/* -- Edit: co-editing, page tools, thumbnails, comments ------------------ */

const PRESENCE = [
  ['RT', 'Rachel Tan', 'Clause 11.2', 'Editing', 'chip--ochre', '#8A5A15'],
  ['JM', 'Joseph Mensah', 'Page 6', 'Viewing', '', '#25508C'],
  ['AO', 'You', 'Clause 11.2', 'Checked out', 'chip--blue', '#2F7D4F'],
];

const TOOLS = ['Annotate', 'Redact', 'Text edit', 'Rotate', 'Reorder', 'Delete page', 'Merge…', 'Split…'];

export function EditPane() {
  const [tool, setTool] = useState('Annotate');

  return (
    <div>
      <div className="ins__section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
          <span className="live-dot" style={{ background: 'var(--ochre)' }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Two people editing with you</span>
        </div>

        {PRESENCE.map(([initials, name, where, state, chip, colour]) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0' }}>
            <span
              style={{
                width: 26,
                height: 26,
                flex: '0 0 26px',
                background: colour,
                color: '#fff',
                fontSize: 10.5,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {initials}
            </span>
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <div style={{ fontSize: 13 }}>{name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{where}</div>
            </div>
            <span className={`chip ${chip}`}>{state}</span>
          </div>
        ))}

        <div className="callout callout--ochre" style={{ marginTop: 10 }}>
          You and Rachel Tan are both in Clause 11.2. Changes merge automatically, but edits to the
          same sentence will prompt you to choose which version to keep.
        </div>
      </div>

      <div className="ins__section">
        <div className="ins__label">Page tools</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {TOOLS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTool(t)}
              style={{
                height: 26,
                padding: '0 10px',
                fontSize: 12.5,
                border: '1px solid var(--border-strong)',
                background: tool === t ? 'var(--blue)' : 'var(--surface)',
                color: tool === t ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="ins__section">
        <div className="ins__label">Pages</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {Array.from({ length: 8 }, (_, i) => {
            const page = i + 1;
            const selected = page === 4;
            const redacted = page === 6;
            return (
              <div key={page} style={{ cursor: 'grab' }}>
                <div
                  style={{
                    height: 62,
                    background: 'var(--surface)',
                    border: `1px solid ${selected ? 'var(--blue)' : 'var(--border-soft)'}`,
                    boxShadow: selected ? '0 0 0 2px var(--blue-tint)' : 'none',
                    padding: 6,
                    position: 'relative',
                  }}
                >
                  {[80, 62, 90, 54].map((w, j) => (
                    <div
                      key={j}
                      style={{ height: 3, width: `${w}%`, background: 'var(--border-faint)', marginBottom: 4 }}
                    />
                  ))}
                  {redacted && (
                    <>
                      <div style={{ position: 'absolute', left: 6, top: 20, width: '62%', height: 6, background: 'var(--ink)' }} />
                      <div style={{ position: 'absolute', left: 6, top: 32, width: '44%', height: 6, background: 'var(--ink)' }} />
                    </>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    color: selected ? 'var(--blue)' : 'var(--text-faint)',
                    textAlign: 'center',
                    marginTop: 3,
                  }}
                >
                  {page}
                </div>
              </div>
            );
          })}
        </div>
        <div className="ins__note">
          Drag to reorder. Edits save as a new version; the archival master is never altered.
        </div>
      </div>

      <div className="ins__section">
        <div className="ins__label">Comments</div>
        {[
          ['Rachel Tan', '11 minutes ago', 'Twelve months is above our standing authority. Flagging for the GC.', 'Clause 11.2'],
          ['Joseph Mensah', 'Yesterday', 'Payment terms match the rate card. No change needed.', 'Clause 7.3'],
        ].map(([who, when, body, anchor]) => (
          <div key={anchor} style={{ padding: '9px 0', borderBottom: '1px solid var(--border-faint)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{who}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{when}</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, margin: '4px 0 5px' }}>{body}</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="chip">{anchor}</span>
              <button type="button" style={linkBtn}>Resolve</button>
              <button type="button" style={linkBtn}>Reply</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const linkBtn = {
  background: 'none',
  border: 0,
  padding: 0,
  fontSize: 12.5,
  color: 'var(--blue)',
  cursor: 'pointer',
};

/* -- Versions + inline diff ---------------------------------------------- */

const HISTORY = [
  ['v3.2', 'Amina Okoro', 'Liability cap raised to 12 months', '2 minutes ago', true],
  ['v3.1', 'Rachel Tan', 'Notice period confirmed at 90 days', 'Today, 08:14'],
  ['v3.0', 'Amina Okoro', 'Counterparty review incorporated', '12 August'],
  ['v2.1', 'Joseph Mensah', 'Rate card attached as Schedule B', '9 August'],
  ['v2.0', 'Rachel Tan', 'Legal review complete', '4 August'],
  ['v1.0', 'E-form intake', 'Originated from vendor onboarding', '1 August'],
];

const DIFF = [
  [1, ' ', '11. LIMITATION OF LIABILITY'],
  [2, ' ', ''],
  [3, '-', '11.1 Each party’s aggregate liability shall not exceed'],
  [4, '+', '11.1 Each party’s aggregate liability shall not exceed'],
  [5, '-', 'six (6) months of fees paid under this agreement.'],
  [6, '+', 'twelve (12) months of fees paid under this agreement.'],
  [7, ' ', ''],
  [8, ' ', '11.2 Neither party shall be liable for indirect or'],
  [9, ' ', 'consequential loss howsoever arising.'],
  [10, '+', '11.3 The cap in 11.1 does not apply to breaches of'],
  [11, '+', 'confidentiality or indemnity obligations.'],
];

export function VersionsPane() {
  return (
    <div>
      <div className="ins__section">
        <div className="ins__label">Revisions</div>
        {HISTORY.map(([v, who, note, when, current]) => (
          <div
            key={v}
            style={{
              padding: '8px 10px',
              margin: '0 -10px',
              background: current ? 'var(--blue-tint)' : 'transparent',
              borderBottom: '1px solid var(--border-faint)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 13, fontWeight: current ? 700 : 600 }}>
                {v}
                {current ? ' · current' : ''}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{when}</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>{note}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{who}</div>
          </div>
        ))}
        <div className="ins__note">
          Offline edits merge on reconnect. Where two people changed the same sentence, both appear
          as parallel revisions for you to choose between.
        </div>
      </div>

      <div className="ins__section">
        <div className="ins__label">v3.1 → v3.2 · latest change highlighted</div>
        <div style={{ border: '1px solid var(--border-soft)', background: 'var(--surface)' }}>
          {DIFF.map(([n, op, text]) => {
            const add = op === '+';
            const rem = op === '-';
            return (
              <div
                key={n}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '30px 1fr',
                  fontSize: 12,
                  lineHeight: 1.7,
                  background: add ? 'var(--green-bg)' : rem ? 'var(--red-bg)' : 'transparent',
                  boxShadow: add ? 'inset 2px 0 0 var(--green)' : 'none',
                }}
              >
                <span style={{ color: 'var(--text-ghost)', textAlign: 'right', paddingRight: 8 }}>{n}</span>
                <span
                  style={{
                    fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                    fontWeight: add ? 600 : 400,
                    color: rem ? 'var(--diff-remove-text)' : 'var(--ink-2)',
                    textDecoration: rem ? 'line-through' : 'none',
                    paddingRight: 8,
                  }}
                >
                  {text || ' '}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn">Restore v3.1</button>
          <button type="button" className="btn">Side by side</button>
        </div>
      </div>
    </div>
  );
}

/* -- Access --------------------------------------------------------------- */

export function AccessPane({ access }) {
  const [rows, note, actions] = access;
  const [needsPasscode, setNeedsPasscode] = useState(false);
  const [to, setTo] = useState('A unit');
  const [can, setCan] = useState('Read only');

  const placeholder = {
    'A unit': 'Search units, e.g. Legal',
    'A department': 'Search departments, e.g. Accounts payable',
    'One person': 'Search people by name or address',
  }[to];

  return (
    <div>
      <div className="ins__section">
        <div className="ins__label">Who can reach this</div>
        {rows.map(([who, scope, right, key]) => (
          <div
            key={who}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 10,
              alignItems: 'center',
              padding: '7px 0',
              borderBottom: '1px solid var(--border-faint)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13 }}>{who}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{scope}</div>
            </div>
            <span className={`chip ${chipClass(key) ?? ''}`}>{right}</span>
          </div>
        ))}

        <div className="callout callout--red" style={{ marginTop: 12 }}>
          {note}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {actions.map((a, i) => (
            <button key={a} type="button" className={`btn${i === 0 ? ' btn--primary' : ''}`}>
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="ins__section">
        <div className="ins__label">Grant access</div>

        <ChipRow label="To" options={['A unit', 'A department', 'One person']} value={to} onChange={setTo} />
        <input
          placeholder={placeholder}
          style={{
            width: '100%',
            height: 30,
            padding: '0 9px',
            margin: '8px 0 14px',
            border: '1px solid var(--border-strong)',
            fontSize: 12.5,
          }}
        />

        <ChipRow label="Can" options={['Read only', 'Modify', 'Approve']} value={can} onChange={setCan} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 0', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={needsPasscode}
            onChange={(e) => setNeedsPasscode(e.target.checked)}
          />
          <span style={{ fontSize: 12.5 }}>Also require a six-digit passcode</span>
        </label>

        {needsPasscode && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  style={{
                    width: 38,
                    height: 38,
                    border: '1px solid var(--border-strong)',
                    background: 'var(--surface)',
                  }}
                />
              ))}
            </div>
            <div className="ins__note">
              A passcode overrides inherited role access, including for owners.
            </div>
          </div>
        )}

        <button type="button" className="btn btn--primary" style={{ marginTop: 14 }}>
          Grant {can.toLowerCase()}
        </button>
      </div>
    </div>
  );
}

function ChipRow({ label, options, value, onChange }) {
  return (
    <div>
      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            style={{
              height: 26,
              padding: '0 11px',
              fontSize: 12.5,
              border: `1px solid ${value === o ? 'var(--blue)' : 'var(--border-strong)'}`,
              background: value === o ? 'var(--blue-tint)' : 'var(--surface)',
              color: value === o ? 'var(--blue)' : 'var(--text-muted)',
              fontWeight: value === o ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
