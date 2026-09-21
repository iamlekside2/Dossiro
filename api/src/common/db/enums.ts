/**
 * Database enums.
 *
 * Generated from the live database by db/generate-types.ts — do not edit.
 *
 * Const objects rather than TypeScript `enum`: the values must be the exact
 * strings Postgres stores, and a numeric TS enum would silently not be.
 */
export const AccessLevel = {
  NONE: 'NONE',
  READ: 'READ',
  DOWNLOAD: 'DOWNLOAD',
  WRITE: 'WRITE',
  APPROVE: 'APPROVE',
  MANAGE: 'MANAGE',
  OWNER: 'OWNER',
} as const;
export type AccessLevel = (typeof AccessLevel)[keyof typeof AccessLevel];

export const AuditAction = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  DOCUMENT_CREATE: 'DOCUMENT_CREATE',
  DOCUMENT_VIEW: 'DOCUMENT_VIEW',
  DOCUMENT_DOWNLOAD: 'DOCUMENT_DOWNLOAD',
  DOCUMENT_UPDATE: 'DOCUMENT_UPDATE',
  DOCUMENT_DELETE: 'DOCUMENT_DELETE',
  DOCUMENT_RESTORE: 'DOCUMENT_RESTORE',
  DOCUMENT_PURGE: 'DOCUMENT_PURGE',
  DOCUMENT_MOVE: 'DOCUMENT_MOVE',
  VERSION_CREATE: 'VERSION_CREATE',
  VERSION_RESTORE: 'VERSION_RESTORE',
  FOLDER_CREATE: 'FOLDER_CREATE',
  FOLDER_UPDATE: 'FOLDER_UPDATE',
  FOLDER_DELETE: 'FOLDER_DELETE',
  ACCESS_GRANT: 'ACCESS_GRANT',
  ACCESS_REVOKE: 'ACCESS_REVOKE',
  SHARE_CREATE: 'SHARE_CREATE',
  SHARE_ACCESS: 'SHARE_ACCESS',
  SHARE_REVOKE: 'SHARE_REVOKE',
  WORKFLOW_START: 'WORKFLOW_START',
  WORKFLOW_DECISION: 'WORKFLOW_DECISION',
  SIGNATURE_REQUEST: 'SIGNATURE_REQUEST',
  SIGNATURE_APPLY: 'SIGNATURE_APPLY',
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  ROLE_CHANGE: 'ROLE_CHANGE',
  SETTINGS_CHANGE: 'SETTINGS_CHANGE',
  EXPORT: 'EXPORT',
  CHANNEL_INBOUND: 'CHANNEL_INBOUND',
  CHANNEL_OUTBOUND: 'CHANNEL_OUTBOUND',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const ChangeOp = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
} as const;
export type ChangeOp = (typeof ChangeOp)[keyof typeof ChangeOp];

export const ChannelType = {
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL',
  WEB: 'WEB',
  API: 'API',
  MOBILE: 'MOBILE',
} as const;
export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType];

export const Classification = {
  PUBLIC: 'PUBLIC',
  INTERNAL: 'INTERNAL',
  CONFIDENTIAL: 'CONFIDENTIAL',
  RESTRICTED: 'RESTRICTED',
} as const;
export type Classification = (typeof Classification)[keyof typeof Classification];

export const ContentKind = {
  DOCUMENT: 'DOCUMENT',
  IMAGE: 'IMAGE',
  AUDIO: 'AUDIO',
  VIDEO: 'VIDEO',
  ARCHIVE: 'ARCHIVE',
  EMAIL: 'EMAIL',
  FORM: 'FORM',
  OTHER: 'OTHER',
} as const;
export type ContentKind = (typeof ContentKind)[keyof typeof ContentKind];

export const DispositionDecision = {
  KEEP: 'KEEP',
  DESTROY: 'DESTROY',
  TRANSFER: 'TRANSFER',
} as const;
export type DispositionDecision = (typeof DispositionDecision)[keyof typeof DispositionDecision];

export const DocumentStatus = {
  DRAFT: 'DRAFT',
  PROCESSING: 'PROCESSING',
  ACTIVE: 'ACTIVE',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
  ARCHIVED: 'ARCHIVED',
  DELETED: 'DELETED',
} as const;
export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

export const DocumentTypeStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type DocumentTypeStatus = (typeof DocumentTypeStatus)[keyof typeof DocumentTypeStatus];

export const FieldKind = {
  TEXT: 'TEXT',
  DATE: 'DATE',
  NUMBER: 'NUMBER',
  BOOLEAN: 'BOOLEAN',
  SELECT: 'SELECT',
} as const;
export type FieldKind = (typeof FieldKind)[keyof typeof FieldKind];

export const IntegrationProvider = {
  MICROSOFT_365: 'MICROSOFT_365',
  MICROSOFT_ENTRA: 'MICROSOFT_ENTRA',
  ADOBE_ACROBAT: 'ADOBE_ACROBAT',
  ADOBE_SIGN: 'ADOBE_SIGN',
  ONLYOFFICE: 'ONLYOFFICE',
  GOOGLE_WORKSPACE: 'GOOGLE_WORKSPACE',
} as const;
export type IntegrationProvider = (typeof IntegrationProvider)[keyof typeof IntegrationProvider];

export const JobStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const JobType = {
  OCR: 'OCR',
  PDF_CONVERT: 'PDF_CONVERT',
  PDF_EDIT: 'PDF_EDIT',
  THUMBNAIL: 'THUMBNAIL',
  TEXT_INDEX: 'TEXT_INDEX',
  EMBED: 'EMBED',
  CLASSIFY: 'CLASSIFY',
  EXTRACT_INVOICE: 'EXTRACT_INVOICE',
  SUMMARIZE: 'SUMMARIZE',
  VIRUS_SCAN: 'VIRUS_SCAN',
  TRANSCRIBE: 'TRANSCRIBE',
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];

export const MessageDirection = {
  INBOUND: 'INBOUND',
  OUTBOUND: 'OUTBOUND',
} as const;
export type MessageDirection = (typeof MessageDirection)[keyof typeof MessageDirection];

export const MessageStatus = {
  RECEIVED: 'RECEIVED',
  QUEUED: 'QUEUED',
  PROCESSED: 'PROCESSED',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  READ: 'READ',
  FAILED: 'FAILED',
} as const;
export type MessageStatus = (typeof MessageStatus)[keyof typeof MessageStatus];

export const OrgStatus = {
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  CLOSED: 'CLOSED',
} as const;
export type OrgStatus = (typeof OrgStatus)[keyof typeof OrgStatus];

export const ResourceType = {
  FOLDER: 'FOLDER',
  DOCUMENT: 'DOCUMENT',
} as const;
export type ResourceType = (typeof ResourceType)[keyof typeof ResourceType];

export const ShareAccessAction = {
  VIEW: 'VIEW',
  DOWNLOAD: 'DOWNLOAD',
  PRINT: 'PRINT',
  DENIED: 'DENIED',
} as const;
export type ShareAccessAction = (typeof ShareAccessAction)[keyof typeof ShareAccessAction];

export const SignatureRequestStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  PARTIALLY_SIGNED: 'PARTIALLY_SIGNED',
  COMPLETED: 'COMPLETED',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED',
  VOIDED: 'VOIDED',
} as const;
export type SignatureRequestStatus = (typeof SignatureRequestStatus)[keyof typeof SignatureRequestStatus];

export const SignatureType = {
  DRAWN: 'DRAWN',
  TYPED: 'TYPED',
  UPLOADED_IMAGE: 'UPLOADED_IMAGE',
  CERTIFICATE: 'CERTIFICATE',
} as const;
export type SignatureType = (typeof SignatureType)[keyof typeof SignatureType];

export const StorageDriver = {
  LOCAL: 'LOCAL',
  S3: 'S3',
} as const;
export type StorageDriver = (typeof StorageDriver)[keyof typeof StorageDriver];

export const SubjectType = {
  USER: 'USER',
  GROUP: 'GROUP',
  ROLE: 'ROLE',
  BRANCH: 'BRANCH',
} as const;
export type SubjectType = (typeof SubjectType)[keyof typeof SubjectType];

export const TaskAction = {
  REVIEW: 'REVIEW',
  APPROVE: 'APPROVE',
  SIGN: 'SIGN',
  ACKNOWLEDGE: 'ACKNOWLEDGE',
  FILL_FORM: 'FILL_FORM',
} as const;
export type TaskAction = (typeof TaskAction)[keyof typeof TaskAction];

export const TaskStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  SKIPPED: 'SKIPPED',
  EXPIRED: 'EXPIRED',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const UserStatus = {
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DEACTIVATED: 'DEACTIVATED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const UserTier = {
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  ORG_ADMIN: 'ORG_ADMIN',
  MANAGER: 'MANAGER',
  CONTRIBUTOR: 'CONTRIBUTOR',
  VIEWER: 'VIEWER',
  EXTERNAL: 'EXTERNAL',
} as const;
export type UserTier = (typeof UserTier)[keyof typeof UserTier];

export const WorkflowStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;
export type WorkflowStatus = (typeof WorkflowStatus)[keyof typeof WorkflowStatus];

