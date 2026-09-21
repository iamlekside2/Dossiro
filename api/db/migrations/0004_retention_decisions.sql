-- =============================================================================
-- Disposition decisions (GOV-7).
--
-- When a document's retention period elapses it enters a review queue rather
-- than being destroyed. A named person decides what happens, and that decision
-- is recorded — which is the whole point of the requirement: "a named person
-- confirms, and the confirmation is recorded".
--
-- The table exists because the queue needs to know what has already been
-- looked at. Without it a reviewed document reappears the next day and the
-- queue is never empty, which trains people to ignore it.
--
-- Note what is NOT here: nothing in this table destroys anything. A DESTROY
-- decision marks the document deleted and lets the existing purge job, with
-- its legal-hold check and its recovery window, do the only thing in the
-- system that removes bytes.
-- =============================================================================

CREATE TYPE public."DispositionDecision" AS ENUM (
  'KEEP',      -- keep it, and reset the clock
  'DESTROY',   -- send it to the recycle bin; the purge job takes it from there
  'TRANSFER'   -- hand it to an archive; recorded, not automated
);

CREATE TABLE public.retention_decisions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "documentId" text NOT NULL,
    decision public."DispositionDecision" NOT NULL,

    -- Required by the service, not by the column: a disposition with no stated
    -- reason is not a decision anybody can answer for later.
    reason text NOT NULL,

    -- Which schedule and which date the clock was counted from, captured at
    -- the moment of the decision. The type's policy can change afterwards, and
    -- the record of why this document came up for review should not change
    -- with it.
    "policyName" text,
    "dueAt" timestamp(3) without time zone NOT NULL,

    "decidedById" text,
    "decidedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.retention_decisions
    ADD CONSTRAINT retention_decisions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.retention_decisions
    ADD CONSTRAINT "retention_decisions_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.retention_decisions
    ADD CONSTRAINT "retention_decisions_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.retention_decisions
    ADD CONSTRAINT "retention_decisions_decidedById_fkey"
    FOREIGN KEY ("decidedById") REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.retention_decisions
    ADD CONSTRAINT retention_decisions_reason_not_blank
    CHECK (length(btrim(reason)) > 0);

-- The queue asks "has this document been decided since it last came due", so
-- the lookup is by document and time.
CREATE INDEX "retention_decisions_documentId_decidedAt_idx"
    ON public.retention_decisions USING btree ("documentId", "decidedAt" DESC);

CREATE INDEX "retention_decisions_organizationId_decidedAt_idx"
    ON public.retention_decisions USING btree ("organizationId", "decidedAt" DESC);

-- -----------------------------------------------------------------------------
-- The anchor a schedule counts from.
--
-- 0001 gave retention_policies an `anchor` text column defaulting to 'created'.
-- A schedule attached to a document type can instead count from one of that
-- type's own date fields — a contract's expiry, an employee's leaving date —
-- which is what makes "six years after they leave" expressible at all. The
-- field is marked on the type (document_type_fields.isRetentionAnchor); this
-- says whether the policy uses it.
-- -----------------------------------------------------------------------------

ALTER TABLE public.retention_policies
    ADD COLUMN "useTypeAnchor" boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN public.retention_policies."useTypeAnchor" IS
  'Count from the type''s anchor field rather than from ingest. Falls back to '
  'ingest when the document has no value in that field, so a contract with no '
  'expiry recorded is still reviewed rather than being retained forever.';
