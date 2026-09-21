-- =============================================================================
-- User-defined document types with typed index fields.
--
-- The backbone of the product (requirements TYP-1 to TYP-7). Search filters,
-- retention rules, workflow triggers, automatic indexing and per-type
-- watermarking all key off this, which is why it comes before any of them.
--
-- Three tables:
--   document_types         what a customer calls a kind of record
--   document_type_fields   the typed fields that kind carries
--   document_field_values  what one document holds in those fields
--
-- Values are stored in typed columns rather than a single text column or a
-- JSON blob, because TYP-3 requires the fields to be searchable *as fields* —
-- "contracts expiring between two dates", "amount above four hundred million".
-- A text column cannot answer either without casting every row, and a JSON
-- blob cannot be indexed usefully for ranges. One column per kind keeps the
-- comparison native and the index B-tree ordinary.
-- =============================================================================

CREATE TYPE public."FieldKind" AS ENUM (
  'TEXT',
  'DATE',
  'NUMBER',
  'BOOLEAN',
  'SELECT'
);

CREATE TYPE public."DocumentTypeStatus" AS ENUM (
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED'
);

-- -----------------------------------------------------------------------------

CREATE TABLE public.document_types (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    description text,
    status public."DocumentTypeStatus" DEFAULT 'DRAFT'::public."DocumentTypeStatus" NOT NULL,

    -- TYP-5. A board paper holds one edition; a contract holds its history.
    -- Off means a new upload replaces rather than versions.
    "keepVersions" boolean DEFAULT true NOT NULL,

    -- TYP-6. Every view of a record of this type is watermarked, however it
    -- was reached — not only through a share link.
    "watermarkAll" boolean DEFAULT false NOT NULL,

    -- GOV-6. Retention is set per type, so the schedule travels with the kind
    -- of record rather than being attached document by document.
    "retentionPolicyId" text,

    -- Classification a document of this type starts at. A personnel file is
    -- restricted by default; correspondence is not.
    "defaultClassification" public."Classification"
        DEFAULT 'INTERNAL'::public."Classification" NOT NULL,

    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "archivedAt" timestamp(3) without time zone
);

ALTER TABLE ONLY public.document_types
    ADD CONSTRAINT document_types_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.document_types
    ADD CONSTRAINT "document_types_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.document_types
    ADD CONSTRAINT "document_types_retentionPolicyId_fkey"
    FOREIGN KEY ("retentionPolicyId") REFERENCES public.retention_policies(id) ON DELETE SET NULL;

-- A tenant cannot have two types of the same name; two tenants can.
CREATE UNIQUE INDEX "document_types_organizationId_name_key"
    ON public.document_types USING btree ("organizationId", name);

-- -----------------------------------------------------------------------------

CREATE TABLE public.document_type_fields (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "documentTypeId" text NOT NULL,
    name text NOT NULL,
    description text,
    kind public."FieldKind" DEFAULT 'TEXT'::public."FieldKind" NOT NULL,
    required boolean DEFAULT false NOT NULL,

    -- SELECT only. Empty for every other kind.
    options text[] DEFAULT ARRAY[]::text[] NOT NULL,

    -- Display order within the type. Sparse on purpose, so a field can be
    -- inserted between two others without renumbering the rest.
    position integer DEFAULT 0 NOT NULL,

    -- The field the retention clock counts from, where the type's policy is
    -- anchored to a field rather than to ingest. At most one per type.
    "isRetentionAnchor" boolean DEFAULT false NOT NULL,

    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE ONLY public.document_type_fields
    ADD CONSTRAINT document_type_fields_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.document_type_fields
    ADD CONSTRAINT "document_type_fields_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.document_type_fields
    ADD CONSTRAINT "document_type_fields_documentTypeId_fkey"
    FOREIGN KEY ("documentTypeId") REFERENCES public.document_types(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX "document_type_fields_documentTypeId_name_key"
    ON public.document_type_fields USING btree ("documentTypeId", name);

CREATE INDEX "document_type_fields_documentTypeId_position_idx"
    ON public.document_type_fields USING btree ("documentTypeId", position);

-- At most one anchor field per type. A partial unique index rather than a
-- trigger: the database enforces it and the intent reads off the schema.
CREATE UNIQUE INDEX "document_type_fields_one_anchor_per_type"
    ON public.document_type_fields USING btree ("documentTypeId")
    WHERE "isRetentionAnchor";

-- A SELECT field needs options; nothing else may carry them. Without this a
-- selection list with no values is a field nobody can fill in.
ALTER TABLE ONLY public.document_type_fields
    ADD CONSTRAINT document_type_fields_options_match_kind
    CHECK (
        (kind = 'SELECT'::public."FieldKind" AND array_length(options, 1) >= 1)
        OR (kind <> 'SELECT'::public."FieldKind" AND array_length(options, 1) IS NULL)
    );

-- -----------------------------------------------------------------------------

CREATE TABLE public.document_field_values (
    "organizationId" text NOT NULL,
    "documentId" text NOT NULL,
    "fieldId" text NOT NULL,

    -- Exactly one of these carries the value, decided by the field's kind.
    -- SELECT and TEXT both use valueText.
    "valueText" text,
    "valueDate" timestamp(3) without time zone,
    "valueNumber" numeric(20,4),
    "valueBool" boolean,

    -- Where the value came from, so an extracted figure can be told apart
    -- from one a person typed (CAP-6, CAP-10).
    "enteredById" text,
    confidence double precision,

    "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE ONLY public.document_field_values
    ADD CONSTRAINT document_field_values_pkey PRIMARY KEY ("documentId", "fieldId");

ALTER TABLE ONLY public.document_field_values
    ADD CONSTRAINT "document_field_values_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.document_field_values
    ADD CONSTRAINT "document_field_values_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.document_field_values
    ADD CONSTRAINT "document_field_values_fieldId_fkey"
    FOREIGN KEY ("fieldId") REFERENCES public.document_type_fields(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.document_field_values
    ADD CONSTRAINT "document_field_values_enteredById_fkey"
    FOREIGN KEY ("enteredById") REFERENCES public.users(id) ON DELETE SET NULL;

-- Exactly one value column populated. A row with two is ambiguous and a row
-- with none is a value that was never set, which is an absent row instead.
ALTER TABLE ONLY public.document_field_values
    ADD CONSTRAINT document_field_values_exactly_one_value
    CHECK (
        (("valueText" IS NOT NULL)::int
         + ("valueDate" IS NOT NULL)::int
         + ("valueNumber" IS NOT NULL)::int
         + ("valueBool" IS NOT NULL)::int) = 1
    );

-- The indexes that make TYP-3 a field search rather than a table scan. One
-- per kind, each scoped to the tenant so a query never crosses tenancies.
CREATE INDEX "document_field_values_text_idx"
    ON public.document_field_values USING btree ("organizationId", "fieldId", "valueText");

CREATE INDEX "document_field_values_date_idx"
    ON public.document_field_values USING btree ("organizationId", "fieldId", "valueDate");

CREATE INDEX "document_field_values_number_idx"
    ON public.document_field_values USING btree ("organizationId", "fieldId", "valueNumber");

CREATE INDEX "document_field_values_documentId_idx"
    ON public.document_field_values USING btree ("documentId");

-- -----------------------------------------------------------------------------
-- A document's type.
--
-- Nullable, and stays that way: Correspondence is the fallback for anything
-- untyped, and forcing a type at upload would mean refusing a document
-- because nobody had decided what to call it yet.
-- -----------------------------------------------------------------------------

ALTER TABLE public.documents
    ADD COLUMN "documentTypeId" text;

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_documentTypeId_fkey"
    FOREIGN KEY ("documentTypeId") REFERENCES public.document_types(id) ON DELETE SET NULL;

CREATE INDEX "documents_organizationId_documentTypeId_idx"
    ON public.documents USING btree ("organizationId", "documentTypeId");
