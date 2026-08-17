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
  repo: {
    state: READY,
    endpoint: 'GET /api/documents · GET /api/folders/tree',
    note: 'Documents, folders, versions, upload and the recycle bin all work and are verified. The screen still renders sample rows.',
  },
  search: {
    state: READY,
    endpoint: 'GET /api/search',
    note: 'Full-text and metadata search work, permission-scoped. Content search needs the OCR pipeline before scans are searchable.',
  },
  capture: {
    state: UNBUILT,
    needs: 'Scanner integration, and the OCR pipeline (Redis, Python OCR sidecar)',
    note: 'Nothing behind this screen. Features 1 and 3.',
  },
  ingest: {
    state: UNBUILT,
    needs: 'The processing queue; WhatsApp and email intake exist but do not surface here yet',
    note: 'Channel intake works at the API level — this screen is not connected to it.',
  },
  invoices: {
    state: UNBUILT,
    needs: 'OCR, then invoice extraction (features 15 and 16)',
    note: 'The data model is complete, including line items with real columns. No extraction runs yet.',
  },
  forms: {
    state: UNBUILT,
    needs: 'A form builder (feature 17)',
    note: 'FormDefinition and FormSubmission exist in the schema only.',
  },
  hr: {
    state: UNBUILT,
    needs: 'HR document handling on top of document types (feature 16)',
    note: 'Blocked behind user-defined document types.',
  },
  approvals: {
    state: UNBUILT,
    needs: 'Workflow engine and notifications (features 11 and 13)',
    note: 'Workflow tables exist; nothing drives them.',
  },
  sharing: {
    state: READY,
    endpoint: 'GET /api/shares',
    note: 'Share links work fully — expiry, access codes, download caps, revocation and reading analytics are all verified.',
  },
  audit: {
    state: READY,
    endpoint: 'GET /api/audit',
    note: 'The hash-chained trail works and the database refuses to alter it. The screen is not wired.',
  },
  admin: {
    state: LIVE,
    endpoint: 'GET /api/users · /roles · /branches · /organization/hostnames',
    note: 'Personnel, Roles, Branches and Web addresses are live. The remaining scopes are still sample.',
  },
};

/** Scopes that are genuinely live, even when their area is only partly so. */
export const LIVE_SCOPES = {
  admin: [0, 1, 2, 3],
};

export function areaState(area) {
  return AREA_STATE[area] ?? { state: UNBUILT, note: 'Unknown area.' };
}

export function isScopeLive(area, scopeIndex) {
  return (LIVE_SCOPES[area] ?? []).includes(scopeIndex);
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
