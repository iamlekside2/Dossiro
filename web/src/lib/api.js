/**
 * API client.
 *
 * Holds the access token in memory and the refresh token in sessionStorage: an
 * access token in storage is readable by any script on the page, and it is the
 * one that actually opens doors. On a 401 the client refreshes once and retries
 * the original request, so a 15-minute access token never surfaces as an error.
 */

const BASE = import.meta.env.VITE_API_BASE ?? '/api';
const REFRESH_KEY = 'cv.refresh';

let accessToken = null;
/** Set by SessionProvider so a dead session can clear app state, not just tokens. */
let onSignedOut = null;
/** Shared promise, so ten parallel 401s trigger one refresh rather than ten. */
let refreshing = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function setRefreshToken(token) {
  try {
    if (token) sessionStorage.setItem(REFRESH_KEY, token);
    else sessionStorage.removeItem(REFRESH_KEY);
  } catch {
    /* private mode — the session simply will not survive a reload */
  }
}

export function getRefreshToken() {
  try {
    return sessionStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function onUnauthorized(handler) {
  onSignedOut = handler;
}

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function raw(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const isForm = body instanceof FormData;

  const res = await fetch(`${BASE}${path}`, {
    method,
    signal,
    headers: {
      ...(isForm || !body ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(data?.message || `${res.status} ${res.statusText}`, res.status, data);
  }
  return data;
}

async function refreshOnce() {
  const token = getRefreshToken();
  if (!token) return false;

  refreshing =
    refreshing ??
    raw('/auth/refresh', { method: 'POST', body: { refreshToken: token } })
      .then((res) => {
        setAccessToken(res.accessToken);
        setRefreshToken(res.refreshToken);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });

  return refreshing;
}

async function request(path, options = {}) {
  try {
    return await raw(path, options);
  } catch (err) {
    // Public endpoints legitimately 401 on a bad passcode — only try to refresh
    // when we actually hold a session.
    if (err.status !== 401 || !getRefreshToken() || options._retried) throw err;

    const ok = await refreshOnce();
    if (!ok) {
      setAccessToken(null);
      setRefreshToken(null);
      onSignedOut?.();
      throw err;
    }
    return raw(path, { ...options, _retried: true });
  }
}

/**
 * A response body as a Blob, with the same refresh-on-401 behaviour as
 * `request`. Separate because `raw` parses text and would corrupt binary.
 */
async function requestBlob(path, retried = false) {
  const res = await fetch(`${BASE}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });

  if (res.status === 401 && getRefreshToken() && !retried) {
    if (await refreshOnce()) return requestBlob(path, true);
    setAccessToken(null);
    setRefreshToken(null);
    onSignedOut?.();
  }

  if (!res.ok) {
    // The error body is JSON even when the success body is not.
    let message = `Request failed (${res.status})`;
    try {
      message = (await res.json()).message ?? message;
    } catch {
      /* a non-JSON error body is not worth a second failure */
    }
    throw new ApiError(message, res.status, null);
  }

  return res.blob();
}

const qs = (params) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

export const api = {
  health: () => request('/health'),

  auth: {
    /** Which tenants can this address sign into? Drives the org picker. */
    resolve: (email) => request('/auth/resolve', { method: 'POST', body: { email } }),
    login: (email, password, organizationId) =>
      request('/auth/login', { method: 'POST', body: { email, password, organizationId } }),
    me: () => request('/auth/me'),
    logout: () => request('/auth/logout', { method: 'POST' }),
  },

  organization: {
    /**
     * Which tenant does the address bar belong to? Public, and called before
     * anyone has signed in, so the entry page can brand itself. Returns
     * `{ organizationId: null }` on the shared address, which is the signal to
     * show the product name instead of any one customer's.
     */
    byHost: () => request('/tenant/by-host'),

    current: () => request('/organization'),
    hostnames: () => request('/organization/hostnames'),
    addHostname: (hostname) => request('/organization/hostnames', { method: 'POST', body: { hostname } }),
    verifyHostname: (id) => request(`/organization/hostnames/${id}/verify`, { method: 'POST' }),
    makePrimary: (id) => request(`/organization/hostnames/${id}/primary`, { method: 'POST' }),
    removeHostname: (id) => request(`/organization/hostnames/${id}`, { method: 'DELETE' }),
  },
  branches: {
    list: () => request('/branches'),
    tree: () => request('/branches/tree'),
    create: (body) => request('/branches', { method: 'POST', body }),
    update: (id, body) => request(`/branches/${id}`, { method: 'PATCH', body }),
    close: (id) => request(`/branches/${id}`, { method: 'DELETE' }),
    assign: (userId, branchId) => request(`/branches/assign/${userId}`, { method: 'PATCH', body: { branchId } }),
  },


  /** Tenant lifecycle. Only the platform organisation may call these. */
  platform: {
    listOrganizations: () => request('/platform/organizations'),
    provision: (body) => request('/platform/organizations', { method: 'POST', body }),
    /** `reason` is required by the API for SUSPENDED and CLOSED. */
    setStatus: (id, status, reason) =>
      request(`/platform/organizations/${id}/status`, { method: 'PATCH', body: { status, reason } }),
  },

  /**
   * Support access to a tenancy (PLT-2).
   *
   * Both sides call the same routes: an operator requests and revokes, the
   * tenant approves, refuses and revokes, and both read the same list.
   */
  support: {
    /** A tenant omits the id and gets their own. */
    sessions: (organizationId) =>
      request(`/support/sessions${organizationId ? `?organizationId=${organizationId}` : ''}`),
    session: (id) => request(`/support/sessions/${id}`),
    request: (body) => request('/support/sessions', { method: 'POST', body }),
    approve: (id) => request(`/support/sessions/${id}/approve`, { method: 'PATCH', body: {} }),
    refuse: (id, reason) =>
      request(`/support/sessions/${id}/refuse`, { method: 'PATCH', body: { reason } }),
    revoke: (id, reason) =>
      request(`/support/sessions/${id}/revoke`, { method: 'PATCH', body: { reason } }),

    /** Only reachable with a live session of sufficient scope. */
    records: (organizationId, take = 50) =>
      request(`/support/tenants/${organizationId}/records?take=${take}`),
  },

  /** Approvals in flight (WFL-9). */
  workflow: {
    tasks: () => request('/workflow/tasks'),
    instance: (id) => request(`/workflow/instances/${id}`),
    decide: (id, approve, comment) =>
      request(`/workflow/tasks/${id}/decide`, { method: 'POST', body: { approve, comment } }),
  },

  /** Retention schedules and what has fallen due under them (GOV-6, GOV-7). */
  retention: {
    policies: () => request('/retention/policies'),
    due: () => request('/retention/due'),
    history: () => request('/retention/history'),
  },

  users: {
    list: (params = {}) => request(`/users?${qs(params)}`),
    invite: (body) => request('/users/invite', { method: 'POST', body }),
    resendInvitation: (id) => request(`/users/${id}/resend-invitation`, { method: 'POST' }),
    changeTier: (id, tier) => request(`/users/${id}/tier`, { method: 'PATCH', body: { tier } }),
    suspend: (id) => request(`/users/${id}/suspend`, { method: 'POST' }),
    reinstate: (id) => request(`/users/${id}/reinstate`, { method: 'POST' }),
    roles: () => request('/roles'),
  },

  invitations: {
    describe: (token) => request(`/invitations/${token}`),
    accept: (token, password) =>
      request(`/invitations/${token}/accept`, { method: 'POST', body: { password } }),
  },

  folders: {
    tree: (rootId) => request(`/folders/tree${rootId ? `?rootId=${rootId}` : ''}`),
    children: (id) => request(`/folders/${id ?? 'root'}/children`),

    /** Omitting parentId creates a cabinet at the top of the repository. */
    create: (body) => request('/folders', { method: 'POST', body }),
    rename: (id, name) => request(`/folders/${id}/name`, { method: 'PATCH', body: { name } }),
    move: (id, parentId) => request(`/folders/${id}/parent`, { method: 'PATCH', body: { parentId } }),
  },

  documents: {
    list: (params = {}) => request(`/documents?${qs(params)}`),
    get: (id) => request(`/documents/${id}`),
    versions: (id) => request(`/documents/${id}/versions`),
    recycleBin: (params = {}) => request(`/documents/recycle-bin?${qs(params)}`),
    /** What this document holds in its type's index fields. */
    fields: (id) => request(`/documents/${id}/fields`),
    setType: (id, documentTypeId) =>
      request(`/documents/${id}/type`, { method: 'PATCH', body: { documentTypeId } }),
    setField: (id, fieldId, value) =>
      request(`/documents/${id}/fields/${fieldId}`, { method: 'PATCH', body: { value } }),

    /** null files it at the root, unfiled. */
    move: (id, folderId) =>
      request(`/documents/${id}/folder`, { method: 'PATCH', body: { folderId } }),

    classify: (id, classification) =>
      request(`/documents/${id}/classification`, { method: 'PATCH', body: { classification } }),

    checkOut: (id) => request(`/documents/${id}/checkout`, { method: 'POST' }),
    checkIn: (id) => request(`/documents/${id}/checkin`, { method: 'POST' }),
    remove: (id) => request(`/documents/${id}`, { method: 'DELETE' }),

    /**
     * A rendering for somebody who may read but not download (VEW-2).
     *
     * Returns the indexed text, never the stored bytes, and needs only READ.
     */
    view: (id) => request(`/documents/${id}/view`),

    /**
     * The document's bytes, as an object URL the browser can render.
     *
     * Not a plain address, tempting as that is. The content endpoint
     * authenticates with a bearer header, and neither `<iframe src>` nor
     * `window.open()` can carry one — both would arrive unauthenticated and be
     * refused. So the bytes come through fetch, which also means they go
     * through the refresh handling above rather than 401ing on a stale token.
     *
     * The caller owns the returned URL and must revoke it.
     */
    async content(id) {
      const res = await requestBlob(`/documents/${id}/content?disposition=inline`);
      return { url: URL.createObjectURL(res), type: res.type, size: res.size };
    },
  },

  /** User-defined document types and their typed index fields (TYP-1..7). */
  documentTypes: {
    list: (params = {}) => request(`/document-types?${qs(params)}`),
    get: (id) => request(`/document-types/${id}`),
    create: (body) => request('/document-types', { method: 'POST', body }),
    update: (id, body) => request(`/document-types/${id}`, { method: 'PATCH', body }),
    setStatus: (id, status) =>
      request(`/document-types/${id}/status`, { method: 'PATCH', body: { status } }),
    remove: (id) => request(`/document-types/${id}`, { method: 'DELETE' }),

    /** Which roles may file as this type, plus every role that could. */
    roles: (id) => request(`/document-types/${id}/roles`),
    /** Replaces the list; an empty array removes the restriction. */
    setRoles: (id, roleIds) =>
      request(`/document-types/${id}/roles`, { method: 'PATCH', body: { roleIds } }),

    addField: (id, body) => request(`/document-types/${id}/fields`, { method: 'POST', body }),
    updateField: (id, fieldId, body) =>
      request(`/document-types/${id}/fields/${fieldId}`, { method: 'PATCH', body }),
    removeField: (id, fieldId) =>
      request(`/document-types/${id}/fields/${fieldId}`, { method: 'DELETE' }),
  },

  audit: {
    /** `action` may be one action or a comma-separated list. */
    query: (params = {}) => request(`/audit?${qs(params)}`),
    /** Recomputes the hash chain and reports the first entry that disagrees. */
    integrity: () => request('/audit/integrity'),
  },

  access: {
    /** The caller's own resolved level on one object. */
    effective: (type, id) => request(`/access/effective?type=${type}&id=${id}`),
    /** Who else has been granted what. Requires MANAGE on the object. */
    grants: (params) => request(`/access/grants?${qs(params)}`),
  },

  shares: {
    /** Every link in the organisation, scoped to documents you can read. */
    list: (params = {}) => request(`/shares?${qs(params)}`),
    listFor: (documentId) => request(`/shares?documentId=${documentId}`),
    create: (documentId, options) => request('/shares', { method: 'POST', body: { documentId, ...options } }),
    revoke: (id) => request(`/shares/${id}`, { method: 'DELETE' }),
  },

  search: (params) => request(`/search?${qs(params)}`),

  /** Public share consumption — no session involved. */
  publicShare: {
    meta: (token) => request(`/public/shares/${token}`),
    authorize: (token, password, email) =>
      request(`/public/shares/${token}/authorize`, { method: 'POST', body: { password, email } }),
    contentUrl: (token, ticket) =>
      `${BASE}/public/shares/${token}/content?ticket=${encodeURIComponent(ticket)}`,
  },
};

export default api;
