/**
 * What is actually behind each area.
 *
 * The workbench renders eleven areas from the design handoff, and most of them
 * still show the handoff's sample rows. Convincing sample data is a demo
 * hazard: someone clicks Invoices, sees six invoices, and believes them.
 *
 * Three states rather than two, because "the API exists but the screen is not
 * wired" is a different job from "nothing has been built" — the first is a
 * morning's work, the second is a feature.
 *
 * Keep this honest. It is the only thing standing between a prospect and a
 * screen full of fiction.
 */

export const LIVE = 'live';
export const READY = 'endpoint-ready';
export const UNBUILT = 'not-built';

/**
 * Set to true to remove unbuilt areas from the tab strip entirely, rather than
 * showing them marked. Useful before a client demo; leave false while
 * developing so the roadmap stays visible.
 */
export const HIDE_UNBUILT = false;

export const AREA_STATE = {
  home: {
    state: LIVE,
    endpoint: 'GET /api/workflow/tasks · GET /api/audit',
    note: 'Your approvals and the documents you have actually opened. Mentions and saved searches '
      + 'are not built, so they are absent rather than empty.',
  },
  repo: {
    state: LIVE,
    endpoint: 'GET /api/documents · GET /api/folders/tree',
    note: 'Cabinets come from the real folder tree and the list shows real documents, filtered to the selected folder.',
  },
  search: {
    state: LIVE,
    endpoint: 'GET /api/search',
    note: 'Real results, ranked, with the matched phrase quoted from the document body. Scans stay unsearchable until the OCR pipeline runs.',
  },
  capture: {
    state: UNBUILT,
    needs: 'Scanner integration, and the OCR pipeline (Redis, Python OCR sidecar)',
    note: 'Nothing behind this screen. Features 1 and 3.',
  },
  ingest: {
    state: LIVE,
    endpoint: 'GET /api/processing/queue',
    note: 'The real pipeline. Text and PDFs carrying their own text layer are read and indexed '
      + 'within the minute; scans and photographs are failed with that said, because recognising '
      + 'them needs an engine this deployment does not have.',
  },
  invoices: {
    state: UNBUILT,
    needs: 'OCR, then invoice extraction (features 15 and 16)',
    note: 'The data model is complete, including line items with real columns. No extraction runs yet.',
  },
  forms: {
    state: LIVE,
    endpoint: 'GET /api/forms',
    note: 'Real forms. A submission becomes a document in the form’s folder, is indexed so it can '
      + 'be found by its own answers, and starts the workflow the form nominates. Building a form '
      + 'is API-only so far — the screen lists and publishes them.',
  },
  hr: {
    state: LIVE,
    endpoint: 'GET /api/hr/people',
    note: 'Real people and the records that name them, through a person-kind index field. '
      + 'Timesheets, leave and reviews are HR processes rather than documents and are not built.',
  },
  approvals: {
    state: LIVE,
    endpoint: 'GET /api/workflow/tasks',
    note: 'Real tasks from the workflow engine. Filing a document as a type starts whatever '
      + 'matches, approving advances it, and an overdue step escalates hourly to the named '
      + 'alternative. Notifications are not built, so the queue is the only place a task appears.',
  },
  sharing: {
    state: LIVE,
    endpoint: 'GET /api/shares',
    note: 'Real links, filtered by state in the database. Expiry, access codes, download caps and revocation are all enforced server-side.',
  },
  types: {
    state: LIVE,
    endpoint: 'GET /api/document-types',
    note: 'Real types with their real index fields. Defining, publishing and restricting who may '
      + 'file as a type all work.',
  },
  workflows: {
    state: LIVE,
    endpoint: 'GET /api/workflow/definitions',
    note: 'Real definitions from the engine, with what each has in flight. Building one is '
      + 'API-only so far — the screen lists them and shows their steps.',
  },
  audit: {
    state: LIVE,
    endpoint: 'GET /api/audit · GET /api/audit/integrity',
    note: 'Real events, filtered in the database, with the hash chain verified alongside each page.',
  },
  admin: {
    state: LIVE,
    endpoint: 'GET /api/users · /roles · /branches · /organization/hostnames',
    note: 'Personnel, Roles, Branches, Web addresses, Retention policies, Recovery and Support access are live. '
      + 'Classification guardrails and Integrations are still sample.',
  },
};

/** Scopes that are genuinely live, even when their area is only partly so. */
export const LIVE_SCOPES = {
  // Personnel, Roles, Branches, Web addresses — and Support access, which is
  // the tenant's own copy of who from Calm Global has looked inside (PLT-2).
  admin: [0, 1, 2, 3, 6, 7, 8],
};

export function areaState(area) {
  return AREA_STATE[area] ?? { state: UNBUILT, note: 'Unknown area.' };
}

export function isScopeLive(area, scopeIndex) {
  const only = LIVE_SCOPES[area];
  // No entry means the area has no part-live split: if the area is live, every
  // scope in it is. Repository needs this — its scopes are folders, so there is
  // no fixed list of indices to enumerate.
  if (!only) return areaState(area).state === LIVE;
  return only.includes(scopeIndex);
}

/** Short marker shown against a tab. Null when the area is fully live. */
export function tabMarker(area, scopeIndex = null) {
  const { state } = areaState(area);
  if (state === LIVE) {
    // Administration is only partly live, so mark the sample scopes.
    if (scopeIndex !== null && !isScopeLive(area, scopeIndex)) return 'Sample';
    return null;
  }
  return state === READY ? 'Not wired' : 'Sample';
}
