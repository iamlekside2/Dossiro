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

/** Bytes as something a person reads, not a number they decode. */
function fileSize(bytes) {
  const n = Number(bytes);
  if (!n) return null;
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* -- Loaders, keyed by area then scope index ----------------------------- */
/* A '*' loader serves every scope in its area. Repository needs this: each
   scope is a folder, so the same loader runs with a different folder id
   rather than there being one loader per index. */

const LIVE = {
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
        setState({ rows, total, status, loading: false, error: null });
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
