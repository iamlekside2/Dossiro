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
  },

  documents: {
    list: (params = {}) => request(`/documents?${qs(params)}`),
    get: (id) => request(`/documents/${id}`),
    versions: (id) => request(`/documents/${id}/versions`),
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
