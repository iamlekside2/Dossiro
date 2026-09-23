-- =============================================================================
-- Which roles may file a record as a given document type.
--
-- The design shows a "Who can file it" pane and the schema had nothing behind
-- it, so the pane said so. This is what it says instead.
--
-- Modelled as an allowlist that is empty by default, which means the absence
-- of rows is "anybody who can add a document here", not "nobody". The opposite
-- default would silently lock every existing type the moment this shipped.
--
-- This restricts FILING, not reading. Who may open a record is decided by the
-- folder it sits in and its classification; this decides who may declare a
-- record to be of this kind. They are different questions and conflating them
-- would give a second, quieter way to grant access.
-- =============================================================================

CREATE TABLE public.document_type_roles (
    "organizationId" text NOT NULL,
    "documentTypeId" text NOT NULL,
    "roleId" text NOT NULL,
    "grantedById" text,
    "grantedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.document_type_roles
    ADD CONSTRAINT document_type_roles_pkey PRIMARY KEY ("documentTypeId", "roleId");

ALTER TABLE ONLY public.document_type_roles
    ADD CONSTRAINT "document_type_roles_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Deleting a type takes its restrictions with it; they describe nothing
-- without it.
ALTER TABLE ONLY public.document_type_roles
    ADD CONSTRAINT "document_type_roles_documentTypeId_fkey"
    FOREIGN KEY ("documentTypeId") REFERENCES public.document_types(id) ON DELETE CASCADE;

-- Deleting a role removes the grant rather than leaving a restriction keyed to
-- a role that no longer exists — which would read as "nobody may file this".
ALTER TABLE ONLY public.document_type_roles
    ADD CONSTRAINT "document_type_roles_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES public.roles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.document_type_roles
    ADD CONSTRAINT "document_type_roles_grantedById_fkey"
    FOREIGN KEY ("grantedById") REFERENCES public.users(id) ON DELETE SET NULL;

-- The question asked on every filing attempt is "may this person's roles file
-- this type", so the lookup is by type.
CREATE INDEX "document_type_roles_documentTypeId_idx"
    ON public.document_type_roles USING btree ("documentTypeId");

CREATE INDEX "document_type_roles_roleId_idx"
    ON public.document_type_roles USING btree ("roleId");

COMMENT ON TABLE public.document_type_roles IS
  'Allowlist of roles permitted to file a record as this type. No rows means '
  'unrestricted. Restricts filing only — reading is governed by the folder and '
  'the classification.';
