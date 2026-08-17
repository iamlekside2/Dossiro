/**
 * Table row types.
 *
 * Generated from the live database by db/generate-types.ts — do not edit.
 *
 * One interface per table, describing a row exactly as node-postgres returns
 * it. Columns that are nullable in the database are `| null` here, so a
 * missing value has to be handled rather than assumed away.
 */
import type {
  AccessLevel,
  AuditAction,
  ChangeOp,
  ChannelType,
  Classification,
  ContentKind,
  DocumentStatus,
  IntegrationProvider,
  JobStatus,
  JobType,
  MessageDirection,
  MessageStatus,
  OrgStatus,
  ResourceType,
  ShareAccessAction,
  SignatureRequestStatus,
  SignatureType,
  StorageDriver,
  SubjectType,
  TaskAction,
  TaskStatus,
  UserStatus,
  UserTier,
  WorkflowStatus,
} from './enums';

export type { AccessLevel, AuditAction, ChangeOp, ChannelType, Classification, ContentKind, DocumentStatus, IntegrationProvider, JobStatus, JobType, MessageDirection, MessageStatus, OrgStatus, ResourceType, ShareAccessAction, SignatureRequestStatus, SignatureType, StorageDriver, SubjectType, TaskAction, TaskStatus, UserStatus, UserTier, WorkflowStatus };

/** `access_grants` */
export interface AccessGrant {
  id: string;
  subjectType: SubjectType;
  userId: string | null;
  groupId: string | null;
  roleId: string | null;
  resourceType: ResourceType;
  folderId: string | null;
  documentId: string | null;
  level: AccessLevel;
  inherited: boolean;
  isDeny: boolean;
  expiresAt: Date | null;
  grantedById: string | null;
  createdAt: Date;
  branchId: string | null;
}

/** `api_keys` */
export interface ApiKey {
  id: string;
  organizationId: string;
  name: string;
  keyHash: string;
  prefix: string;
  permissions: string[] | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

/** `audit_events` */
export interface AuditEvent {
  id: string;
  organizationId: string;
  actorId: string | null;
  actorLabel: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId: string | null;
  resourceName: string | null;
  changes: unknown | null;
  metadata: unknown | null;
  ip: string | null;
  userAgent: string | null;
  channel: ChannelType;
  createdAt: Date;
  hash: string;
  prevHash: string | null;
}

/** `branches` */
export interface Branch {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  parentId: string | null;
  address: string | null;
  phone: string | null;
  timezone: string;
  isHeadOffice: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** `change_log` */
export interface ChangeLog {
  seq: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  op: ChangeOp;
  snapshot: unknown | null;
  actorId: string | null;
  createdAt: Date;
}

/** `channel_identities` */
export interface ChannelIdentity {
  id: string;
  userId: string;
  channel: ChannelType;
  identifier: string;
  verifiedAt: Date | null;
  verifyCode: string | null;
  createdAt: Date;
}

/** `channel_messages` */
export interface ChannelMessage {
  id: string;
  organizationId: string | null;
  channel: ChannelType;
  direction: MessageDirection;
  externalId: string | null;
  fromAddr: string | null;
  toAddr: string | null;
  subject: string | null;
  body: string | null;
  payload: unknown | null;
  status: MessageStatus;
  error: string | null;
  documentId: string | null;
  resolvedUserId: string | null;
  processedAt: Date | null;
  createdAt: Date;
}

/** `comments` */
export interface Comment {
  id: string;
  documentId: string;
  authorId: string | null;
  body: string;
  anchor: unknown | null;
  parentId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

/** `devices` */
export interface Device {
  id: string;
  userId: string;
  name: string;
  platform: string;
  pushToken: string | null;
  lastSyncSeq: string;
  lastSyncAt: Date | null;
  createdAt: Date;
}

/** `document_chunks` */
export interface DocumentChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  tokenCount: number;
  createdAt: Date;
}

/** `document_index` */
export interface DocumentIndex {
  documentId: string;
  contentText: string;
  title: string;
  language: string;
  wordCount: number;
  indexedAt: Date;
  versionId: string | null;
  tsv: string | null;
}

/** `document_summaries` */
export interface DocumentSummary {
  id: string;
  documentId: string;
  style: string;
  content: string;
  modelName: string | null;
  tokensUsed: number | null;
  versionId: string | null;
  createdAt: Date;
}

/** `document_tags` */
export interface DocumentTag {
  documentId: string;
  tagId: string;
  confidence: number | null;
  addedAt: Date;
}

/** `document_versions` */
export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  storageDriver: StorageDriver;
  storageKey: string;
  sizeBytes: string;
  checksum: string;
  mimeType: string;
  pageCount: number | null;
  changeSummary: string | null;
  diffSummary: unknown | null;
  authorId: string | null;
  createdAt: Date;
}

/** `document_view_sessions` */
export interface DocumentViewSession {
  id: string;
  documentId: string;
  shareLinkId: string | null;
  userId: string | null;
  viewerEmail: string | null;
  ip: string | null;
  userAgent: string | null;
  startedAt: Date;
  endedAt: Date | null;
  totalMs: number;
  completed: boolean;
}

/** `documents` */
export interface Document {
  id: string;
  organizationId: string;
  folderId: string | null;
  name: string;
  description: string | null;
  kind: ContentKind;
  mimeType: string;
  status: DocumentStatus;
  classification: Classification;
  currentVersionId: string | null;
  versionCount: number;
  ownerId: string | null;
  sourceChannel: ChannelType;
  sourceRef: string | null;
  lockPasswordHash: string | null;
  checkedOutById: string | null;
  checkedOutAt: Date | null;
  suggestedName: string | null;
  suggestedFolderId: string | null;
  aiProcessedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  deletedById: string | null;
  purgeAfter: Date | null;
  retentionPolicyId: string | null;
}

/** `extraction_results` */
export interface ExtractionResult {
  id: string;
  documentId: string;
  schemaKey: string;
  data: unknown;
  confidence: number | null;
  verifiedAt: Date | null;
  verifiedById: string | null;
  modelName: string | null;
  createdAt: Date;
}

/** `folders` */
export interface Folder {
  id: string;
  organizationId: string;
  name: string;
  parentId: string | null;
  path: string;
  depth: number;
  classification: Classification;
  inheritAccess: boolean;
  lockPasswordHash: string | null;
  color: string | null;
  description: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  purgeAfter: Date | null;
  retentionPolicyId: string | null;
  branchId: string | null;
}

/** `form_definitions` */
export interface FormDefinition {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  schema: unknown;
  templateKey: string | null;
  targetFolderId: string | null;
  workflowDefinitionId: string | null;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** `form_submissions` */
export interface FormSubmission {
  id: string;
  formId: string;
  data: unknown;
  submittedById: string | null;
  submitterEmail: string | null;
  documentId: string | null;
  ip: string | null;
  createdAt: Date;
}

/** `group_members` */
export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  isLead: boolean;
  joinedAt: Date;
}

/** `groups` */
export interface Group {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** `installation` */
export interface Installation {
  id: string;
  deploymentId: string;
  mode: string;
  createdAt: Date;
}

/** `integration_connections` */
export interface IntegrationConnection {
  id: string;
  organizationId: string;
  provider: IntegrationProvider;
  userId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[] | null;
  metadata: unknown | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** `invoice_line_items` */
export interface InvoiceLineItem {
  id: string;
  extractionId: string;
  lineNumber: number;
  description: string;
  quantity: string | null;
  unitPrice: string | null;
  amount: string | null;
  taxRate: string | null;
  glCode: string | null;
  confidence: number | null;
}

/** `legal_holds` */
export interface LegalHold {
  id: string;
  documentId: string;
  reason: string;
  caseRef: string | null;
  placedById: string | null;
  placedAt: Date;
  releasedAt: Date | null;
}

/** `ocr_pages` */
export interface OcrPage {
  id: string;
  documentId: string;
  versionId: string;
  pageNumber: number;
  text: string;
  confidence: number | null;
  boxes: unknown | null;
  createdAt: Date;
}

/** `organization_domains` */
export interface OrganizationDomain {
  id: string;
  organizationId: string;
  domain: string;
  verifiedAt: Date | null;
  verifyToken: string | null;
  createdAt: Date;
}

/** `organizations` */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  settings: unknown;
  region: string;
  createdAt: Date;
  updatedAt: Date;
  plan: string;
  seatLimit: number | null;
  status: OrgStatus;
  isPlatform: boolean;
  licenseKey: string | null;
}

/** `page_views` */
export interface PageView {
  id: string;
  sessionId: string;
  pageNumber: number;
  dwellMs: number;
  enteredAt: Date;
}

/** `processing_jobs` */
export interface ProcessingJob {
  id: string;
  documentId: string | null;
  type: JobType;
  status: JobStatus;
  input: unknown;
  output: unknown | null;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  batchId: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

/** `retention_policies` */
export interface RetentionPolicy {
  id: string;
  organizationId: string;
  name: string;
  retainMonths: number;
  anchor: string;
  action: string;
  createdAt: Date;
}

/** `roles` */
export interface Role {
  id: string;
  organizationId: string | null;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

/** `saved_searches` */
export interface SavedSearch {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  query: unknown;
  isShared: boolean;
  createdAt: Date;
}

/** `sessions` */
export interface Session {
  id: string;
  userId: string;
  refreshTokenHash: string;
  userAgent: string | null;
  ip: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

/** `share_accesses` */
export interface ShareAccess {
  id: string;
  shareLinkId: string;
  action: ShareAccessAction;
  reason: string | null;
  viewerEmail: string | null;
  ip: string | null;
  userAgent: string | null;
  country: string | null;
  createdAt: Date;
}

/** `share_links` */
export interface ShareLink {
  id: string;
  token: string;
  documentId: string;
  expiresAt: Date | null;
  maxDownloads: number | null;
  downloadCount: number;
  viewCount: number;
  passwordHash: string | null;
  allowDownload: boolean;
  allowPrint: boolean;
  watermark: boolean;
  allowedEmails: string[] | null;
  requireEmailVerification: boolean;
  note: string | null;
  revokedAt: Date | null;
  createdById: string | null;
  createdVia: ChannelType;
  createdAt: Date;
  sentAt: Date | null;
  firstOpenedAt: Date | null;
}

/** `signature_fields` */
export interface SignatureField {
  id: string;
  requestId: string;
  signerUserId: string | null;
  signerEmail: string | null;
  order: number;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: SignatureType;
  required: boolean;
  label: string | null;
}

/** `signature_requests` */
export interface SignatureRequest {
  id: string;
  documentId: string;
  status: SignatureRequestStatus;
  sequential: boolean;
  message: string | null;
  expiresAt: Date | null;
  createdById: string | null;
  createdAt: Date;
  completedAt: Date | null;
  signedStorageKey: string | null;
}

/** `signatures` */
export interface Signature {
  id: string;
  requestId: string;
  fieldId: string;
  signerId: string | null;
  signerEmail: string | null;
  type: SignatureType;
  imageKey: string | null;
  typedText: string | null;
  certificate: string | null;
  evidence: unknown | null;
  signedAt: Date;
}

/** `tags` */
export interface Tag {
  id: string;
  organizationId: string;
  name: string;
  color: string | null;
  isAiGenerated: boolean;
}

/** `tenant_hostnames` */
export interface TenantHostname {
  id: string;
  organizationId: string;
  hostname: string;
  verifiedAt: Date | null;
  verifyToken: string | null;
  isPrimary: boolean;
  createdAt: Date;
}

/** `user_roles` */
export interface UserRole {
  id: string;
  userId: string;
  roleId: string;
  assignedAt: Date;
}

/** `users` */
export interface User {
  id: string;
  organizationId: string;
  email: string;
  passwordHash: string | null;
  displayName: string;
  jobTitle: string | null;
  avatarKey: string | null;
  tier: UserTier;
  status: UserStatus;
  mfaSecret: string | null;
  mfaEnabled: boolean;
  lastLoginAt: Date | null;
  failedLogins: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  inviteExpiresAt: Date | null;
  inviteTokenHash: string | null;
  invitedAt: Date | null;
  invitedById: string | null;
  isPlatformStaff: boolean;
  branchId: string | null;
}

/** `wopi_sessions` */
export interface WopiSession {
  id: string;
  documentId: string;
  userId: string;
  accessToken: string;
  canWrite: boolean;
  expiresAt: Date;
  createdAt: Date;
}

/** `workflow_definitions` */
export interface WorkflowDefinition {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  steps: unknown;
  trigger: unknown | null;
  isActive: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** `workflow_instances` */
export interface WorkflowInstance {
  id: string;
  definitionId: string;
  documentId: string;
  status: WorkflowStatus;
  currentStep: number;
  initiatorId: string | null;
  startedAt: Date;
  completedAt: Date | null;
  dueAt: Date | null;
}

/** `workflow_tasks` */
export interface WorkflowTask {
  id: string;
  instanceId: string;
  stepIndex: number;
  stepKey: string;
  action: TaskAction;
  status: TaskStatus;
  assigneeType: SubjectType;
  assigneeId: string | null;
  assigneeGroupId: string | null;
  grantedLevel: AccessLevel;
  comment: string | null;
  decidedAt: Date | null;
  dueAt: Date | null;
  createdAt: Date;
}

