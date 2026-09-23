-- =============================================================================
-- A field whose value is a person.
--
-- HR needs to say "this record is about this employee", and there was no
-- honest way to. A text field holding a name is not a link: people share
-- names, change them, and get typed inconsistently, so "every document about
-- Grace Balogun" becomes a string match that is wrong the first time somebody
-- writes G. Balogun.
--
-- Added as a field kind rather than a column on documents, because the
-- question is not HR's alone. A contract has a signatory, an incident report
-- has someone involved, an appraisal has a subject and an author. One more
-- kind in a vocabulary that already exists beats a parallel mechanism for each
-- of them.
--
-- The value is a real foreign key, so a person who is deleted cannot leave a
-- field pointing at nobody — and a report of "documents about this employee"
-- cannot silently miss one because the spelling drifted.
-- =============================================================================

ALTER TYPE public."FieldKind" ADD VALUE IF NOT EXISTS 'USER';

ALTER TABLE public.document_field_values
    ADD COLUMN "valueUser" text;

ALTER TABLE ONLY public.document_field_values
    ADD CONSTRAINT "document_field_values_valueUser_fkey"
    FOREIGN KEY ("valueUser") REFERENCES public.users(id) ON DELETE SET NULL;

-- "Every document about this person" is the query HR is built on, so it is
-- the one that gets an index.
CREATE INDEX "document_field_values_valueUser_idx"
    ON public.document_field_values USING btree ("valueUser")
    WHERE "valueUser" IS NOT NULL;

COMMENT ON COLUMN public.document_field_values."valueUser" IS
  'The person a USER-kind field points at. A reference rather than a name, so '
  'that "documents about this employee" cannot miss one to a spelling.';

-- The "exactly one value" rule has to count the new column too, or a row
-- carrying only a person would be refused as empty.
ALTER TABLE public.document_field_values
    DROP CONSTRAINT document_field_values_exactly_one_value;

ALTER TABLE ONLY public.document_field_values
    ADD CONSTRAINT document_field_values_exactly_one_value
    CHECK (
        (("valueText" IS NOT NULL)::int
         + ("valueDate" IS NOT NULL)::int
         + ("valueNumber" IS NOT NULL)::int
         + ("valueBool" IS NOT NULL)::int
         + ("valueUser" IS NOT NULL)::int) = 1
    );
