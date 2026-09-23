-- =============================================================================
-- Support access (PLT-2).
--
-- Operating the platform confers no sight of customer records. That is
-- currently true by construction: every query is scoped to the caller's own
-- organisation, and an operator's is the platform realm, which holds nothing.
--
-- Support sometimes genuinely needs to look. This is the only way that can
-- happen, and it is built so the tenant is never in the dark about it:
--
--   * scoped   — metadata, configuration or documents, and nothing wider
--   * reasoned — a sentence the tenant reads, not an internal ticket number
--   * approved — by the tenant, for anything touching documents
--   * expiring — a window, not a standing grant
--   * revocable — by the tenant, instantly, without asking us
--   * recorded — in the TENANT's audit trail, not only ours
--
-- Break-glass exists for a confirmed platform outage, where waiting for an
-- approver means the tenant stays down. It is capped hard and flagged for
-- review rather than being a quieter version of the same door.
-- =============================================================================

CREATE TYPE public."SupportScope" AS ENUM (
  'METADATA',        -- names, sizes, folder structure. No content.
  'CONFIGURATION',   -- types, roles, retention rules, integrations
  'DOCUMENTS'        -- the records themselves. Tenant approval required.
);

CREATE TYPE public."SupportSessionState" AS ENUM (
  'REQUESTED',
  'ACTIVE',
  'REFUSED',
  'REVOKED',
  'EXPIRED'
);

CREATE TABLE public.support_sessions (
    id text NOT NULL,

    -- The tenant being looked at. Not the operator's own organisation — that
    -- is the whole point, and the reason this table cannot be scoped the way
    -- every other table is.
    "organizationId" text NOT NULL,

    "operatorId" text NOT NULL,
    scope public."SupportScope" NOT NULL,
    state public."SupportSessionState" DEFAULT 'REQUESTED'::public."SupportSessionState" NOT NULL,

    -- Shown to the tenant verbatim. A reason nobody outside support can read
    -- is not a reason, it is a formality.
    reason text NOT NULL,

    "requestedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "approvedAt" timestamp(3) without time zone,
    "approvedById" text,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    "revokedById" text,
    "revokedReason" text,

    -- Taken without an approver during a confirmed outage. Never a shortcut:
    -- capped at 30 minutes by a constraint below, and surfaced for review.
    "breakGlass" boolean DEFAULT false NOT NULL,
    "reviewedAt" timestamp(3) without time zone,
    "reviewedById" text
);

ALTER TABLE ONLY public.support_sessions
    ADD CONSTRAINT support_sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.support_sessions
    ADD CONSTRAINT "support_sessions_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.support_sessions
    ADD CONSTRAINT "support_sessions_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.support_sessions
    ADD CONSTRAINT "support_sessions_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.support_sessions
    ADD CONSTRAINT "support_sessions_revokedById_fkey"
    FOREIGN KEY ("revokedById") REFERENCES public.users(id) ON DELETE SET NULL;

-- A reason that is blank is not a reason.
ALTER TABLE ONLY public.support_sessions
    ADD CONSTRAINT support_sessions_reason_not_blank
    CHECK (length(btrim(reason)) >= 10);

-- Break-glass is capped in the schema, not only in the service. A cap that
-- lives solely in application code is a cap somebody can forget to apply.
ALTER TABLE ONLY public.support_sessions
    ADD CONSTRAINT support_sessions_break_glass_is_short
    CHECK (
      "breakGlass" = false
      OR "expiresAt" <= "requestedAt" + interval '30 minutes'
    );

-- Anything reaching documents needs a named approver, unless it is
-- break-glass — in which case it is capped above and reviewed afterwards.
ALTER TABLE ONLY public.support_sessions
    ADD CONSTRAINT support_sessions_documents_need_approval
    CHECK (
      scope <> 'DOCUMENTS'
      OR state <> 'ACTIVE'
      OR "breakGlass" = true
      OR "approvedById" IS NOT NULL
    );

-- The tenant's question is "who is looking at us right now", so that is the
-- index. The operator's console asks the same question the other way round.
CREATE INDEX "support_sessions_organizationId_state_idx"
    ON public.support_sessions USING btree ("organizationId", state);

CREATE INDEX "support_sessions_operatorId_idx"
    ON public.support_sessions USING btree ("operatorId");

-- -----------------------------------------------------------------------------
-- Every record an operator opened during a session.
--
-- The tenant sees this list, and sees the same list the operator does. "We
-- looked at four documents" is worth nothing without naming them.
-- -----------------------------------------------------------------------------

CREATE TABLE public.support_session_views (
    id text NOT NULL,
    "sessionId" text NOT NULL,
    "documentId" text,

    -- Kept as text as well as a reference, because a document deleted later
    -- must not erase the fact that support read it.
    "documentName" text NOT NULL,

    "viewedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "dwellSeconds" integer
);

ALTER TABLE ONLY public.support_session_views
    ADD CONSTRAINT support_session_views_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.support_session_views
    ADD CONSTRAINT "support_session_views_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES public.support_sessions(id) ON DELETE CASCADE;

-- Deliberately ON DELETE SET NULL, with the name retained above.
ALTER TABLE ONLY public.support_session_views
    ADD CONSTRAINT "support_session_views_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON DELETE SET NULL;

CREATE INDEX "support_session_views_sessionId_idx"
    ON public.support_session_views USING btree ("sessionId", "viewedAt" DESC);

COMMENT ON TABLE public.support_sessions IS
  'A scoped, reasoned, expiring and tenant-revocable window during which a '
  'platform operator may look inside one tenancy. The only route by which '
  'that can happen (PLT-2).';
