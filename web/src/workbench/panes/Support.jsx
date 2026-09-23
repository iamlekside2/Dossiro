import { useState } from 'react';
import api from '../../lib/api.js';
import { ins } from './ins.js';
import { btn, callout, chip } from '../../ui.js';

/**
 * A support session, from the tenant's side (PLT-2).
 *
 * The operator's console has a counterpart to this showing the same rows. That
 * symmetry is the feature: a record of who looked inside your tenancy is worth
 * nothing if the only copy belongs to the people who looked.
 *
 * Every action here is one click with nothing in the way. "Their records
 * manager can revoke the session instantly" is only true if it is.
 */

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
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export function SupportSessionPane({ record, onChanged }) {
  const s = record?.record;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [views, setViews] = useState(null);

  // Keyed on the record's shape rather than on the active scope. Switching
  // scope leaves the previous selection in place for a render, so this pane is
  // briefly handed a person — and reading `state` off one throws.
  const isSession = Boolean(s?.scope && s?.state && s?.requestedAt);
  if (!isSession) return <div className={ins.noteSection}>Select a support session.</div>;

  async function act(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged?.();
    } catch (err) {
      setError(err.body?.message ?? err.message);
    } finally {
      setBusy(false);
    }
  }

  async function showViews() {
    setError(null);
    try {
      const full = await api.support.session(s.id);
      setViews(full.views ?? []);
    } catch (err) {
      setError(err.body?.message ?? err.message);
    }
  }

  return (
    <div>
      <div className={ins.section}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={chip(STATE_CHIP[s.state])}>{s.state.toLowerCase()}</span>
          <span className={chip()}>{s.scope.toLowerCase()}</span>
          {s.breakGlass ? <span className={chip('red')}>break-glass</span> : null}
        </div>
        <p className="text-[14px] leading-[1.6]">{s.reason}</p>
        <p className={ins.note}>
          Written by {s.operatorName} at Calm Global, and shown to you exactly as they wrote it.
        </p>
      </div>

      <div className={ins.section}>
        <div className={ins.label}>Timing</div>
        <Row k="Asked" v={when(s.requestedAt)} />
        {s.approvedAt ? <Row k="Approved" v={`${when(s.approvedAt)} by ${s.approvedByName}`} /> : null}
        <Row k="Expires" v={when(s.expiresAt)} />
        {s.revokedAt ? (
          <Row k="Ended" v={`${when(s.revokedAt)}${s.revokedByName ? ` by ${s.revokedByName}` : ''}`} />
        ) : null}
      </div>

      {s.breakGlass && (
        <div className={ins.section}>
          <div className={callout('red')}>
            Taken during a confirmed platform outage, without waiting for your approval. It is
            capped at thirty minutes, and reviewed by us within one business day. You can still end
            it now.
          </div>
        </div>
      )}

      {/* What they actually opened. Behind a click because it is a request,
          not because it is sensitive — this is the customer's own list. */}
      {(s.scope === 'DOCUMENTS' || Number(s.viewCount) > 0) && (
        <div className={ins.section}>
          <div className={ins.label}>What they opened</div>
          {views === null ? (
            <button type="button" className={btn()} onClick={showViews}>
              Show the records
              {Number(s.viewCount) ? ` (${s.viewCount})` : ''}
            </button>
          ) : views.length === 0 ? (
            <p className="text-detail text-dim">Nothing was opened during this session.</p>
          ) : (
            views.map((v) => (
              <div
                key={`${v.documentName}-${v.viewedAt}`}
                className="flex items-baseline justify-between gap-3 border-b border-line-faint py-[6px] last:border-b-0 text-detail"
              >
                <span className="min-w-0 truncate">{v.documentName}</span>
                <span className="flex-none text-chip text-faint">{when(v.viewedAt)}</span>
              </div>
            ))
          )}
        </div>
      )}

      {error && (
        <div className={ins.section}>
          <div className={callout('red')}>{error}</div>
        </div>
      )}

      {(s.state === 'REQUESTED' || s.state === 'ACTIVE') && (
        <div className={ins.section}>
          <div className={ins.label}>Your decision</div>
          <div className="flex flex-wrap gap-2">
            {s.state === 'REQUESTED' ? (
              <>
                <button
                  type="button"
                  className={btn('primary')}
                  disabled={busy}
                  onClick={() => act(() => api.support.approve(s.id))}
                >
                  Let them in
                </button>
                <button
                  type="button"
                  className={btn()}
                  disabled={busy}
                  onClick={() => act(() => api.support.refuse(s.id))}
                >
                  Turn it down
                </button>
              </>
            ) : (
              <button
                type="button"
                className={btn()}
                disabled={busy}
                onClick={() => act(() => api.support.revoke(s.id))}
              >
                End it now
              </button>
            )}
          </div>
          <p className={ins.note}>
            You need no reason and no permission from us. Ending a session stops it on their next
            request, not at the end of some window.
          </p>
        </div>
      )}

      <div className={ins.noteSection}>
        Calm Global cannot read your records without a session like this one. Every request,
        approval and record opened is written to this audit trail, where you can find it without
        asking us.
      </div>
    </div>
  );
}

const Row = ({ k, v }) => (
  <div className={ins.kvrow}>
    <span className={ins.k}>{k}</span>
    <span className="text-[14px]">{v}</span>
  </div>
);
