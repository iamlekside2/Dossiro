-- 0001_baseline.sql
--
-- The complete schema as it stood when the ORM was removed, captured from the
-- database with pg_dump rather than re-derived by hand. The seven Prisma
-- migrations that built it are folded into this one file; there was no
-- production data to preserve, so their individual history buys nothing.
--
-- Everything Prisma could not describe is now first-class here rather than
-- living in a side-channel: the tsvector column and its GIN indexes, the
-- append-only trigger on audit_events, and the partial unique indexes that
-- enforce "unique among the living".

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE TYPE public."AccessLevel" AS ENUM (
    'NONE',
    'READ',
    'DOWNLOAD',
    'WRITE',
    'APPROVE',
    'MANAGE',
    'OWNER'
);

CREATE TYPE public."AuditAction" AS ENUM (
    'LOGIN',
    'LOGOUT',
    'LOGIN_FAILED',
    'DOCUMENT_CREATE',
    'DOCUMENT_VIEW',
    'DOCUMENT_DOWNLOAD',
    'DOCUMENT_UPDATE',
    'DOCUMENT_DELETE',
    'DOCUMENT_RESTORE',
    'DOCUMENT_PURGE',
    'DOCUMENT_MOVE',
    'VERSION_CREATE',
    'VERSION_RESTORE',
    'FOLDER_CREATE',
    'FOLDER_UPDATE',
    'FOLDER_DELETE',
    'ACCESS_GRANT',
    'ACCESS_REVOKE',
    'SHARE_CREATE',
    'SHARE_ACCESS',
    'SHARE_REVOKE',
    'WORKFLOW_START',
    'WORKFLOW_DECISION',
    'SIGNATURE_REQUEST',
    'SIGNATURE_APPLY',
    'USER_CREATE',
    'USER_UPDATE',
    'ROLE_CHANGE',
    'SETTINGS_CHANGE',
    'EXPORT',
    'CHANNEL_INBOUND',
    'CHANNEL_OUTBOUND'
);

CREATE TYPE public."ChangeOp" AS ENUM (
    'CREATE',
    'UPDATE',
    'DELETE'
);

CREATE TYPE public."ChannelType" AS ENUM (
    'WHATSAPP',
    'EMAIL',
    'WEB',
    'API',
    'MOBILE'
);

CREATE TYPE public."Classification" AS ENUM (
    'PUBLIC',
    'INTERNAL',
    'CONFIDENTIAL',
    'RESTRICTED'
);

CREATE TYPE public."ContentKind" AS ENUM (
    'DOCUMENT',
    'IMAGE',
    'AUDIO',
    'VIDEO',
    'ARCHIVE',
    'EMAIL',
    'FORM',
    'OTHER'
);

CREATE TYPE public."DocumentStatus" AS ENUM (
    'DRAFT',
    'PROCESSING',
    'ACTIVE',
    'IN_REVIEW',
    'APPROVED',
    'ARCHIVED',
    'DELETED'
);

CREATE TYPE public."IntegrationProvider" AS ENUM (
    'MICROSOFT_365',
    'MICROSOFT_ENTRA',
    'ADOBE_ACROBAT',
    'ADOBE_SIGN',
    'ONLYOFFICE',
    'GOOGLE_WORKSPACE'
);

CREATE TYPE public."JobStatus" AS ENUM (
    'PENDING',
    'RUNNING',
    'SUCCEEDED',
    'FAILED',
    'CANCELLED'
);

CREATE TYPE public."JobType" AS ENUM (
    'OCR',
    'PDF_CONVERT',
    'PDF_EDIT',
    'THUMBNAIL',
    'TEXT_INDEX',
    'EMBED',
    'CLASSIFY',
    'EXTRACT_INVOICE',
    'SUMMARIZE',
    'VIRUS_SCAN',
    'TRANSCRIBE'
);

CREATE TYPE public."MessageDirection" AS ENUM (
    'INBOUND',
    'OUTBOUND'
);

CREATE TYPE public."MessageStatus" AS ENUM (
    'RECEIVED',
    'QUEUED',
    'PROCESSED',
    'SENT',
    'DELIVERED',
    'READ',
    'FAILED'
);

CREATE TYPE public."OrgStatus" AS ENUM (
    'TRIAL',
    'ACTIVE',
    'SUSPENDED',
    'CLOSED'
);

CREATE TYPE public."ResourceType" AS ENUM (
    'FOLDER',
    'DOCUMENT'
);

CREATE TYPE public."ShareAccessAction" AS ENUM (
    'VIEW',
    'DOWNLOAD',
    'PRINT',
    'DENIED'
);

CREATE TYPE public."SignatureRequestStatus" AS ENUM (
    'DRAFT',
    'SENT',
    'PARTIALLY_SIGNED',
    'COMPLETED',
    'DECLINED',
    'EXPIRED',
    'VOIDED'
);

CREATE TYPE public."SignatureType" AS ENUM (
    'DRAWN',
    'TYPED',
    'UPLOADED_IMAGE',
    'CERTIFICATE'
);

CREATE TYPE public."StorageDriver" AS ENUM (
    'LOCAL',
    'S3'
);

CREATE TYPE public."SubjectType" AS ENUM (
    'USER',
    'GROUP',
    'ROLE',
    'BRANCH'
);

CREATE TYPE public."TaskAction" AS ENUM (
    'REVIEW',
    'APPROVE',
    'SIGN',
    'ACKNOWLEDGE',
    'FILL_FORM'
);

CREATE TYPE public."TaskStatus" AS ENUM (
    'PENDING',
    'IN_PROGRESS',
    'COMPLETED',
    'REJECTED',
    'SKIPPED',
    'EXPIRED'
);

CREATE TYPE public."UserStatus" AS ENUM (
    'INVITED',
    'ACTIVE',
    'SUSPENDED',
    'DEACTIVATED'
);

CREATE TYPE public."UserTier" AS ENUM (
    'SYSTEM_ADMIN',
    'ORG_ADMIN',
    'MANAGER',
    'CONTRIBUTOR',
    'VIEWER',
    'EXTERNAL'
);

CREATE TYPE public."WorkflowStatus" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'COMPLETED',
    'REJECTED',
    'CANCELLED'
);

CREATE FUNCTION public.audit_events_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % is not permitted', TG_OP;
END;
$$;

CREATE FUNCTION public.platform_org_holds_no_documents() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.id = NEW."organizationId" AND o."isPlatform" = true
  ) THEN
    RAISE EXCEPTION 'the platform organisation cannot hold documents or folders';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE public.access_grants (
    id text NOT NULL,
    "subjectType" public."SubjectType" NOT NULL,
    "userId" text,
    "groupId" text,
    "roleId" text,
    "resourceType" public."ResourceType" NOT NULL,
    "folderId" text,
    "documentId" text,
    level public."AccessLevel" NOT NULL,
    inherited boolean DEFAULT false NOT NULL,
    "isDeny" boolean DEFAULT false NOT NULL,
    "expiresAt" timestamp(3) without time zone,
    "grantedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "branchId" text,
    CONSTRAINT access_grants_one_resource CHECK ((((("folderId" IS NOT NULL))::integer + (("documentId" IS NOT NULL))::integer) = 1)),
    CONSTRAINT access_grants_one_subject CHECK ((((((("userId" IS NOT NULL))::integer + (("groupId" IS NOT NULL))::integer) + (("roleId" IS NOT NULL))::integer) + (("branchId" IS NOT NULL))::integer) = 1))
);

CREATE TABLE public.api_keys (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    "keyHash" text NOT NULL,
    prefix text NOT NULL,
    permissions text[] DEFAULT ARRAY[]::text[],
    "lastUsedAt" timestamp(3) without time zone,
    "expiresAt" timestamp(3) without time zone,
    "revokedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.audit_events (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "actorId" text,
    "actorLabel" text,
    action public."AuditAction" NOT NULL,
    "resourceType" text NOT NULL,
    "resourceId" text,
    "resourceName" text,
    changes jsonb,
    metadata jsonb,
    ip text,
    "userAgent" text,
    channel public."ChannelType" DEFAULT 'WEB'::public."ChannelType" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    hash text NOT NULL,
    "prevHash" text
);

CREATE TABLE public.branches (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    code text,
    "parentId" text,
    address text,
    phone text,
    timezone text DEFAULT 'Africa/Lagos'::text NOT NULL,
    "isHeadOffice" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone
);

CREATE TABLE public.change_log (
    seq bigint NOT NULL,
    "organizationId" text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    op public."ChangeOp" NOT NULL,
    snapshot jsonb,
    "actorId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE SEQUENCE public.change_log_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.change_log_seq_seq OWNED BY public.change_log.seq;

CREATE TABLE public.channel_identities (
    id text NOT NULL,
    "userId" text NOT NULL,
    channel public."ChannelType" NOT NULL,
    identifier text NOT NULL,
    "verifiedAt" timestamp(3) without time zone,
    "verifyCode" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.channel_messages (
    id text NOT NULL,
    "organizationId" text,
    channel public."ChannelType" NOT NULL,
    direction public."MessageDirection" NOT NULL,
    "externalId" text,
    "fromAddr" text,
    "toAddr" text,
    subject text,
    body text,
    payload jsonb,
    status public."MessageStatus" DEFAULT 'RECEIVED'::public."MessageStatus" NOT NULL,
    error text,
    "documentId" text,
    "resolvedUserId" text,
    "processedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.comments (
    id text NOT NULL,
    "documentId" text NOT NULL,
    "authorId" text,
    body text NOT NULL,
    anchor jsonb,
    "parentId" text,
    "resolvedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.devices (
    id text NOT NULL,
    "userId" text NOT NULL,
    name text NOT NULL,
    platform text NOT NULL,
    "pushToken" text,
    "lastSyncSeq" bigint DEFAULT 0 NOT NULL,
    "lastSyncAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.document_chunks (
    id text NOT NULL,
    "documentId" text NOT NULL,
    "chunkIndex" integer NOT NULL,
    content text NOT NULL,
    "pageNumber" integer,
    "tokenCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.document_index (
    "documentId" text NOT NULL,
    "contentText" text NOT NULL,
    title text NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    "wordCount" integer DEFAULT 0 NOT NULL,
    "indexedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "versionId" text,
    tsv tsvector GENERATED ALWAYS AS ((setweight(to_tsvector('english'::regconfig, COALESCE(title, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE("contentText", ''::text)), 'B'::"char"))) STORED
);

CREATE TABLE public.document_summaries (
    id text NOT NULL,
    "documentId" text NOT NULL,
    style text DEFAULT 'short'::text NOT NULL,
    content text NOT NULL,
    "modelName" text,
    "tokensUsed" integer,
    "versionId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.document_tags (
    "documentId" text NOT NULL,
    "tagId" text NOT NULL,
    confidence double precision,
    "addedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.document_versions (
    id text NOT NULL,
    "documentId" text NOT NULL,
    "versionNumber" integer NOT NULL,
    "storageDriver" public."StorageDriver" DEFAULT 'LOCAL'::public."StorageDriver" NOT NULL,
    "storageKey" text NOT NULL,
    "sizeBytes" bigint NOT NULL,
    checksum text NOT NULL,
    "mimeType" text NOT NULL,
    "pageCount" integer,
    "changeSummary" text,
    "diffSummary" jsonb,
    "authorId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.document_view_sessions (
    id text NOT NULL,
    "documentId" text NOT NULL,
    "shareLinkId" text,
    "userId" text,
    "viewerEmail" text,
    ip text,
    "userAgent" text,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "endedAt" timestamp(3) without time zone,
    "totalMs" integer DEFAULT 0 NOT NULL,
    completed boolean DEFAULT false NOT NULL
);

CREATE TABLE public.documents (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "folderId" text,
    name text NOT NULL,
    description text,
    kind public."ContentKind" DEFAULT 'DOCUMENT'::public."ContentKind" NOT NULL,
    "mimeType" text DEFAULT 'application/octet-stream'::text NOT NULL,
    status public."DocumentStatus" DEFAULT 'ACTIVE'::public."DocumentStatus" NOT NULL,
    classification public."Classification" DEFAULT 'INTERNAL'::public."Classification" NOT NULL,
    "currentVersionId" text,
    "versionCount" integer DEFAULT 0 NOT NULL,
    "ownerId" text,
    "sourceChannel" public."ChannelType" DEFAULT 'WEB'::public."ChannelType" NOT NULL,
    "sourceRef" text,
    "lockPasswordHash" text,
    "checkedOutById" text,
    "checkedOutAt" timestamp(3) without time zone,
    "suggestedName" text,
    "suggestedFolderId" text,
    "aiProcessedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "deletedById" text,
    "purgeAfter" timestamp(3) without time zone,
    "retentionPolicyId" text
);

CREATE TABLE public.extraction_results (
    id text NOT NULL,
    "documentId" text NOT NULL,
    "schemaKey" text NOT NULL,
    data jsonb NOT NULL,
    confidence double precision,
    "verifiedAt" timestamp(3) without time zone,
    "verifiedById" text,
    "modelName" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.folders (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    "parentId" text,
    path text DEFAULT '/'::text NOT NULL,
    depth integer DEFAULT 0 NOT NULL,
    classification public."Classification" DEFAULT 'INTERNAL'::public."Classification" NOT NULL,
    "inheritAccess" boolean DEFAULT true NOT NULL,
    "lockPasswordHash" text,
    color text,
    description text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "purgeAfter" timestamp(3) without time zone,
    "retentionPolicyId" text,
    "branchId" text
);

CREATE TABLE public.form_definitions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    description text,
    schema jsonb DEFAULT '{}'::jsonb NOT NULL,
    "templateKey" text,
    "targetFolderId" text,
    "workflowDefinitionId" text,
    "isPublished" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.form_submissions (
    id text NOT NULL,
    "formId" text NOT NULL,
    data jsonb NOT NULL,
    "submittedById" text,
    "submitterEmail" text,
    "documentId" text,
    ip text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.group_members (
    id text NOT NULL,
    "groupId" text NOT NULL,
    "userId" text NOT NULL,
    "isLead" boolean DEFAULT false NOT NULL,
    "joinedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.groups (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    description text,
    "parentId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.installation (
    id text NOT NULL,
    "deploymentId" text NOT NULL,
    mode text DEFAULT 'hosted'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.integration_connections (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    provider public."IntegrationProvider" NOT NULL,
    "userId" text,
    "accessToken" text,
    "refreshToken" text,
    "expiresAt" timestamp(3) without time zone,
    scopes text[] DEFAULT ARRAY[]::text[],
    metadata jsonb,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.invoice_line_items (
    id text NOT NULL,
    "extractionId" text NOT NULL,
    "lineNumber" integer NOT NULL,
    description text NOT NULL,
    quantity numeric(18,4),
    "unitPrice" numeric(18,4),
    amount numeric(18,4),
    "taxRate" numeric(9,4),
    "glCode" text,
    confidence double precision
);

CREATE TABLE public.legal_holds (
    id text NOT NULL,
    "documentId" text NOT NULL,
    reason text NOT NULL,
    "caseRef" text,
    "placedById" text,
    "placedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "releasedAt" timestamp(3) without time zone
);

CREATE TABLE public.ocr_pages (
    id text NOT NULL,
    "documentId" text NOT NULL,
    "versionId" text NOT NULL,
    "pageNumber" integer NOT NULL,
    text text NOT NULL,
    confidence double precision,
    boxes jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.organization_domains (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    domain text NOT NULL,
    "verifiedAt" timestamp(3) without time zone,
    "verifyToken" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.organizations (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    region text DEFAULT 'us-east-1'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    plan text DEFAULT 'standard'::text NOT NULL,
    "seatLimit" integer,
    status public."OrgStatus" DEFAULT 'TRIAL'::public."OrgStatus" NOT NULL,
    "isPlatform" boolean DEFAULT false NOT NULL,
    "licenseKey" text
);

CREATE TABLE public.page_views (
    id text NOT NULL,
    "sessionId" text NOT NULL,
    "pageNumber" integer NOT NULL,
    "dwellMs" integer DEFAULT 0 NOT NULL,
    "enteredAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.processing_jobs (
    id text NOT NULL,
    "documentId" text,
    type public."JobType" NOT NULL,
    status public."JobStatus" DEFAULT 'PENDING'::public."JobStatus" NOT NULL,
    input jsonb DEFAULT '{}'::jsonb NOT NULL,
    output jsonb,
    attempts integer DEFAULT 0 NOT NULL,
    "maxAttempts" integer DEFAULT 3 NOT NULL,
    error text,
    "batchId" text,
    "startedAt" timestamp(3) without time zone,
    "finishedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.retention_policies (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    "retainMonths" integer NOT NULL,
    anchor text DEFAULT 'created'::text NOT NULL,
    action text DEFAULT 'NOTIFY'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.roles (
    id text NOT NULL,
    "organizationId" text,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    "isSystem" boolean DEFAULT false NOT NULL,
    permissions text[] DEFAULT ARRAY[]::text[],
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.saved_searches (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "userId" text NOT NULL,
    name text NOT NULL,
    query jsonb NOT NULL,
    "isShared" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.sessions (
    id text NOT NULL,
    "userId" text NOT NULL,
    "refreshTokenHash" text NOT NULL,
    "userAgent" text,
    ip text,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.share_accesses (
    id text NOT NULL,
    "shareLinkId" text NOT NULL,
    action public."ShareAccessAction" NOT NULL,
    reason text,
    "viewerEmail" text,
    ip text,
    "userAgent" text,
    country text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.share_links (
    id text NOT NULL,
    token text NOT NULL,
    "documentId" text NOT NULL,
    "expiresAt" timestamp(3) without time zone,
    "maxDownloads" integer,
    "downloadCount" integer DEFAULT 0 NOT NULL,
    "viewCount" integer DEFAULT 0 NOT NULL,
    "passwordHash" text,
    "allowDownload" boolean DEFAULT true NOT NULL,
    "allowPrint" boolean DEFAULT true NOT NULL,
    watermark boolean DEFAULT false NOT NULL,
    "allowedEmails" text[] DEFAULT ARRAY[]::text[],
    "requireEmailVerification" boolean DEFAULT false NOT NULL,
    note text,
    "revokedAt" timestamp(3) without time zone,
    "createdById" text,
    "createdVia" public."ChannelType" DEFAULT 'WEB'::public."ChannelType" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "sentAt" timestamp(3) without time zone,
    "firstOpenedAt" timestamp(3) without time zone
);

CREATE TABLE public.signature_fields (
    id text NOT NULL,
    "requestId" text NOT NULL,
    "signerUserId" text,
    "signerEmail" text,
    "order" integer DEFAULT 0 NOT NULL,
    "pageNumber" integer NOT NULL,
    x double precision NOT NULL,
    y double precision NOT NULL,
    width double precision NOT NULL,
    height double precision NOT NULL,
    type public."SignatureType" DEFAULT 'DRAWN'::public."SignatureType" NOT NULL,
    required boolean DEFAULT true NOT NULL,
    label text
);

CREATE TABLE public.signature_requests (
    id text NOT NULL,
    "documentId" text NOT NULL,
    status public."SignatureRequestStatus" DEFAULT 'DRAFT'::public."SignatureRequestStatus" NOT NULL,
    sequential boolean DEFAULT false NOT NULL,
    message text,
    "expiresAt" timestamp(3) without time zone,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completedAt" timestamp(3) without time zone,
    "signedStorageKey" text
);

CREATE TABLE public.signatures (
    id text NOT NULL,
    "requestId" text NOT NULL,
    "fieldId" text NOT NULL,
    "signerId" text,
    "signerEmail" text,
    type public."SignatureType" NOT NULL,
    "imageKey" text,
    "typedText" text,
    certificate text,
    evidence jsonb,
    "signedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.tags (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    color text,
    "isAiGenerated" boolean DEFAULT false NOT NULL
);

CREATE TABLE public.tenant_hostnames (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    hostname text NOT NULL,
    "verifiedAt" timestamp(3) without time zone,
    "verifyToken" text,
    "isPrimary" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.user_roles (
    id text NOT NULL,
    "userId" text NOT NULL,
    "roleId" text NOT NULL,
    "assignedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.users (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    email text NOT NULL,
    "passwordHash" text,
    "displayName" text NOT NULL,
    "jobTitle" text,
    "avatarKey" text,
    tier public."UserTier" DEFAULT 'CONTRIBUTOR'::public."UserTier" NOT NULL,
    status public."UserStatus" DEFAULT 'INVITED'::public."UserStatus" NOT NULL,
    "mfaSecret" text,
    "mfaEnabled" boolean DEFAULT false NOT NULL,
    "lastLoginAt" timestamp(3) without time zone,
    "failedLogins" integer DEFAULT 0 NOT NULL,
    "lockedUntil" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "inviteExpiresAt" timestamp(3) without time zone,
    "inviteTokenHash" text,
    "invitedAt" timestamp(3) without time zone,
    "invitedById" text,
    "isPlatformStaff" boolean DEFAULT false NOT NULL,
    "branchId" text
);

CREATE TABLE public.wopi_sessions (
    id text NOT NULL,
    "documentId" text NOT NULL,
    "userId" text NOT NULL,
    "accessToken" text NOT NULL,
    "canWrite" boolean DEFAULT false NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.workflow_definitions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    description text,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    trigger jsonb,
    "isActive" boolean DEFAULT true NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE public.workflow_instances (
    id text NOT NULL,
    "definitionId" text NOT NULL,
    "documentId" text NOT NULL,
    status public."WorkflowStatus" DEFAULT 'ACTIVE'::public."WorkflowStatus" NOT NULL,
    "currentStep" integer DEFAULT 0 NOT NULL,
    "initiatorId" text,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completedAt" timestamp(3) without time zone,
    "dueAt" timestamp(3) without time zone
);

CREATE TABLE public.workflow_tasks (
    id text NOT NULL,
    "instanceId" text NOT NULL,
    "stepIndex" integer NOT NULL,
    "stepKey" text NOT NULL,
    action public."TaskAction" NOT NULL,
    status public."TaskStatus" DEFAULT 'PENDING'::public."TaskStatus" NOT NULL,
    "assigneeType" public."SubjectType" DEFAULT 'USER'::public."SubjectType" NOT NULL,
    "assigneeId" text,
    "assigneeGroupId" text,
    "grantedLevel" public."AccessLevel" DEFAULT 'READ'::public."AccessLevel" NOT NULL,
    comment text,
    "decidedAt" timestamp(3) without time zone,
    "dueAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.change_log ALTER COLUMN seq SET DEFAULT nextval('public.change_log_seq_seq'::regclass);

ALTER TABLE ONLY public.access_grants
    ADD CONSTRAINT access_grants_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.change_log
    ADD CONSTRAINT change_log_pkey PRIMARY KEY (seq);

ALTER TABLE ONLY public.channel_identities
    ADD CONSTRAINT channel_identities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.channel_messages
    ADD CONSTRAINT channel_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.document_index
    ADD CONSTRAINT document_index_pkey PRIMARY KEY ("documentId");

ALTER TABLE ONLY public.document_summaries
    ADD CONSTRAINT document_summaries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.document_tags
    ADD CONSTRAINT document_tags_pkey PRIMARY KEY ("documentId", "tagId");

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT document_versions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.document_view_sessions
    ADD CONSTRAINT document_view_sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.extraction_results
    ADD CONSTRAINT extraction_results_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.form_definitions
    ADD CONSTRAINT form_definitions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT form_submissions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.installation
    ADD CONSTRAINT installation_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.integration_connections
    ADD CONSTRAINT integration_connections_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.legal_holds
    ADD CONSTRAINT legal_holds_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ocr_pages
    ADD CONSTRAINT ocr_pages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.organization_domains
    ADD CONSTRAINT organization_domains_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.page_views
    ADD CONSTRAINT page_views_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.processing_jobs
    ADD CONSTRAINT processing_jobs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.retention_policies
    ADD CONSTRAINT retention_policies_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.saved_searches
    ADD CONSTRAINT saved_searches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.share_accesses
    ADD CONSTRAINT share_accesses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.signature_fields
    ADD CONSTRAINT signature_fields_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.signature_requests
    ADD CONSTRAINT signature_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.signatures
    ADD CONSTRAINT signatures_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tenant_hostnames
    ADD CONSTRAINT tenant_hostnames_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.wopi_sessions
    ADD CONSTRAINT wopi_sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workflow_definitions
    ADD CONSTRAINT workflow_definitions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workflow_instances
    ADD CONSTRAINT workflow_instances_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workflow_tasks
    ADD CONSTRAINT workflow_tasks_pkey PRIMARY KEY (id);

CREATE INDEX "access_grants_branchId_idx" ON public.access_grants USING btree ("branchId");

CREATE INDEX "access_grants_documentId_subjectType_idx" ON public.access_grants USING btree ("documentId", "subjectType");

CREATE INDEX "access_grants_folderId_subjectType_idx" ON public.access_grants USING btree ("folderId", "subjectType");

CREATE INDEX "access_grants_groupId_idx" ON public.access_grants USING btree ("groupId");

CREATE INDEX "access_grants_userId_idx" ON public.access_grants USING btree ("userId");

CREATE UNIQUE INDEX "api_keys_keyHash_key" ON public.api_keys USING btree ("keyHash");

CREATE INDEX "audit_events_actorId_createdAt_idx" ON public.audit_events USING btree ("actorId", "createdAt");

CREATE INDEX "audit_events_organizationId_createdAt_idx" ON public.audit_events USING btree ("organizationId", "createdAt");

CREATE INDEX "audit_events_organizationId_resourceType_resourceId_idx" ON public.audit_events USING btree ("organizationId", "resourceType", "resourceId");

CREATE UNIQUE INDEX branches_live_name_key ON public.branches USING btree ("organizationId", name) WHERE ("deletedAt" IS NULL);

CREATE INDEX "branches_organizationId_parentId_idx" ON public.branches USING btree ("organizationId", "parentId");

CREATE INDEX "change_log_entityType_entityId_idx" ON public.change_log USING btree ("entityType", "entityId");

CREATE INDEX "change_log_organizationId_seq_idx" ON public.change_log USING btree ("organizationId", seq);

CREATE UNIQUE INDEX channel_identities_channel_identifier_key ON public.channel_identities USING btree (channel, identifier);

CREATE INDEX "channel_identities_userId_idx" ON public.channel_identities USING btree ("userId");

CREATE INDEX "channel_messages_channel_direction_createdAt_idx" ON public.channel_messages USING btree (channel, direction, "createdAt");

CREATE UNIQUE INDEX "channel_messages_channel_externalId_key" ON public.channel_messages USING btree (channel, "externalId");

CREATE INDEX "channel_messages_documentId_idx" ON public.channel_messages USING btree ("documentId");

CREATE INDEX "comments_documentId_createdAt_idx" ON public.comments USING btree ("documentId", "createdAt");

CREATE UNIQUE INDEX "devices_userId_name_key" ON public.devices USING btree ("userId", name);

CREATE UNIQUE INDEX "document_chunks_documentId_chunkIndex_key" ON public.document_chunks USING btree ("documentId", "chunkIndex");

CREATE INDEX document_index_tsv_idx ON public.document_index USING gin (tsv);

CREATE INDEX "document_summaries_documentId_style_idx" ON public.document_summaries USING btree ("documentId", style);

CREATE INDEX document_versions_checksum_idx ON public.document_versions USING btree (checksum);

CREATE UNIQUE INDEX "document_versions_documentId_versionNumber_key" ON public.document_versions USING btree ("documentId", "versionNumber");

CREATE INDEX "document_view_sessions_documentId_startedAt_idx" ON public.document_view_sessions USING btree ("documentId", "startedAt");

CREATE UNIQUE INDEX "documents_currentVersionId_key" ON public.documents USING btree ("currentVersionId");

CREATE INDEX documents_name_idx ON public.documents USING gin (name public.gin_trgm_ops);

CREATE INDEX "documents_organizationId_folderId_deletedAt_idx" ON public.documents USING btree ("organizationId", "folderId", "deletedAt");

CREATE INDEX "documents_organizationId_status_idx" ON public.documents USING btree ("organizationId", status);

CREATE INDEX "documents_organizationId_updatedAt_idx" ON public.documents USING btree ("organizationId", "updatedAt");

CREATE INDEX "documents_ownerId_idx" ON public.documents USING btree ("ownerId");

CREATE INDEX documents_purge_idx ON public.documents USING btree ("purgeAfter") WHERE ("deletedAt" IS NOT NULL);

CREATE INDEX "extraction_results_documentId_schemaKey_idx" ON public.extraction_results USING btree ("documentId", "schemaKey");

CREATE UNIQUE INDEX folders_live_name_key ON public.folders USING btree ("parentId", name) WHERE ("deletedAt" IS NULL);

CREATE UNIQUE INDEX folders_live_root_name_key ON public.folders USING btree ("organizationId", name) NULLS NOT DISTINCT WHERE (("deletedAt" IS NULL) AND ("parentId" IS NULL));

CREATE INDEX "folders_organizationId_parentId_idx" ON public.folders USING btree ("organizationId", "parentId");

CREATE INDEX "folders_organizationId_path_idx" ON public.folders USING btree ("organizationId", path);

CREATE UNIQUE INDEX "form_definitions_organizationId_name_key" ON public.form_definitions USING btree ("organizationId", name);

CREATE INDEX "form_submissions_formId_createdAt_idx" ON public.form_submissions USING btree ("formId", "createdAt");

CREATE UNIQUE INDEX "group_members_groupId_userId_key" ON public.group_members USING btree ("groupId", "userId");

CREATE UNIQUE INDEX "groups_organizationId_name_key" ON public.groups USING btree ("organizationId", name);

CREATE UNIQUE INDEX "installation_deploymentId_key" ON public.installation USING btree ("deploymentId");

CREATE UNIQUE INDEX installation_singleton_idx ON public.installation USING btree ((true));

CREATE UNIQUE INDEX "integration_connections_organizationId_provider_userId_key" ON public.integration_connections USING btree ("organizationId", provider, "userId");

CREATE UNIQUE INDEX "invoice_line_items_extractionId_lineNumber_key" ON public.invoice_line_items USING btree ("extractionId", "lineNumber");

CREATE INDEX "legal_holds_documentId_releasedAt_idx" ON public.legal_holds USING btree ("documentId", "releasedAt");

CREATE INDEX "ocr_pages_documentId_idx" ON public.ocr_pages USING btree ("documentId");

CREATE UNIQUE INDEX "ocr_pages_versionId_pageNumber_key" ON public.ocr_pages USING btree ("versionId", "pageNumber");

CREATE UNIQUE INDEX organization_domains_domain_key ON public.organization_domains USING btree (domain);

CREATE INDEX "organization_domains_organizationId_idx" ON public.organization_domains USING btree ("organizationId");

CREATE UNIQUE INDEX organizations_single_platform_idx ON public.organizations USING btree ("isPlatform") WHERE ("isPlatform" = true);

CREATE UNIQUE INDEX organizations_slug_key ON public.organizations USING btree (slug);

CREATE INDEX "page_views_sessionId_pageNumber_idx" ON public.page_views USING btree ("sessionId", "pageNumber");

CREATE INDEX "processing_jobs_batchId_idx" ON public.processing_jobs USING btree ("batchId");

CREATE INDEX "processing_jobs_documentId_idx" ON public.processing_jobs USING btree ("documentId");

CREATE INDEX processing_jobs_status_type_idx ON public.processing_jobs USING btree (status, type);

CREATE UNIQUE INDEX "retention_policies_organizationId_name_key" ON public.retention_policies USING btree ("organizationId", name);

CREATE UNIQUE INDEX "roles_organizationId_key_key" ON public.roles USING btree ("organizationId", key);

CREATE INDEX "saved_searches_userId_idx" ON public.saved_searches USING btree ("userId");

CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON public.sessions USING btree ("refreshTokenHash");

CREATE INDEX "sessions_userId_expiresAt_idx" ON public.sessions USING btree ("userId", "expiresAt");

CREATE INDEX "share_accesses_shareLinkId_createdAt_idx" ON public.share_accesses USING btree ("shareLinkId", "createdAt");

CREATE INDEX share_links_active_idx ON public.share_links USING btree (token) WHERE ("revokedAt" IS NULL);

CREATE INDEX "share_links_documentId_idx" ON public.share_links USING btree ("documentId");

CREATE INDEX "share_links_expiresAt_idx" ON public.share_links USING btree ("expiresAt");

CREATE UNIQUE INDEX share_links_token_key ON public.share_links USING btree (token);

CREATE INDEX "signature_fields_requestId_idx" ON public.signature_fields USING btree ("requestId");

CREATE INDEX "signature_requests_documentId_idx" ON public.signature_requests USING btree ("documentId");

CREATE UNIQUE INDEX "signatures_fieldId_key" ON public.signatures USING btree ("fieldId");

CREATE INDEX "signatures_requestId_idx" ON public.signatures USING btree ("requestId");

CREATE UNIQUE INDEX "tags_organizationId_name_key" ON public.tags USING btree ("organizationId", name);

CREATE UNIQUE INDEX tenant_hostnames_hostname_key ON public.tenant_hostnames USING btree (hostname);

CREATE UNIQUE INDEX tenant_hostnames_one_primary_idx ON public.tenant_hostnames USING btree ("organizationId") WHERE ("isPrimary" = true);

CREATE INDEX "tenant_hostnames_organizationId_idx" ON public.tenant_hostnames USING btree ("organizationId");

CREATE UNIQUE INDEX "user_roles_userId_roleId_key" ON public.user_roles USING btree ("userId", "roleId");

CREATE UNIQUE INDEX "users_inviteTokenHash_key" ON public.users USING btree ("inviteTokenHash");

CREATE UNIQUE INDEX "users_organizationId_email_key" ON public.users USING btree ("organizationId", email);

CREATE INDEX "users_organizationId_status_idx" ON public.users USING btree ("organizationId", status);

CREATE UNIQUE INDEX "wopi_sessions_accessToken_key" ON public.wopi_sessions USING btree ("accessToken");

CREATE INDEX "wopi_sessions_documentId_idx" ON public.wopi_sessions USING btree ("documentId");

CREATE UNIQUE INDEX "workflow_definitions_organizationId_name_version_key" ON public.workflow_definitions USING btree ("organizationId", name, version);

CREATE INDEX "workflow_instances_documentId_idx" ON public.workflow_instances USING btree ("documentId");

CREATE INDEX "workflow_instances_status_dueAt_idx" ON public.workflow_instances USING btree (status, "dueAt");

CREATE INDEX "workflow_tasks_assigneeId_status_idx" ON public.workflow_tasks USING btree ("assigneeId", status);

CREATE INDEX "workflow_tasks_instanceId_stepIndex_idx" ON public.workflow_tasks USING btree ("instanceId", "stepIndex");

CREATE TRIGGER audit_events_no_update BEFORE DELETE OR UPDATE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.audit_events_immutable();

CREATE TRIGGER documents_not_in_platform_org BEFORE INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public.platform_org_holds_no_documents();

CREATE TRIGGER folders_not_in_platform_org BEFORE INSERT ON public.folders FOR EACH ROW EXECUTE FUNCTION public.platform_org_holds_no_documents();

ALTER TABLE ONLY public.access_grants
    ADD CONSTRAINT "access_grants_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.access_grants
    ADD CONSTRAINT "access_grants_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.access_grants
    ADD CONSTRAINT "access_grants_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES public.folders(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.access_grants
    ADD CONSTRAINT "access_grants_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.access_grants
    ADD CONSTRAINT "access_grants_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.access_grants
    ADD CONSTRAINT "access_grants_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.access_grants
    ADD CONSTRAINT "access_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT "audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT "audit_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT "branches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT "branches_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.change_log
    ADD CONSTRAINT "change_log_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.channel_identities
    ADD CONSTRAINT "channel_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.channel_messages
    ADD CONSTRAINT "channel_messages_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.channel_messages
    ADD CONSTRAINT "channel_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT "comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT "comments_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.comments(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT "devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT "document_chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.document_index
    ADD CONSTRAINT "document_index_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.document_summaries
    ADD CONSTRAINT "document_summaries_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.document_tags
    ADD CONSTRAINT "document_tags_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.document_tags
    ADD CONSTRAINT "document_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES public.tags(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT "document_versions_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT "document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.document_view_sessions
    ADD CONSTRAINT "document_view_sessions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.document_view_sessions
    ADD CONSTRAINT "document_view_sessions_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES public.share_links(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.document_view_sessions
    ADD CONSTRAINT "document_view_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES public.document_versions(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES public.folders(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_retentionPolicyId_fkey" FOREIGN KEY ("retentionPolicyId") REFERENCES public.retention_policies(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.extraction_results
    ADD CONSTRAINT "extraction_results_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT "folders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT "folders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT "folders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT "folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.folders(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT "folders_retentionPolicyId_fkey" FOREIGN KEY ("retentionPolicyId") REFERENCES public.retention_policies(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.form_definitions
    ADD CONSTRAINT "form_definitions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT "form_submissions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT "form_submissions_formId_fkey" FOREIGN KEY ("formId") REFERENCES public.form_definitions(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT "group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT "group_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT "groups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT "groups_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.integration_connections
    ADD CONSTRAINT "integration_connections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT "invoice_line_items_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES public.extraction_results(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.legal_holds
    ADD CONSTRAINT "legal_holds_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.organization_domains
    ADD CONSTRAINT "organization_domains_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.page_views
    ADD CONSTRAINT "page_views_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public.document_view_sessions(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.processing_jobs
    ADD CONSTRAINT "processing_jobs_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.retention_policies
    ADD CONSTRAINT "retention_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT "roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.share_accesses
    ADD CONSTRAINT "share_accesses_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES public.share_links(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT "share_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT "share_links_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.signature_fields
    ADD CONSTRAINT "signature_fields_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES public.signature_requests(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.signature_requests
    ADD CONSTRAINT "signature_requests_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.signatures
    ADD CONSTRAINT "signatures_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES public.signature_fields(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.signatures
    ADD CONSTRAINT "signatures_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES public.signature_requests(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.signatures
    ADD CONSTRAINT "signatures_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.tenant_hostnames
    ADD CONSTRAINT "tenant_hostnames_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.workflow_definitions
    ADD CONSTRAINT "workflow_definitions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.workflow_instances
    ADD CONSTRAINT "workflow_instances_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES public.workflow_definitions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.workflow_instances
    ADD CONSTRAINT "workflow_instances_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.workflow_instances
    ADD CONSTRAINT "workflow_instances_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.workflow_tasks
    ADD CONSTRAINT "workflow_tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.workflow_tasks
    ADD CONSTRAINT "workflow_tasks_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES public.workflow_instances(id) ON UPDATE CASCADE ON DELETE CASCADE;

