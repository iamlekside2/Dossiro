import { useEffect, useState } from 'react';
import api from '../../lib/api.js';
import { ins } from './ins.js';
import { chip } from '../../ui.js';

/**
 * Inspector panes for a real document.
 *
 * Only what the API can actually answer lives here. The preview and the editing
 * tools are still the design's illustration, and AI summarisation is not built
 * at all — so rather than dress those up, these panes say so where a reader
 * would otherwise assume.
 */

/* -- shared bits --------------------------------------------------------- */

const longDate = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function bytes(v) {
  const n = Number(v);
  if (!n) return '—';
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const sentence = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '—');

/** Loads once per id, and reports its own failure rather than showing nothing. */
function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    fn()
      .then((data) => !cancelled && setState({ data, loading: false, error: null }))
      .catch((error) => !cancelled && setState({ data: null, loading: false, error }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

/** `kvrow` / `kv__k` are the inspector's existing key-value classes. */
function Rows({ title, rows }) {
  return (
    <div className={ins.section}>
      {title && <div className={ins.label}>{title}</div>}
      {rows.map(([k, v]) => (
        <div key={k} className={ins.kvrow}>
          <span className={ins.k}>{k}</span>
          <span style={{ fontSize: 14 }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function Loading({ what }) {
  return <div className={ins.noteSection}>Loading {what}…</div>;
}

function Failed({ error, what }) {
  return (
    <div className={ins.noteSection}>
      Could not load {what}
      {error?.status === 403 ? ' — you do not have access to it.' : '.'}
    </div>
  );
}

/* -- Summary: the document's own facts ----------------------------------- */

export function DocumentSummaryPane({ record }) {
  const doc = record?.record;
  const { data, loading, error } = useLoad(() => api.documents.get(doc.id), [doc.id]);

  if (loading) return <Loading what="this document" />;
  if (error) return <Failed error={error} what="this document" />;

  const d = data;
  const v = d.currentVersion ?? {};
  const holds = d.legalHolds ?? [];
  const tags = (d.tags ?? []).map((t) => t.tag?.name).filter(Boolean);

  return (
    <div>
      <Rows
        title="Document"
        rows={[
          ['Name', d.name],
          ['Classification', sentence(d.classification)],
          ['Kind', sentence(d.kind)],
          ['Type', d.mimeType],
          ['Description', d.description || '—'],
          ['Tags', tags.length ? tags.join(', ') : '—'],
        ]}
      />

      <Rows
        title="Current version"
        rows={[
          ['Version', `${d.versionCount}`],
          ['Size', bytes(v.sizeBytes)],
          ['Pages', v.pageCount ? `${v.pageCount}` : '—'],
          ['Checksum', v.checksum ? `${v.checksum.slice(0, 16)}…` : '—'],
        ]}
      />

      <Rows
        title="Filing"
        rows={[
          ['Folder', d.folder?.name ?? 'Not filed'],
          ['Owner', d.owner?.displayName ?? '—'],
          ['Arrived by', sentence(d.sourceChannel)],
          ['Created', longDate(d.createdAt)],
          ['Last changed', longDate(d.updatedAt)],
        ]}
      />

      {d.checkedOutById && (
        <div className={ins.section}>
          <span className={chip('blue')}>Checked out</span>
          <div className={ins.note} style={{ marginTop: 6 }}>
            Someone is editing this. A new version cannot be filed until they check it back in.
          </div>
        </div>
      )}

      {holds.length > 0 && (
        <div className={ins.section}>
          <span className={chip('red')}>Legal hold</span>
          <div className={ins.note} style={{ marginTop: 6 }}>
            {holds.length === 1 ? 'A hold is' : `${holds.length} holds are`} in force. This document
            cannot be deleted while that stands.
          </div>
        </div>
      )}

      {/* Said plainly, because an empty panel invites the assumption that the
          feature ran and found nothing. */}
      <div className={ins.section}>
        <div className={ins.label}>Automatic summary</div>
        <div className={ins.note}>
          Not built yet. Summarising a document, extracting its key clauses and answering questions
          about it all wait on the text-recognition pipeline.
        </div>
      </div>
    </div>
  );
}

/* -- Versions: the real history ------------------------------------------ */

export function DocumentVersionsPane({ record }) {
  const doc = record?.record;
  const { data, loading, error } = useLoad(() => api.documents.versions(doc.id), [doc.id]);

  if (loading) return <Loading what="the version history" />;
  if (error) return <Failed error={error} what="the version history" />;

  const versions = data ?? [];

  return (
    <div>
      <div className={ins.section}>
        <div className={ins.label}>
          {versions.length} version{versions.length === 1 ? '' : 's'}
        </div>
        <div className={ins.note}>
          Bytes are never overwritten. Each version is a separate stored object, which is what makes
          restoring one possible at all.
        </div>
      </div>

      {versions.map((v) => (
        <div key={v.id} className={ins.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <strong style={{ fontSize: 13 }}>Version {v.versionNumber}</strong>
            {v.versionNumber === versions[0]?.versionNumber && (
              <span className={chip('green')}>Current</span>
            )}
          </div>
          <div className={ins.note} style={{ marginTop: 4 }}>
            {v.changeSummary || 'No note recorded'}
          </div>
          <div className={ins.kvrow} style={{ marginTop: 6 }}>
            <span className={ins.k}>Author</span>
            <span style={{ fontSize: 14 }}>{v.author?.displayName ?? '—'}</span>
          </div>
          <div className={ins.kvrow}>
            <span className={ins.k}>Filed</span>
            <span style={{ fontSize: 14 }}>{shortDate(v.createdAt)}</span>
          </div>
          <div className={ins.kvrow}>
            <span className={ins.k}>Size</span>
            <span style={{ fontSize: 14 }}>{bytes(v.sizeBytes)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* -- Access: what the caller actually holds ------------------------------ */

const LEVEL_NOTE = {
  NONE: 'You cannot open this document.',
  READ: 'You can read it. Downloading, changing and sharing it are not yours to do.',
  DOWNLOAD: 'You can read and download it, but not change it.',
  WRITE: 'You can read, download and file new versions of it.',
  APPROVE: 'You can read, change and approve it.',
  MANAGE: 'You can change it and decide who else may see it.',
  OWNER: 'It is yours. You hold every right over it, including passing ownership on.',
};

export function DocumentAccessPane({ record }) {
  const doc = record?.record;

  const mine = useLoad(() => api.access.effective('DOCUMENT', doc.id), [doc.id]);
  // Only an administrator of the object may list its grants, so a refusal here
  // is a normal outcome rather than a fault.
  const grants = useLoad(
    () => api.access.grants({ documentId: doc.id }).catch(() => null),
    [doc.id],
  );

  if (mine.loading) return <Loading what="your access" />;
  if (mine.error) return <Failed error={mine.error} what="your access" />;

  const level = mine.data?.level ?? 'NONE';
  const list = Array.isArray(grants.data) ? grants.data : [];

  return (
    <div>
      <div className={ins.section}>
        <div className={ins.label}>Your access</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span className={chip(level === 'NONE' ? 'red' : 'green')}>{level}</span>
        </div>
        <div className={ins.note} style={{ marginTop: 6 }}>
          {LEVEL_NOTE[level] ?? ''}
        </div>
      </div>

      <div className={ins.section}>
        <div className={ins.label}>How it was decided</div>
        <div className={ins.note}>
          Access is read from the document first, then its folder, then each folder above it. The
          first level with a rule decides, and a block there beats any permission granted at the
          same level.
        </div>
      </div>

      {list.length > 0 && (
        <div className={ins.section}>
          <div className={ins.label}>Granted directly on this document</div>
          {list.map((g) => (
            <div key={g.id} className={ins.kvrow}>
              <span className={ins.k}>
                {g.user?.displayName ?? g.group?.name ?? g.role?.name ?? sentence(g.subjectType)}
              </span>
              <span style={{ fontSize: 14 }}>
                <span className={chip(g.isDeny ? 'red' : '')}>
                  {g.isDeny ? `DENY ${g.level}` : g.level}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {!grants.loading && list.length === 0 && (
        <div className={ins.noteSection}>
          No rule is set on the document itself, so its folder decides.
        </div>
      )}
    </div>
  );
}
