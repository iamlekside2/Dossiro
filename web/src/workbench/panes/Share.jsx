/**
 * Inspector pane for a real share link.
 *
 * Everything shown here is already on the row's record, so the pane makes no
 * request of its own. The reading analytics the design promised — time on
 * page, which page held attention — are a separate feature and are named as
 * missing rather than filled in with something plausible.
 */

import { ins } from './ins.js';

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

const sentence = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '—');

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

/** Why the link is not working, when it is not. */
function whyClosed(s) {
  if (s.status === 'REVOKED') return `Revoked ${longDate(s.revokedAt)}`;
  if (s.status === 'EXPIRED') return `Expired ${longDate(s.expiresAt)}`;
  if (s.status === 'EXHAUSTED') return `Download cap of ${s.maxDownloads} reached`;
  return null;
}

export function ShareLinkPane({ record }) {
  const s = record?.record;
  if (!s) return null;

  const doc = s.document ?? {};
  const closed = whyClosed(s);

  const permits = [
    s.allowDownload ? 'Download' : 'View only',
    s.allowPrint ? 'Print' : 'No printing',
    s.watermark ? 'Watermarked' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div>
      <Rows
        title="Link"
        rows={[
          // The address is the thing someone actually holds, so it comes first
          // and is shown in full rather than shortened for tidiness.
          ['Address', <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{s.url}</code>],
          ['State', closed ?? 'Active'],
          ['Created', longDate(s.createdAt)],
          ['By', s.createdBy?.displayName ?? '—'],
        ]}
      />

      <Rows
        title="What it permits"
        rows={[
          ['Rights', permits],
          ['Access code', s.hasPassword ? 'Required' : 'Not required'],
          [
            'Recipients',
            s.allowedEmails?.length
              ? s.allowedEmails.join(', ')
              : 'Anyone holding the address',
          ],
          ['Expires', s.expiresAt ? longDate(s.expiresAt) : 'No expiry set'],
          [
            'Downloads',
            s.maxDownloads === null || s.maxDownloads === undefined
              ? `${s.downloadCount} so far, no cap`
              : `${s.downloadCount} of ${s.maxDownloads}`,
          ],
        ]}
      />

      <Rows
        title="The record behind it"
        rows={[
          ['Document', doc.name ?? '—'],
          ['Classification', sentence(doc.classification)],
        ]}
      />

      <Rows
        title="Use"
        rows={[
          ['Opens', String(s._count?.accesses ?? 0)],
          ['First opened', s.firstOpenedAt ? longDate(s.firstOpenedAt) : 'Not yet opened'],
        ]}
      />

      <div className={ins.noteSection}>
        Every open is written to the audit trail. Time-on-page and per-page attention are not
        recorded yet — that is a separate feature, not a setting on this link.
      </div>
    </div>
  );
}
