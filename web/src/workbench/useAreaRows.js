import { useCallback, useEffect, useState } from 'react';
import { ROWS } from '../data/areas.js';
import api from '../lib/api.js';

/**
 * Supplies a workbench area with its rows.
 *
 * Keyed by area *and* scope, because one area can list different kinds of
 * record: Administration shows people, then roles, then branches, then web
 * addresses. Anything without a loader falls back to the handoff's sample rows.
 *
 * Mappers return the same tuple the sample data uses,
 * `[kind, name, meta, flag, col2, col3, col4]`, so ListPane never learns where
 * a row came from. The full record rides along on `row.record` for the
 * inspector.
 */

/**
 * Pluralises a count. Irregulars are listed rather than suffixed, because
 * "1 people" and "2 branchs" are the kind of thing a client notices
 * immediately and quietly stops trusting the rest of the screen over.
 */
const IRREGULAR = {
  person: 'people',
  branch: 'branches',
  'web address': 'web addresses',
};

const plural = (n, word) => `${n} ${n === 1 ? word : (IRREGULAR[word] ?? `${word}s`)}`;

const initials = (name) =>
  (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

/** Compact relative time. Absolute dates once it stops being useful. */
function since(iso) {
  if (!iso) return 'Never';
  const then = new Date(iso);
  const mins = Math.floor((Date.now() - then.getTime()) / 60000);

  if (mins < 1) return 'Now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;

  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';

/** Status becomes the row flag, which ListPane colours red/ochre/blue. */
function personFlag(user) {
  if (user.status === 'SUSPENDED') return 'Suspended';
  if (user.status === 'INVITED') return 'Invited';
  if (user.status === 'DEACTIVATED') return 'Suspended';
  if (user.tier === 'EXTERNAL') return 'External';
  return '';
}

function withRecord(row, record) {
  row.record = record;
  return row;
}

/** Three letters for the row badge, from the file extension. */
function kindBadge(name, mimeType) {
  const ext = (name.split('.').pop() || '').toUpperCase();
  if (ext && ext.length <= 4 && ext !== name.toUpperCase()) {
    return ext === 'JPEG' ? 'JPG' : ext;
  }
  if (mimeType?.startsWith('image/')) return 'IMG';
  if (mimeType?.startsWith('video/')) return 'VID';
  if (mimeType?.startsWith('audio/')) return 'AUD';
  return 'DOC';
}

/**
 * The search snippet as plain text.
 *
 * Postgres returns it with <b> around the matched words. The row renders as
 * text, so the tags come out and the entities they arrived with go back to
 * being characters — otherwise a document named "Smith & Co" reads as
 * "Smith &amp; Co".
 */
function snippetText(html) {
  if (!html) return null;
  const stripped = html.replace(/<\/?b>/g, '');
  const el = document.createElement('textarea');
  el.innerHTML = stripped;
  return el.value;
}

/**
 * id → "Finance / Invoices 2026", from the folder tree.
 *
 * The API's `folder.path` is a materialised path of ids, which is the right
 * thing for a subtree query and the wrong thing to show a person.
 */
function folderTrails(tree) {
  const map = new Map();
  const walk = (nodes, trail) => {
    for (const f of nodes ?? []) {
      const here = [...trail, f.name];
      map.set(f.id, here.join(' / '));
      if (f.children?.length) walk(f.children, here);
    }
  };
  walk(tree, []);
  return map;
}

/** Where a document sits, named rather than identified. */
function whereIs(doc, trails) {
  if (!doc.folder) return 'Unfiled';
  return trails.get(doc.folder.id) ?? doc.folder.name ?? 'Unfiled';
}

/** Bytes as something a person reads, not a number they decode. */
function fileSize(bytes) {
  const n = Number(bytes);
  if (!n) return null;
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Share scopes, in the order SCOPES.sharing lists them.
 *
 * The design grouped links by recipient type (external counsel, brokers,
 * auditors), which nothing in the data supports — a link records the document
 * and who made it, not what kind of party holds it. These are the states the
 * server already computes, and they are the states that need acting on.
 */
const SHARE_SCOPES = [null, 'ACTIVE', 'EXPIRED', 'EXHAUSTED', 'REVOKED'];

/** What a link permits, in the words the column header promises. */
function shareRights(s) {
  if (s.allowDownload === false) return 'View only';
  if (s.maxDownloads !== null && s.maxDownloads !== undefined) {
    return `Download, ${s.maxDownloads} max`;
  }
  return 'Download';
}

/** When it stops working — a date ahead, a reason behind. */
function shareExpiry(s) {
  if (s.status === 'REVOKED') return 'Revoked';
  if (s.status === 'EXHAUSTED') return 'Cap reached';
  if (!s.expiresAt) return 'No expiry';

  const at = new Date(s.expiresAt);
  const days = Math.round((at.getTime() - Date.now()) / 86400000);
  if (days < 0) return 'Expired';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 30) return `In ${days} days`;
  return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

/** Only states that need attention are flagged; a working link is not news. */
function shareFlag(status) {
  if (status === 'REVOKED') return 'Revoked';
  if (status === 'EXPIRED') return 'Expired';
  if (status === 'EXHAUSTED') return 'Cap reached';
  return '';
}

/**
 * Audit scopes, in the order SCOPES.audit lists them. Each is a set of real
 * actions rather than a text match on a rendered row, so the filtering happens
 * in the database and the total means something.
 */
const AUDIT_SCOPES = [
  null, // All events
  ['LOGIN'],
  ['LOGIN_FAILED'],
  ['DOCUMENT_CREATE', 'DOCUMENT_VIEW', 'DOCUMENT_DOWNLOAD', 'DOCUMENT_UPDATE',
   'DOCUMENT_DELETE', 'DOCUMENT_RESTORE', 'DOCUMENT_PURGE', 'DOCUMENT_MOVE',
   'VERSION_CREATE', 'VERSION_RESTORE'],
  ['SHARE_CREATE', 'SHARE_ACCESS', 'SHARE_REVOKE'],
  ['ACCESS_GRANT', 'ACCESS_REVOKE'],
  ['USER_CREATE', 'USER_UPDATE', 'ROLE_CHANGE', 'SETTINGS_CHANGE'],
];

/** The action, as a person would say it. */
const ACTION_WORDS = {
  LOGIN: 'Signed in',
  LOGOUT: 'Signed out',
  LOGIN_FAILED: 'Sign-in refused',
  DOCUMENT_CREATE: 'Filed a document',
  DOCUMENT_VIEW: 'Opened a document',
  DOCUMENT_DOWNLOAD: 'Downloaded a document',
  DOCUMENT_UPDATE: 'Changed a document',
  DOCUMENT_DELETE: 'Deleted a document',
  DOCUMENT_RESTORE: 'Restored a document',
  DOCUMENT_PURGE: 'Purged a document',
  DOCUMENT_MOVE: 'Moved a document',
  VERSION_CREATE: 'Filed a new version',
  VERSION_RESTORE: 'Restored a version',
  FOLDER_CREATE: 'Created a folder',
  FOLDER_UPDATE: 'Changed a folder',
  FOLDER_DELETE: 'Deleted a folder',
  ACCESS_GRANT: 'Granted access',
  ACCESS_REVOKE: 'Revoked access',
  SHARE_CREATE: 'Created a share link',
  SHARE_ACCESS: 'Opened a share link',
  SHARE_REVOKE: 'Revoked a share link',
  SIGNATURE_REQUEST: 'Requested a signature',
  SIGNATURE_APPLY: 'Signed',
  USER_CREATE: 'Invited someone',
  USER_UPDATE: 'Changed an account',
  ROLE_CHANGE: 'Changed a role',
  SETTINGS_CHANGE: 'Changed settings',
  EXPORT: 'Exported',
  CHANNEL_INBOUND: 'Received on a channel',
  CHANNEL_OUTBOUND: 'Sent on a channel',
};

/** Refusals and destructive acts are the rows an auditor is looking for. */
function auditFlag(action) {
  if (action === 'LOGIN_FAILED') return 'Refused';
  if (/DELETE|PURGE|REVOKE/.test(action)) return 'Removed';
  if (/GRANT|SETTINGS_CHANGE|ROLE_CHANGE/.test(action)) return 'Changed';
  return '';
}

/* -- Loaders, keyed by area then scope index ----------------------------- */
/* A '*' loader serves every scope in its area. Repository needs this: each
   scope is a folder, so the same loader runs with a different folder id
   rather than there being one loader per index. */

const LIVE = {
  audit: {
    '*': {
      label: 'events',
      async load({ scopeIndex = 0 } = {}) {
        const actions = AUDIT_SCOPES[scopeIndex] ?? null;
        const res = await api.audit.query({
          take: 200,
          ...(actions ? { action: actions.join(',') } : {}),
        });

        // The chain is checked alongside the page, because a trail nobody
        // verifies is only a log. A failure here is reported, not swallowed:
        // silence would be indistinguishable from a passing check.
        let integrity = null;
        try {
          integrity = await api.audit.integrity();
        } catch {
          integrity = null;
        }

        return {
          rows: res.items.map((e) =>
            withRecord(
              [
                'LOG',
                ACTION_WORDS[e.action] ?? e.action.replace(/_/g, ' ').toLowerCase(),
                [e.resourceName, e.resourceType].filter(Boolean).join(' · ') || e.resourceType,
                auditFlag(e.action),
                e.action.replace(/_/g, ' ').toLowerCase(),
                e.actor?.displayName ?? e.actorLabel ?? 'System',
                since(e.createdAt),
              ],
              e,
            ),
          ),
          total: res.total,
          status: [
            plural(res.total, 'event'),
            `${res.items.filter((e) => e.action === 'LOGIN_FAILED').length} refused sign-ins`,
            integrity
              ? integrity.valid
                ? `Chain verified across ${integrity.checked} events`
                : `CHAIN BROKEN at ${integrity.brokenAt}`
              : 'Chain not checked',
            'Write-once storage',
          ],
        };
      },
    },
  },

  repo: {
    '*': {
      label: 'documents',
      async load({ folderId } = {}) {
        // folderId undefined means "everything the caller may see"; the API
        // treats an explicit null as "unfiled", so it is only sent when set.
        const res = await api.documents.list({
          take: 200,
          ...(folderId ? { folderId } : {}),
        });

        return {
          rows: res.items.map((d) => {
            const v = d.currentVersion ?? {};
            const meta = [
              d.versionCount > 1 ? `Version ${d.versionCount}` : 'Version 1',
              fileSize(v.sizeBytes),
              v.pageCount ? `${v.pageCount} pages` : null,
            ]
              .filter(Boolean)
              .join(' · ');

            return withRecord(
              [
                kindBadge(d.name, d.mimeType),
                d.name,
                meta,
                d.checkedOutById ? 'Checked out' : '',
                // Classification is the single most important thing on the row,
                // so it takes the column the eye reaches first after the name.
                d.classification.charAt(0) + d.classification.slice(1).toLowerCase(),
                since(d.updatedAt),
                d.owner?.displayName ?? '—',
              ],
              d,
            );
          }),
          total: res.total,
          status: [
            plural(res.total, 'document'),
            `${res.items.filter((d) => d.checkedOutById).length} checked out`,
            `${res.items.filter((d) => d.classification === 'CONFIDENTIAL' || d.classification === 'RESTRICTED').length} confidential or above`,
            '90-day recovery window',
          ],
        };
      },
    },
  },

  search: {
    '*': {
      label: 'results',
      async load({ query = '', folderId } = {}) {
        // Content search reaches inside the document body and returns a ranked,
        // highlighted snippet; metadata search does not. With no query at all
        // there is nothing to rank, so it lists what the scope contains and
        // says so in the status bar rather than showing an empty screen.
        const inContent = Boolean(query);

        // The tree comes along because a result carries `folder.path`, and that
        // path is built from ids — "/cmsxpfa76…/cmsxpfa7u…/" tells a reader
        // nothing about where the document lives.
        const [res, tree] = await Promise.all([
          api.search({
            take: 200,
            ...(query ? { q: query, inContent: true, sort: 'relevance' } : {}),
            ...(folderId ? { folderId } : {}),
          }),
          api.folders.tree().catch(() => null),
        ]);

        const trails = folderTrails(tree);

        return {
          rows: res.items.map((d) =>
            withRecord(
              [
                kindBadge(d.name, d.mimeType),
                d.name,
                // The snippet arrives with <b> around the match. Tags are
                // stripped rather than rendered: this cell is plain text
                // elsewhere, and injecting markup here to bold a word is not
                // worth an HTML sink on server-derived content.
                snippetText(d.snippet) ?? whereIs(d, trails),
                d.rank ? d.rank.toFixed(2) : '',
                d.classification.charAt(0) + d.classification.slice(1).toLowerCase(),
                whereIs(d, trails),
                since(d.updatedAt),
              ],
              d,
            ),
          ),
          total: res.total,
          status: [
            query ? plural(res.total, 'result') : `${plural(res.total, 'document')} in scope`,
            query ? 'Ranked by relevance' : 'No query — listing the scope',
            // Said plainly, because a search that silently skips scans reads as
            // a search that found nothing.
            inContent ? 'Text and metadata' : 'Metadata only',
            'Scans are not searchable until OCR runs',
          ],
        };
      },
    },
  },

  sharing: {
    '*': {
      label: 'links',
      async load({ scopeIndex = 0 } = {}) {
        const status = SHARE_SCOPES[scopeIndex];
        const res = await api.shares.list({ take: 200, ...(status ? { status } : {}) });

        return {
          rows: res.items.map((s) => {
            const d = s.document ?? {};
            const opens = s._count?.accesses ?? 0;
            const who = s.createdBy?.displayName;
            const meta = [
              // The address is what someone actually holds, so it leads.
              s.url,
              who ? `by ${who}` : null,
              s.hasPassword ? 'access code required' : null,
            ]
              .filter(Boolean)
              .join(' · ');

            return withRecord(
              [
                kindBadge(d.name ?? '', d.mimeType),
                d.name ?? 'Deleted document',
                meta,
                shareFlag(s.status),
                shareRights(s),
                shareExpiry(s),
                String(opens),
              ],
              s,
            );
          }),
          total: res.total,
          status: [
            plural(res.total, 'link'),
            `${res.items.reduce((n, s) => n + (s._count?.accesses ?? 0), 0)} opens recorded`,
            `${res.items.filter((s) => s.document?.classification === 'CONFIDENTIAL' || s.document?.classification === 'RESTRICTED').length} on confidential records`,
            'Every open is audited',
          ],
        };
      },
    },
  },

  admin: {
    0: {
      label: 'people',
      async load() {
        const res = await api.users.list({ take: 200 });
        return {
          rows: res.items.map((u) =>
            withRecord(
              [
                initials(u.displayName),
                u.displayName,
                u.email,
                personFlag(u),
                u.roles?.[0]?.role?.name ?? u.tier.replace('_', ' ').toLowerCase(),
                u.branch?.name ?? u.groupMemberships?.[0]?.group?.name ?? '—',
                since(u.lastLoginAt),
              ],
              u,
            ),
          ),
          total: res.total,
          status: [
            `${res.total} ${res.total === 1 ? 'person' : 'people'}`,
            plural(res.items.filter((u) => u.status === 'INVITED').length, 'invitation') + ' pending',
            `${res.items.filter((u) => u.status === 'SUSPENDED').length} suspended`,
            `${res.items.filter((u) => u.mfaEnabled).length} with two-factor`,
          ],
        };
      },
    },

    1: {
      label: 'roles',
      async load() {
        const roles = await api.users.roles();
        return {
          rows: roles.map((r) =>
            withRecord(
              [
                'ROL',
                r.name,
                r.description ?? '—',
                r.isSystem ? 'System' : '',
                r.key,
                `${r._count?.users ?? 0}`,
                `${r.permissions?.length ?? 0} permissions`,
              ],
              r,
            ),
          ),
          total: roles.length,
          status: [
            plural(roles.length, 'role'),
            `${roles.filter((r) => r.isSystem).length} built in`,
            `${roles.filter((r) => !r.isSystem).length} custom`,
          ],
        };
      },
    },

    2: {
      label: 'branches',
      async load() {
        const res = await api.branches.list();
        return {
          rows: res.items.map((b) =>
            withRecord(
              [
                b.code || initials(b.name),
                b.name,
                [b.address, b.timezone].filter(Boolean).join(' · ') || 'No address recorded',
                b.isHeadOffice ? 'Head office' : '',
                b.code ?? '—',
                `${b.people}`,
                b.parent?.name ?? '—',
              ],
              b,
            ),
          ),
          total: res.total,
          status: [
            plural(res.total, 'branch'),
            `${plural(res.items.reduce((n, b) => n + b.people, 0), 'person')} posted`,
            res.items.some((b) => b.isHeadOffice) ? 'Head office set' : 'No head office set',
          ],
        };
      },
    },

    3: {
      label: 'web addresses',
      async load() {
        const res = await api.organization.hostnames();
        return {
          rows: res.items.map((h) =>
            withRecord(
              [
                'WWW',
                h.hostname,
                h.verifiedAt ? 'Ownership confirmed' : 'Waiting on a DNS TXT record',
                h.verifiedAt ? '' : 'Review',
                h.verifiedAt ? 'Verified' : 'Unverified',
                h.isPrimary ? 'Primary' : 'Alias',
                shortDate(h.createdAt),
              ],
              h,
            ),
          ),
          total: res.total,
          status: [
            plural(res.total, 'web address'),
            `${res.items.filter((h) => h.verifiedAt).length} verified`,
            res.items.find((h) => h.isPrimary)?.hostname ?? 'No primary address',
          ],
        };
      },
    },
  },
};

function loaderFor(area, scopeIndex) {
  // An exact scope match wins; '*' covers every scope in the area.
  return LIVE[area]?.[scopeIndex] ?? LIVE[area]?.['*'] ?? null;
}

export function isLiveArea(area, scopeIndex = 0) {
  return Boolean(loaderFor(area, scopeIndex));
}

/**
 * @param context extra input the loader needs — currently the selected
 *   folder id for Repository. Serialised into the effect's dependency list so
 *   changing folder refetches, without making the object identity the trigger.
 */
export function useAreaRows(area, scopeIndex = 0, enabled = true, context = null) {
  const live = loaderFor(area, scopeIndex);
  const contextKey = context ? JSON.stringify(context) : '';

  const [state, setState] = useState(() =>
    live
      ? { rows: [], loading: true, error: null }
      : { rows: ROWS[area], loading: false, error: null },
  );

  const load = useCallback(
    async (signal) => {
      if (!live) {
        setState({ rows: ROWS[area], loading: false, error: null });
        return;
      }
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const { rows, total, status } = await live.load(contextKey ? JSON.parse(contextKey) : {});
        if (signal?.aborted) return;

        // Every endpoint caps its page — search at 100, the rest at 200 — and
        // the list has no paging control yet, so a capped result looks exactly
        // like a complete one. Said here rather than in each loader, so an area
        // wired later cannot forget it: a truncated list that does not say so
        // is a wrong answer, not a partial one.
        const capped = total != null && rows.length < total;
        const cells = capped
          ? [`Showing the first ${rows.length} of ${total.toLocaleString('en-GB')}`, ...(status ?? [])]
          : status;

        setState({ rows, total, status: cells, loading: false, error: null });
      } catch (err) {
        if (signal?.aborted) return;
        setState({ rows: [], loading: false, error: err });
      }
    },
    [area, live, contextKey],
  );

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, enabled]);

  return { ...state, isLive: Boolean(live), reload: () => load(), label: live?.label };
}
