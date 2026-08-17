import { AccessLevel, Classification, UserTier } from '../db';

/**
 * Coarse, org-wide capabilities. These answer "may this user do X at all?".
 * Per-object rights (may this user read *this* folder) are AccessLevel, not
 * these - see AccessService.
 */
export const PERMISSIONS = {
  DOCUMENT_CREATE: 'document:create',
  DOCUMENT_DELETE: 'document:delete',
  DOCUMENT_PURGE: 'document:purge',
  DOCUMENT_RESTORE: 'document:restore',

  FOLDER_CREATE: 'folder:create',
  FOLDER_MANAGE: 'folder:manage',

  SHARE_CREATE: 'share:create',
  SHARE_EXTERNAL: 'share:external',
  SHARE_MANAGE_ALL: 'share:manage_all',

  ACCESS_GRANT: 'access:grant',

  WORKFLOW_DEFINE: 'workflow:define',
  WORKFLOW_START: 'workflow:start',

  SIGNATURE_REQUEST: 'signature:request',

  FORM_DEFINE: 'form:define',

  AUDIT_READ: 'audit:read',
  AUDIT_EXPORT: 'audit:export',

  USER_MANAGE: 'user:manage',
  ROLE_MANAGE: 'role:manage',
  SETTINGS_MANAGE: 'settings:manage',
  RETENTION_MANAGE: 'retention:manage',
  LEGAL_HOLD_MANAGE: 'legal_hold:manage',

  INTEGRATION_MANAGE: 'integration:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL = Object.values(PERMISSIONS) as Permission[];

/** Seeded system roles. Org admins may add custom roles on top of these. */
export const SYSTEM_ROLES: Record<
  string,
  { name: string; tier: UserTier; permissions: Permission[]; description: string }
> = {
  system_admin: {
    name: 'System Administrator',
    tier: UserTier.SYSTEM_ADMIN,
    description: 'Full control including purge and audit export.',
    permissions: ALL,
  },
  org_admin: {
    name: 'Organisation Administrator',
    tier: UserTier.ORG_ADMIN,
    description: 'Manages users, roles, folders and policy. Cannot purge held records.',
    permissions: ALL.filter((p) => p !== PERMISSIONS.DOCUMENT_PURGE),
  },
  manager: {
    name: 'Manager',
    tier: UserTier.MANAGER,
    description: 'Runs a department: approves, shares externally, grants access.',
    permissions: [
      PERMISSIONS.DOCUMENT_CREATE,
      PERMISSIONS.DOCUMENT_DELETE,
      PERMISSIONS.DOCUMENT_RESTORE,
      PERMISSIONS.FOLDER_CREATE,
      PERMISSIONS.FOLDER_MANAGE,
      PERMISSIONS.SHARE_CREATE,
      PERMISSIONS.SHARE_EXTERNAL,
      PERMISSIONS.ACCESS_GRANT,
      PERMISSIONS.WORKFLOW_START,
      PERMISSIONS.SIGNATURE_REQUEST,
      PERMISSIONS.AUDIT_READ,
    ],
  },
  contributor: {
    name: 'Contributor',
    tier: UserTier.CONTRIBUTOR,
    description: 'Uploads and edits documents, shares internally.',
    permissions: [
      PERMISSIONS.DOCUMENT_CREATE,
      PERMISSIONS.DOCUMENT_DELETE,
      PERMISSIONS.FOLDER_CREATE,
      PERMISSIONS.SHARE_CREATE,
      PERMISSIONS.WORKFLOW_START,
    ],
  },
  viewer: {
    name: 'Viewer',
    tier: UserTier.VIEWER,
    description: 'Read-only across whatever has been granted.',
    permissions: [],
  },
  external: {
    name: 'External Party',
    tier: UserTier.EXTERNAL,
    description: 'Client or partner. Only sees explicitly shared items (feature 18).',
    permissions: [],
  },
};

/** Ordered weakest to strongest, so comparisons are a simple index lookup. */
const LEVEL_ORDER: AccessLevel[] = [
  AccessLevel.NONE,
  AccessLevel.READ,
  AccessLevel.DOWNLOAD,
  AccessLevel.WRITE,
  AccessLevel.APPROVE,
  AccessLevel.MANAGE,
  AccessLevel.OWNER,
];

export function levelRank(level: AccessLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

export function levelSatisfies(actual: AccessLevel, required: AccessLevel): boolean {
  return levelRank(actual) >= levelRank(required);
}

export function strongestLevel(levels: AccessLevel[]): AccessLevel {
  return levels.reduce<AccessLevel>(
    (best, l) => (levelRank(l) > levelRank(best) ? l : best),
    AccessLevel.NONE,
  );
}

/**
 * Feature 8: "block errors in sharing based on roles assignment and document
 * and folder classification."
 *
 * This is the guard rail that stops someone accidentally putting a RESTRICTED
 * HR file behind a public link. It is deliberately conservative - it returns a
 * reason string rather than a boolean so the UI can explain the refusal.
 */
export interface ShareSafetyInput {
  classification: Classification;
  isExternal: boolean;
  hasPassword: boolean;
  allowDownload: boolean;
  hasExpiry: boolean;
  recipientCount: number;
  actorTier: UserTier;
}

export interface ShareSafetyVerdict {
  allowed: boolean;
  /** Blocking problems. Non-empty means the share must be refused. */
  violations: string[];
  /** Non-blocking advice the UI should surface before the user confirms. */
  warnings: string[];
}

export function evaluateShareSafety(input: ShareSafetyInput): ShareSafetyVerdict {
  const violations: string[] = [];
  const warnings: string[] = [];

  if (input.classification === Classification.RESTRICTED) {
    if (input.isExternal) {
      violations.push('RESTRICTED documents cannot be shared outside the organisation.');
    }
    if (!input.hasPassword) {
      violations.push('RESTRICTED documents require an access code on every share link.');
    }
    if (!input.hasExpiry) {
      violations.push('RESTRICTED documents require an expiry date on every share link.');
    }
    if (input.allowDownload) {
      violations.push('RESTRICTED documents may be viewed but not downloaded via a link.');
    }
  }

  if (input.classification === Classification.CONFIDENTIAL) {
    if (input.isExternal && input.actorTier !== UserTier.ORG_ADMIN && input.actorTier !== UserTier.MANAGER) {
      violations.push('Only a manager or administrator may share CONFIDENTIAL documents externally.');
    }
    if (!input.hasExpiry) {
      violations.push('CONFIDENTIAL documents require an expiry date on every share link.');
    }
    if (input.isExternal && input.recipientCount === 0) {
      violations.push(
        'CONFIDENTIAL external shares must name their recipients; an open link is not permitted.',
      );
    }
    if (!input.hasPassword) {
      warnings.push('Consider adding an access code to this CONFIDENTIAL share.');
    }
  }

  if (input.classification === Classification.INTERNAL && input.isExternal) {
    warnings.push('This document is marked INTERNAL and you are sharing it outside the organisation.');
  }

  if (!input.hasExpiry && input.isExternal) {
    warnings.push('External link never expires. Set a time frame unless it is genuinely permanent.');
  }

  return { allowed: violations.length === 0, violations, warnings };
}
