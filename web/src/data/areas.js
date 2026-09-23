/* =============================================================================
   Area configuration for the workbench.

   Eleven areas share one shell; each supplies its own scope list, toolbar
   verbs, column grid, rows, inspector tabs and status counts.

   IMPORTANT: the `rows` here are the handoff's sample data, carried over so the
   UI can be built and reviewed before the API is wired in. Every area that has
   a real endpoint should replace `rows` with a fetch. See TODO markers.

   Row tuple shape (matching the prototype):
     [kind, name, meta, flag, col2, col3, col4]
   ========================================================================== */

export const TABS = [
  ['repo', 'Repository', '1,204'],
  ['search', 'Search', '318'],
  ['capture', 'Capture', '12'],
  ['ingest', 'Ingest', '124'],
  ['invoices', 'Invoices', '64'],
  ['forms', 'E-forms', '12'],
  ['hr', 'HR', '248'],
  ['approvals', 'Approvals', '14'],
  ['sharing', 'Sharing', '6'],
  ['types', 'Types', ''],
  ['audit', 'Audit', ''],
  ['admin', 'Administration', ''],
];

export const CRUMBS = {
  repo: ['Legal', 'Contracts', '2026', 'Vendor', 'Active'],
  search: ['All cabinets', 'Full-text search', '“indemnification cap”'],
  capture: ['Ingest', 'Capture', 'Scanner — 3rd floor'],
  ingest: ['Ingest', 'Batch 2026-08-14-A'],
  invoices: ['Finance', 'Accounts payable', 'August 2026'],
  forms: ['Workflow', 'E-forms', 'Vendor onboarding'],
  hr: ['People', 'Personnel files', 'Active employees'],
  approvals: ['My work', 'Assigned to me'],
  sharing: ['Governance', 'External links'],
  types: ['Governance', 'Document types'],
  audit: ['Governance', 'Event log', 'Last 7 days'],
  admin: ['Governance', 'Administration', 'Personnel'],
};

/* [heading, footnote, items[[label, depth, count]], defaultIndex] */
export const SCOPES = {
  repo: [
    'Cabinets',
    'Folders nest without limit. Locked drawers need a passcode even if your role allows access.',
    [
      ['Legal', 0, '12.4k'],
      ['Contracts', 1, '4.1k'],
      ['2026', 2, '980'],
      ['Vendor', 3, '412'],
      ['Active', 4, '1,204'],
      ['Terminated', 4, '188'],
      ['Employment', 3, '96'],
      ['Litigation', 1, '2.3k'],
      ['Finance', 0, '88.2k'],
      ['Human resources', 0, '19.6k'],
      ['Facilities', 0, '6.0k'],
    ],
    4,
  ],
  search: [
    'Scope',
    'Search covers extracted text, metadata, transcripts and AI-extracted fields.',
    [
      ['All cabinets', 0, '318'],
      ['Legal', 1, '201'],
      ['Finance', 1, '77'],
      ['Human resources', 1, '24'],
      ['Facilities', 1, '16'],
      ['Contracts only', 0, '188'],
      ['Recordings', 0, '12'],
      ['Archived', 0, '41'],
    ],
    0,
  ],
  capture: [
    'Devices',
    'Anything captured here enters the same pipeline as a scanner, with the same naming and classification.',
    [
      ['Scanner — 3rd floor', 0, 'Ready'],
      ['Scanner — reception', 0, 'Busy'],
      ['Mailbox intake', 0, 'Live'],
      ['WhatsApp Business', 0, 'Live'],
      ['Watched folder', 0, 'Live'],
      ['This computer', 0, ''],
      ['Phone camera', 0, ''],
    ],
    0,
  ],
  ingest: [
    'Sources',
    'Scanner, mailbox and WhatsApp intake all land in the same pipeline.',
    [
      ['Scanner — 3rd floor', 0, '62'],
      ['Mailbox intake', 0, '28'],
      ['WhatsApp Business', 0, '14'],
      ['SharePoint sync', 0, '12'],
      ['Watched folder', 0, '8'],
      ['Adobe Acrobat', 0, ''],
    ],
    0,
  ],
  invoices: [
    'Payable',
    'Coding rules were learned from 2,140 previously posted invoices.',
    [
      ['Needs verification', 0, '3'],
      ['Matched to a PO', 0, '41'],
      ['Posted', 0, '18'],
      ['Disputed', 0, '2'],
      ['Paid this year', 0, '1,904'],
    ],
    0,
  ],
  forms: [
    'Forms',
    'Every submission originates a workflow and becomes a searchable record.',
    [
      ['Vendor onboarding', 0, 'Live'],
      ['New hire pack', 0, 'Live'],
      ['Expense claim', 0, 'Live'],
      ['Records request', 0, 'Draft'],
      ['Incident report', 0, 'Draft'],
      ['Archived forms', 0, '1'],
    ],
    0,
  ],
  hr: [
    'People',
    'Personnel files are visible to HR and the employee only. Managers see completeness, never contents.',
    [
      ['Active employees', 0, '248'],
      ['Starters this month', 0, '6'],
      ['Incomplete files', 0, '6'],
      ['Onboarding in flight', 0, '4'],
      ['Timesheets, week 32', 0, '241'],
      ['Leave requests', 0, '12'],
      ['Reviews due', 0, '31'],
      ['Leavers', 0, '3'],
    ],
    0,
  ],
  approvals: [
    'Queues',
    'Queues follow your role, not your inbox.',
    [
      ['Assigned to me', 0, '14'],
      ['My unit', 0, '31'],
      ['Sent by me', 0, '9'],
      ['Overdue', 0, '3'],
      ['Completed', 0, ''],
    ],
    0,
  ],
  sharing: [
    'Links',
    'Every open is written to the audit trail. Revoking takes effect immediately.',
    [
      // The states a link can be in, which is what you act on. Grouping by
      // recipient type was the design's idea; nothing records who holds a link,
      // only which document it opens and who created it.
      ['All links', 0, ''],
      ['Active', 0, ''],
      ['Expired', 0, ''],
      ['Download cap reached', 0, ''],
      ['Revoked', 0, ''],
    ],
    0,
  ],
  types: [
    'Document types',
    'Search filters, retention clocks and automatic indexing all key off these. '
      + 'Changing a field on a published type applies to new records; existing '
      + 'ones keep the values they were filed with.',
    // Mirrors TYPE_SCOPES in useAreaRows. The handoff also offered "starts a
    // workflow", which needs a workflow engine to mean anything — it is left
    // out rather than shown as a filter that can only ever return nothing.
    [
      ['All types', 0, ''],
      ['In use', 0, ''],
      ['Drafts', 0, ''],
      ['Watermarked', 0, ''],
      ['Single edition', 0, ''],
      ['Archived', 0, ''],
    ],
    0,
  ],
  audit: [
    'Filters',
    'Records are write-once. No role, including owner, can alter them.',
    // These mirror AUDIT_SCOPES in useAreaRows: each one is a set of real
    // actions the API can filter on. The handoff also offered "Classification
    // changes", which corresponds to no action the system records, so it is
    // gone rather than present and permanently empty.
    [
      ['All events', 0, ''],
      ['Sign-ins', 0, ''],
      ['Refused sign-ins', 0, ''],
      ['Documents', 0, ''],
      ['Sharing', 0, ''],
      ['Permissions', 0, ''],
      ['Administration', 0, ''],
    ],
    0,
  ],
  admin: [
    'Administration',
    'Single sign-on is enforced. Branches decide who is posted where.',
    [
      ['Personnel', 0, ''],
      ['Roles', 0, ''],
      ['Branches', 0, ''],
      ['Web addresses', 0, ''],
      ['Classification guardrails', 0, '4'],
      ['Integrations', 0, '5'],
      ['Retention policies', 0, '7'],
      ['Recovery and holds', 0, '4'],
      // The tenant's half of PLT-2. It belongs in their own administration
      // rather than in a report we send them: a record of who looked inside
      // their tenancy is only reassuring if they can reach it unprompted.
      ['Support access', 0, ''],
    ],
    0,
  ],
};

export const TOOLBAR = {
  repo: ['Open', 'Check out', 'New folder', 'Move…', 'Classify…', 'Share…'],
  search: ['Open', 'Refine…', 'Save this search', 'Export results'],
  capture: ['Start scan', 'Scan profile…', 'Insert separator', 'Pause', 'Discard'],
  ingest: ['Accept all', 'Review flagged', 'Convert…', 'Rename rule…', 'Cancel batch'],
  invoices: ['Verify', 'Post to ledger', 'Dispute…', 'Open purchase order'],
  forms: ['Edit fields', 'Preview', 'Publish', 'Duplicate', 'Submissions'],
  hr: ['Open file', 'Request documents…', 'Start onboarding', 'Log leave', 'Completeness report'],
  approvals: ['Approve', 'Return', 'Reassign…', 'Open document'],
  sharing: ['New link…', 'Revoke', 'Extend…', 'Copy address'],
  types: ['New type', 'Add field…', 'Publish', 'Archive'],
  audit: ['Export evidence', 'Filter…', 'Legal hold…'],
  admin: ['Add person…', 'Change role…', 'Suspend', 'Reset passcode…', 'Restore…'],
};

/**
 * Toolbar verbs for scopes whose actions differ from their area's default.
 * Offering "Suspend" while a web address is selected is worse than offering
 * nothing — it implies an action that cannot exist.
 */
export const TOOLBAR_BY_SCOPE = {
  admin: {
    1: ['New role…', 'Edit permissions…', 'Duplicate', 'Delete role'],
    2: ['New branch…', 'Post staff…', 'Close branch'],
    3: ['Add address…', 'Verify', 'Make primary', 'Remove'],
  },
};

/** Inspector tabs for scopes that describe a different kind of record. */
export const PANES_BY_SCOPE = {
  admin: {
    2: [['branch', 'Branch'], ['branchstaff', 'Staff']],
    3: [['hostname', 'Address']],
    8: [['support', 'Session']],
  },
};

export const FIND_PLACEHOLDER_BY_SCOPE = {
  admin: {
    1: 'Find a role',
    2: 'Find a branch',
    3: 'Find an address',
    8: 'Find a support session',
  },
};

export const FIND_PLACEHOLDER = {
  admin: 'Find a person',
  hr: 'Find a person',
  types: 'Find a type',
  audit: 'Find an event',
};

/* [label, width] where width 1 means minmax(0, 1fr) */
export const COLS = {
  // 'Owner' rather than 'Access': the document list does not carry the
  // caller's effective level, and computing it per row would be one request
  // each. The inspector's Access tab answers it properly for the selected row.
  repo: [['Document', 1], ['Class', 124], ['Last edited', 144], ['Owner', 110]],
  search: [['Result', 1], ['Class', 124], ['Where', 180], ['Edited', 110]],
  capture: [['Captured item', 1], ['Pages', 86], ['Quality', 150], ['Status', 110]],
  ingest: [['Incoming file', 1], ['Proposed name', 210], ['Destination', 150], ['Status', 96]],
  invoices: [['Invoice', 1], ['Amount', 110], ['Match', 140], ['Due', 100]],
  forms: [['Field', 1], ['Type', 110], ['Validation', 160], ['Maps to', 150]],
  hr: [['Employee', 1], ['File', 120], ['Unit', 130], ['Updated', 120]],
  approvals: [['Item', 1], ['Stage', 150], ['From', 140], ['Due', 96]],
  sharing: [['Link', 1], ['Rights', 120], ['Expires', 130], ['Opens', 80]],
  types: [['Document type', 1], ['Fields', 90], ['Retention', 168], ['In use', 118]],
  audit: [['Event', 1], ['Result', 110], ['Actor', 160], ['When', 132]],
  admin: [['Person', 1], ['Role', 150], ['Unit', 130], ['Last active', 120]],
};

/**
 * Column overrides for scopes whose rows are a different shape from their
 * area's default. Administration lists people, then branches, then web
 * addresses — three different records that cannot share one grid.
 */
export const COLS_BY_SCOPE = {
  admin: {
    1: [['Role', 1], ['Key', 150], ['People', 90], ['Permissions', 120]],
    2: [['Branch', 1], ['Code', 90], ['People', 90], ['Reports to', 150]],
    3: [['Web address', 1], ['Status', 130], ['Role', 120], ['Added', 120]],
    8: [['Why they asked', 1], ['State', 110], ['Scope', 120], ['Asked', 100]],
  },
};

/* TODO(api): repo -> GET /api/documents, sharing -> GET /api/shares,
   audit -> GET /api/audit, admin -> GET /api/users. The rest await their
   modules. Until then these are the handoff's sample rows. */
export const ROWS = {
  repo: [
    ['PDF', 'MSA_Northwind_2026-08-01_v3.2.pdf', 'Version 3.2 · 18 pages · signed by 1 of 2', 'Checked out', 'Confidential', '2 minutes ago · you', 'Modify'],
    ['PDF', 'SOW_Northwind_Freight-Regional.pdf', 'Version 1.4 · 9 pages · linked to the MSA', '', 'Confidential', 'Today, 08:14', 'Modify'],
    ['DOC', 'Amendment-01_liability-cap.docx', 'Version 0.7 · two people editing now', 'Live', 'Confidential', 'A moment ago', 'Modify'],
    ['PDF', 'NDA_Northwind_mutual_2026.pdf', 'Version 2.0 · executed, certificate attached', '', 'Restricted', '12 August', 'Read only'],
    ['XLS', 'Rate-card_Northwind_2026H2.xlsx', 'Version 1.1 · line items indexed', '', 'Internal', '11 August', 'Modify'],
    ['MP4', 'Negotiation-call_2026-08-05.mp4', '48 minutes · transcript searchable', '', 'Confidential', '5 August', 'Read only'],
    ['MP3', 'Vendor-briefing_2026-07-28.mp3', '22 minutes · transcript searchable', '', 'Internal', '28 July', 'Read only'],
    ['PDF', 'Insurance-certificate_Northwind.pdf', 'Expires 31 December 2026 · reminder set', '', 'Internal', '14 July', 'Read only'],
    ['TIF', 'Signed-original_scanned-bundle.tiff', '62 pages · archival master, write-once', 'Locked', 'Restricted', '2 July', 'No access'],
  ],
  search: [
    ['PDF', 'MSA_Northwind_2026-08-01_v3.2.pdf', '“…shall not exceed the indemnification cap of twelve (12) months of fees…”', '1.00', 'Confidential', 'Legal / Contracts / Vendor', '2 min ago'],
    ['DOC', 'Amendment-01_liability-cap.docx', '“…agree to amend the indemnification cap set out in Section 11.2…”', '0.94', 'Confidential', 'Legal / Contracts / Vendor', 'Today'],
    ['MP4', 'Negotiation-call_2026-08-05.mp4', '“…at 32:18 — we can live with the indemnification cap if notice stays at ninety days…”', '0.88', 'Confidential', 'Legal / … / Recordings', '5 Aug'],
    ['PDF', 'Policy_Contracting-standards_v6.pdf', '“…above $250,000 requires an indemnification cap approved by the General Counsel…”', '0.81', 'Internal', 'Legal / Policies', '19 Jun'],
    ['TIF', 'Signed-original_scanned-bundle.tiff', '“…page 44, handwritten margin note beside the indemnification cap clause…”', '0.76', 'Restricted', 'Legal / … / Archive', '2 Jul'],
  ],
  capture: [
    ['PDF', 'MSA bundle, sheets 1 to 18', 'Scanner — 3rd floor · duplex · colour', '', '18', 'Deskewed, 300 dpi', 'Captured'],
    ['PDF', 'Insurance certificate', 'Scanner — 3rd floor · single sided', '', '2', 'Deskewed, 300 dpi', 'Captured'],
    ['PDF', 'Delivery notes, August', 'WhatsApp · from the Harbor Way team', '', '6', 'Photo, corrected', 'Captured'],
    ['PDF', 'Signed NDA, R. Tan', 'Mailbox · attachment from HR', '', '4', 'Native text', 'Captured'],
    ['PDF', 'Timesheets, week 32', 'Scanner — reception · handwriting', 'Review', '11', 'Handwriting, 71%', 'Verify'],
    ['PDF', 'Rate card, H2', 'This computer · dragged in', '', '3', 'Native text', 'Captured'],
    ['PDF', 'Sheet 7', 'Scanner — 3rd floor · blank page', 'Rescan', '1', 'Blank detected', 'Rescan'],
    ['PDF', 'Sheet 11', 'Scanner — 3rd floor · skew 14 degrees', 'Rescan', '1', 'Beyond correction', 'Rescan'],
  ],
  ingest: [
    ['PDF', 'IMG_4471.pdf', 'Scanner · 18 pages · 300 dpi', '', 'MSA_Northwind_2026-08-01_v3.2.pdf', 'Legal / Vendor / Active', 'Filed'],
    ['TIF', 'scan0093.tif', 'Scanner · invoice, matched to a PO', '', 'INV_Northwind_90412_2026-08-02.pdf', 'Finance / Payable / Aug', 'Filed'],
    ['PDF', 'WhatsApp-doc-2.pdf', 'WhatsApp · low text confidence on page 2', 'Review', 'DeliveryNote_Harbor_2026-08-03.pdf', 'Finance / Payable / Aug', 'Review'],
    ['TIF', 'batch_0041.tif', 'Scanner · signature block detected', '', 'NDA_ContractorTan_2026-07-30.pdf', 'Legal / Employment', 'Filed'],
    ['PDF', 'CamScanner-08-14.pdf', 'Mailbox · handwriting, 71% confidence', 'Review', 'Timesheet_Facilities_W32.pdf', 'Human resources / Timesheets', 'Review'],
    ['M4A', 'recording_88.m4a', 'Mailbox · diarised, transcript indexed', '', 'BoardCall_2026-08-11.m4a', 'Governance / Board', 'Indexed'],
    ['PDF', 'unknown_0012.pdf', 'Watched folder · no classifier match', 'Blocked', '—', 'Unfiled', 'Blocked'],
  ],
  invoices: [
    ['PDF', 'INV_Northwind_90412.pdf', 'Northwind Logistics · 6 line items · PO-77120', 'Review', '$48,912.40', 'Variance', '30 August'],
    ['PDF', 'INV_HarborFreight_2210.pdf', 'Harbor Freight · 3 line items · PO-77104', '', '$12,480.00', 'Matched', '28 August'],
    ['PDF', 'INV_Ikeja-Facilities_0088.pdf', 'Ikeja Facilities · 8 line items · PO-76980', '', '$7,315.60', 'Matched', '24 August'],
    ['PDF', 'INV_ClearScan_4471.pdf', 'ClearScan Services · 2 line items', 'Review', '$3,900.00', 'Variance', '22 August'],
    ['PDF', 'INV_Northwind_90388.pdf', 'Northwind Logistics · 5 line items · PO-77002', '', '$31,204.80', 'Matched', '18 August'],
    ['PDF', 'INV_AdeBrokers_1120.pdf', 'Ade & Co Brokers · 1 line item', '', '$2,150.00', 'Matched', '15 August'],
  ],
  forms: [
    ['TXT', 'Legal entity name', 'Full registered name as it appears on the certificate', 'Required', 'Short text', 'Not empty', 'Counterparty.Name'],
    ['NUM', 'Tax identification number', 'United States employer identification number', '', 'Number', 'US EIN, ##-#######', 'Counterparty.TaxID'],
    ['CUR', 'Contract value', 'Total committed spend over the initial term', '', 'Currency', 'USD, above zero', 'Contract.Value'],
    ['DAT', 'Requested start date', 'Procurement needs ten working days notice', '', 'Date', 'Not in the past', 'Contract.Effective'],
    ['FIL', 'Supporting documents', 'W-9 and a current insurance certificate', 'Required', 'File upload', 'Two files minimum', 'Attachments'],
    ['SEL', 'Risk tier', 'Sets the approval route automatically', '', 'Dropdown', 'One of four tiers', 'Workflow.Route'],
    ['SIG', 'Authorised signatory', 'Signed by an officer of the company', 'Required', 'Signature', 'Drawn or certificate', 'Signatory'],
  ],
  hr: [
    ['SN', 'Sade Njoku', 'Records Assistant · started 1 August 2026', 'Incomplete', '7 of 9', 'Human resources', '12 August'],
    ['KA', 'Kofi Adjei', 'Logistics Coordinator · started 3 August 2026', 'Incomplete', '8 of 9', 'Facilities', '11 August'],
    ['RT', 'Rachel Tan', 'Legal Counsel · started 12 January 2024', '', '9 of 9', 'Legal', '2 July'],
    ['JM', 'Joseph Mensah', 'Financial Controller · started 4 March 2022', '', '9 of 9', 'Finance', '19 June'],
    ['LB', 'Lara Bello', 'Facilities Manager · probation ends 1 September', 'Review due', '9 of 9', 'Facilities', '8 August'],
    ['IE', 'Ifeoma Eze', 'Legal Counsel · parental leave to 4 January', '', '9 of 9', 'Legal', '30 July'],
    ['TO', 'Tunde Ogun', 'Maintenance Technician · leaver, 31 August', 'Exit pack', '6 of 9', 'Facilities', 'Today'],
    ['AB', 'Adaeze Balogun', 'Records Analyst · starts 1 September', 'Onboarding', '2 of 9', 'Human resources', 'Today'],
  ],
  approvals: [
    ['PDF', 'Northwind MSA, version 3.2', 'Liability cap raised from 6 to 12 months', 'Overdue', 'Counter-signature, 3 of 4', 'R. Tan', 'Today'],
    ['XLS', 'Invoice batch 2026-08-A', '41 items · 3 below the confidence floor', 'Overdue', 'Finance verification, 2 of 3', 'Ingest pipeline', 'Today'],
    ['DOC', 'Retention policy, Finance unit', 'Classification changes for 1,204 records', '', 'Records review, 1 of 3', 'Legal Operations', 'In 2 days'],
    ['PDF', 'Contractor NDA, R. Tan', 'Standard template, no deviations', '', 'Signature, 2 of 2', 'Human resources', 'In 4 days'],
    ['PDF', 'Facilities lease renewal, Ikeja', 'Five-year term · rent review clause', '', 'Legal review, 1 of 4', 'Facilities', 'In 6 days'],
    ['FRM', 'Vendor onboarding, Harbor Freight', 'E-form submission with 2 attachments', '', 'Procurement approval, 1 of 3', 'E-form intake', 'In 8 days'],
  ],
  sharing: [
    ['PDF', 'MSA_Northwind_v3.2.pdf', 'cv.link/9fq2 · watermarked, no download', '', 'View only', '21 August', '4'],
    ['XLS', 'Rate-card_Northwind_2026H2.xlsx', 'cv.link/k18b · three named recipients', '', 'Download', 'In 7 days', '11'],
    ['PDF', 'Insurance-certificate.pdf', 'cv.link/p04m · broker, Ade & Co', '', 'Download', '31 December', '2'],
    ['ZIP', 'Audit-pack_Q2-2026.zip', 'cv.link/x772 · external auditor', '', 'View only', '24 August', '38'],
    ['PDF', 'NDA_ContractorTan_2026.pdf', 'cv.link/t551 · signature requested', '', 'Sign', '48 hours', '1'],
    ['PDF', 'Board-minutes_2026-07.pdf', 'cv.link/b903 · revoked by you', 'Revoked', 'View only', 'Revoked', '19'],
  ],
  audit: [
    ['EVT', 'Checked out MSA Northwind v3.2 for editing', 'Web · Lagos · 41.58.···', '', 'Allowed', 'Amina Okoro', '14 Aug 09:41'],
    ['EVT', 'Applied e-signature, certificate CG-SIG-88412', 'Web · Lagos', '', 'Allowed', 'Amina Okoro', '14 Aug 09:12'],
    ['EVT', 'Attempted download of a confidential record', 'Share link · Portland', 'Blocked', 'Blocked', 'd.kowalski@northwind.com', '12 Aug 16:44'],
    ['EVT', 'Opened share link cv.link/9fq2, read for 6m 12s', 'Share link · Portland', '', 'Allowed', 'd.kowalski@northwind.com', '12 Aug 16:41'],
    ['EVT', 'Re-indexed 3 clauses and updated extracted fields', 'Indexing service', '', 'System', 'Indexing service', '12 Aug 14:06'],
    ['EVT', 'Requested access to Legal / Contracts', 'Web · Lagos', 'Denied', 'Denied', 'Joseph Mensah', '11 Aug 17:22'],
    ['EVT', 'Raised classification from internal to confidential', 'Web · Lagos', '', 'Allowed', 'Amina Okoro', '11 Aug 09:30'],
    ['EVT', 'Restored 4 records from the recycle bin', 'Web · Abuja', '', 'Allowed', 'Sade Njoku', '10 Aug 15:12'],
    ['EVT', 'Applied a 7-year retention hold to 1,204 contracts', 'Retention service', '', 'System', 'Retention service', '10 Aug 08:00'],
  ],
  admin: [
    ['AO', 'Amina Okoro', 'a.okoro@calmglobal.com', '', 'Records Manager', 'Legal', 'Now'],
    ['RT', 'Rachel Tan', 'r.tan@calmglobal.com', '', 'Legal Counsel', 'Legal', '8 minutes ago'],
    ['JM', 'Joseph Mensah', 'j.mensah@calmglobal.com', '', 'Finance', 'Finance', '1 hour ago'],
    ['LB', 'Lara Bello', 'l.bello@calmglobal.com', '', 'Contributor', 'Facilities', 'Yesterday'],
    ['SN', 'Sade Njoku', 's.njoku@calmglobal.com', 'Invited', 'Contributor', 'Human resources', 'Pending'],
    ['DK', 'Daniel Kowalski', 'd.kowalski@northwind.com', 'External', 'External', 'Northwind', '12 August'],
    ['IE', 'Ifeoma Eze', 'i.eze@calmglobal.com', '', 'Legal Counsel', 'Legal', '3 days ago'],
    ['TO', 'Tunde Ogun', 't.ogun@calmglobal.com', 'Suspended', 'Contributor', 'Facilities', '19 July'],
  ],
};

export const PANES = {
  repo: [['preview', 'Preview'], ['summary', 'Summary'], ['edit', 'Edit'], ['history', 'Versions'], ['access', 'Access']],
  search: [['summary', 'Summary'], ['preview', 'Preview'], ['details', 'Match']],
  capture: [['details', 'Scan profile'], ['preview', 'Preview'], ['convert', 'Convert']],
  ingest: [['details', 'Extracted'], ['redact', 'Redact'], ['convert', 'Convert']],
  invoices: [['lines', 'Line items'], ['details', 'Match'], ['preview', 'Record']],
  forms: [['form', 'Form'], ['details', 'Field'], ['route', 'Route']],
  hr: [['hrfile', 'Employee file'], ['details', 'Person'], ['route', 'Onboarding']],
  approvals: [['route', 'Approval'], ['diff', 'Changes'], ['preview', 'Preview']],
  sharing: [['access', 'Link'], ['details', 'Attention'], ['preview', 'Preview']],
  types: [['fields', 'Fields'], ['details', 'Type'], ['access', 'Who can file it']],
  audit: [['details', 'Event'], ['compliance', 'Compliance'], ['access', 'Actor']],
  admin: [['caps', 'Capabilities'], ['details', 'Person'], ['integrations', 'Integrations'], ['recovery', 'Recovery']],
};

export const STATUS = {
  repo: ['1,204 items', '1 selected', '7 of 9 named automatically', '90-day recovery window'],
  search: ['318 results', '0.42 seconds', 'Scope: all cabinets', 'Transcripts included'],
  capture: ['12 items captured', '1 needs a rescan', 'Profile: contract bundle, 300 dpi'],
  ingest: ['124 files', '1,908 pages', '68% complete', '3 flagged for review'],
  invoices: ['64 open invoices', '3 need verification', '$1.2M matched this month'],
  forms: ['7 fields', '12 forms live', '418 submissions this year'],
  hr: ['248 personnel files', '6 incomplete', '2 starters this week'],
  approvals: ['14 assigned', '3 overdue', '31 in your unit'],
  sharing: ['6 active links', '1 revoked', '75 opens recorded'],
  types: ['14 types', '12 in use', '3 watermarked'],
  audit: ['2,104 events today', '2 access denials', 'Write-once storage'],
  admin: ['248 people', '6 invitations pending', 'Single sign-on enforced'],
};

export const BULK = {
  // Share and Export are gone rather than inert. A share link carries exactly
  // one document, so "share six things" has no meaning at the API and would
  // have to invent one; Export has no endpoint at all. A button that does
  // nothing is worse than an absent one.
  repo: ['Classify…', 'Move…', 'Delete'],
  capture: ['Rescan', 'Accept', 'Assign profile…', 'Discard'],
  ingest: ['Accept', 'Review…', 'Change destination…', 'Reject'],
  invoices: ['Verify', 'Post…', 'Dispute', 'Export…'],
  forms: ['Make required', 'Change type…', 'Remove'],
  hr: ['Request documents…', 'Assign onboarding…', 'Export…'],
  approvals: ['Approve', 'Return', 'Reassign…'],
  sharing: ['Extend…', 'Revoke', 'Copy addresses'],
  types: ['Publish', 'Archive'],
  audit: ['Export selection', 'Add to evidence pack'],
  admin: ['Change role…', 'Suspend', 'Resend invitation'],
};

/* Scope predicates: which rows survive when scope N is selected. */
export const SCOPE_FILTERS = {
  repo: {
    5: (r) => /terminat|archival|Coastal/i.test(r[1] + r[2]),
    6: (r) => /NDA|Contractor|Timesheet/i.test(r[1]),
    7: (r) => /scanned-bundle|Negotiation|briefing/i.test(r[1]),
    8: (r) => /Rate-card|Insurance|INV/i.test(r[1]),
    9: (r) => /Timesheet|NDA/i.test(r[1]),
    10: (r) => /Insurance|Rate-card/i.test(r[1]),
  },
  capture: {
    1: (r) => /reception/.test(r[2]),
    2: (r) => /Mailbox/.test(r[2]),
    3: (r) => /WhatsApp/.test(r[2]),
    4: (r) => /Watched/.test(r[2]),
    5: (r) => /This computer/.test(r[2]),
    6: (r) => /camera/.test(r[2]),
  },
  ingest: {
    0: (r) => /Scanner/.test(r[2]),
    1: (r) => /Mailbox/.test(r[2]),
    2: (r) => /WhatsApp/.test(r[2]),
    3: (r) => /SharePoint/.test(r[2]),
    4: (r) => /Watched/.test(r[2]),
    5: () => false,
  },
  invoices: {
    0: (r) => r[3] === 'Review',
    1: (r) => r[5] === 'Matched',
    2: (r) => /90388|2210/.test(r[1]),
    3: (r) => r[3] === 'Review',
    4: (r) => /1120|0088/.test(r[1]),
  },
  approvals: {
    2: (r) => /Retention|lease/i.test(r[1]),
    3: (r) => r[3] === 'Overdue',
    4: () => false,
  },
  // Sharing and Audit have no client-side predicates: the API filters both in
  // the database, by link state and by action. Matching again on the rendered
  // text would filter twice and throw away rows the server had already
  // selected correctly — which is precisely what the old sample predicates
  // here did, since they looked for names like "Kowalski" that exist only in
  // the handoff's rows.
  hr: {
    1: (r) => /started 1 August|3 August|starts 1 September/.test(r[2]),
    2: (r) => r[3] === 'Incomplete',
    3: (r) => r[3] === 'Onboarding',
    4: () => false,
    5: () => false,
    6: (r) => r[3] === 'Review due',
    7: (r) => r[3] === 'Exit pack',
  },
  admin: { 1: () => true, 2: () => true, 3: () => true, 4: () => true, 5: () => true },
};

/* Chip colour by label. Blue means interaction or AI/system, green allowed,
   ochre attention or confidential, red blocked or restricted. */
const CHIP_CLASS = {
  Confidential: 'ochre',
  Restricted: 'red',
  Blocked: 'red',
  Denied: 'red',
  Revoked: 'red',
  Allowed: 'green',
  Matched: 'green',
  Published: 'green',
  Filed: 'green',
  'View only': 'green',
  System: 'blue',
  Sign: 'blue',
  Indexed: 'blue',
  Variance: 'ochre',
  Review: 'ochre',
  Internal: '',
  Download: '',
  Draft: '',
};

export function chipClass(label) {
  return CHIP_CLASS[label] ?? null;
}

/** Row-flag colouring: red for hard stops, ochre for attention, else blue. */
export function flagClass(flag) {
  if (['Blocked', 'Revoked', 'Denied', 'Suspended'].includes(flag)) return 'red';
  if (['Review', 'Locked', 'Overdue', 'Invited'].includes(flag)) return 'ochre';
  return 'blue';
}

export const DETAIL_NOTES = {
  repo: 'Two clauses deviate from the standard template. Open the comparison to review them side by side.',
  search: 'This phrase also appears in a recording transcript, which cannot be redacted automatically.',
  capture: 'Page 7 came through blank and page 11 is skewed beyond correction. Both are queued for a rescan before this batch moves on.',
  ingest: 'Handwriting on page 12 was read at 71% confidence and is queued for human review.',
  invoices: 'The detention charge sits $860 above the contracted rate. Verification is required before posting.',
  forms: 'Changing validation on a published field applies to new submissions only. Existing records keep their values.',
  hr: 'Two items are outstanding on this file. Chasers go out automatically and are logged like any other action.',
  approvals: 'The liability change exceeds your unit’s standing authority and will also require the General Counsel.',
  sharing: 'Counsel spent 2m 48s on page 4, the liability cap. That is likely the negotiation point.',
  audit: 'This actor has two blocked attempts in the last 7 days. Consider reviewing their clearance.',
  admin: 'Suspending a person preserves their audit history and revokes every active session and share link.',
};

export const DETAILS = {
  repo: [
    ['Extracted by intelligent indexing', [['Counterparty', 'Northwind Logistics LLC', '99%'], ['Effective date', '1 September 2026', '98%'], ['Term', '36 months', '97%'], ['Liability cap', '12 months of fees', '94%'], ['Governing law', 'Delaware', '99%']]],
    ['Record', [['Document type', 'Master services agreement', ''], ['Classification', 'Confidential', ''], ['Retention', '7 years from execution', ''], ['Origin', 'E-form intake, 1 August', '']]],
  ],
  search: [['Match detail', [['Relevance', '1.00, exact phrase', ''], ['Occurrences', '4 across 18 pages', ''], ['Found in', 'OCR text layer', ''], ['Pages', '4, 11, 12 and 17', '']]]],
  capture: [
    ['Scan profile', [['Name', 'Contract bundle', ''], ['Resolution', '300 dpi', ''], ['Colour', 'Colour, auto-detect', ''], ['Sides', 'Duplex', ''], ['Separator', 'Barcode sheet splits records', ''], ['Blank pages', 'Removed automatically', '']]],
    ['On capture', [['OCR', 'Immediately, searchable PDF/A', ''], ['Classify', 'From content, 92% floor', ''], ['Name', 'Learned convention', ''], ['Destination', 'Proposed, you confirm', '']]],
  ],
  ingest: [
    ['Extraction', [['Document type', 'Master services agreement', '96%'], ['Counterparty', 'Northwind Logistics LLC', '99%'], ['Effective date', '1 September 2026', '98%'], ['Proposed folder', 'Legal / Vendor / Active', '95%']]],
    ['Quality', [['Pages', '18, deskewed', ''], ['Text confidence', '98.4% average', ''], ['Handwriting', 'Detected on page 12', ''], ['Personal data', 'None found', '']]],
  ],
  invoices: [
    ['Three-way match', [['Purchase order', 'PO-77120, matched', ''], ['Goods receipt', 'GR-44018, matched', ''], ['Contracted rate', '$220 per detention hour', ''], ['Variance', '$860 above contract', '']]],
    ['Coding', [['Vendor', 'Northwind Logistics LLC', '99%'], ['Cost centre', 'Logistics, Zone 2', '97%'], ['Tax treatment', 'Zero-rated freight', '95%']]],
  ],
  forms: [['Selected field', [['Field name', 'tax_id', ''], ['Type', 'Number', ''], ['Validation', 'US EIN, ##-#######', ''], ['Required', 'Yes', ''], ['Maps to index', 'Counterparty.TaxID', ''], ['Visible to', 'Procurement, Finance, Legal', '']]]],
  hr: [
    ['Employee', [['Name', 'Sade Njoku', ''], ['Role', 'Records Assistant', ''], ['Unit', 'Human resources', ''], ['Started', '1 August 2026', ''], ['Manager', 'Amina Okoro', ''], ['Probation ends', '1 November 2026', '']]],
    ['File', [['Documents', '7 of 9 complete', ''], ['Restricted to', 'HR and the employee', ''], ['Retention', '6 years after leaving', ''], ['Last update', '12 August, by HR', '']]],
  ],
  approvals: [['Change summary', [['Liability cap', '6 → 12 months of fees', ''], ['Notice period', 'Unchanged, 90 days', ''], ['Other edits', 'Two typographic', '']]]],
  sharing: [['Recipient attention', [['Total time', '6m 12s', ''], ['Longest page', 'Page 4, 2m 48s', ''], ['Opens', '4, last on 13 August', ''], ['Downloads', '0, blocked by policy', '']]]],
  audit: [['Event', [['Action', 'Download attempt', ''], ['Result', 'Blocked by classification', ''], ['Origin', 'Share link, Portland OR', ''], ['Address', '72.14.···', ''], ['Record', 'MSA_Northwind_v3.2.pdf', '']]]],
  admin: [['Person', [['Name', 'Amina Okoro', ''], ['Role', 'Records Manager', ''], ['Unit', 'Legal', ''], ['Sign-in', 'Single sign-on, Okta', ''], ['Devices', '2 trusted, 1 offline cache', ''], ['Joined', '4 March 2023', '']]]],
};

/* [rows[[who, scope, right, chipKey]], note, actions[]] */
export const ACCESS = {
  repo: [
    [['Legal team', 'Inherited from the unit', 'Modify', 'Allowed'], ['Finance team', 'Inherited from the unit', 'No access', 'Blocked'], ['Amina Okoro', 'Granted directly', 'Owner', 'Internal'], ['D. Kowalski, Northwind', 'Shared link, expires 21 August', 'View only', 'Confidential']],
    'Confidential records cannot be downloaded by external recipients. Sharing to a role without clearance is refused rather than warned.',
    ['Share link…', 'Set passcode…'],
  ],
  search: [
    [['Legal team', 'Inherited from the unit', 'Modify', 'Allowed'], ['Finance team', 'No clearance for confidential', 'No access', 'Blocked'], ['You', 'Records Manager', 'Owner', 'Internal']],
    'Results you cannot open are hidden from this list entirely, not shown as locked rows.',
    ['Request access…'],
  ],
  sharing: [
    [['Recipient', 'd.kowalski@northwind.com', 'View only', 'View only'], ['Watermark', 'Recipient name and timestamp', 'On', 'Allowed'], ['Passcode', 'Not required', 'Off', 'Internal'], ['Expiry', '21 August, 17:00 GMT+1', '7 days', 'Internal']],
    'This record is confidential, so download is refused for external recipients. The link will be issued view-only.',
    ['Create and copy', 'Send by WhatsApp', 'Revoke'],
  ],
  audit: [
    [['Joseph Mensah', 'Finance · Lagos', 'Finance', 'Internal'], ['Clearance', 'No confidential access', 'Blocked', 'Blocked'], ['Attempts', '2 blocked in 7 days', 'Review', 'Review'], ['Manager', 'Rachel Tan notified', 'Sent', 'Allowed']],
    'Repeated denials are surfaced to the records manager weekly. No document content was exposed.',
    ['Open actor history', 'Adjust role…'],
  ],
  admin: [
    [['Web, Lagos', 'Chrome · current session', 'Active', 'Allowed'], ['iOS, Lagos', 'Offline cache, 41 documents', 'Trusted', 'Internal'], ['Windows, Accra', 'Last seen 8 August', 'Trusted', 'Internal'], ['Unknown device', 'Blocked at sign-in, 2 August', 'Blocked', 'Blocked']],
    'Revoking a session also clears the offline cache on that device at its next connection.',
    ['Revoke all sessions', 'Reset passcode…'],
  ],
};

/** Fallback identity, used only if the workbench somehow renders without a session. */
export const CURRENT_USER = {
  name: 'Amina Okoro',
  email: 'a.okoro@calmglobal.com',
  role: 'Records Manager',
  initials: 'AO',
};
