-- =============================================================================
-- Fix: a selection-list field with no options was being accepted.
--
-- The check in 0002 read:
--
--   (kind =  'SELECT' AND array_length(options, 1) >= 1)
--   OR (kind <> 'SELECT' AND array_length(options, 1) IS NULL)
--
-- `array_length` on an empty array returns NULL rather than 0, and the column
-- defaults to an empty array. So for a SELECT field with no options the first
-- branch evaluated to NULL and the second to false, giving NULL overall — and
-- a CHECK constraint treats NULL as satisfied. The constraint was inert for
-- exactly the case it was written to catch.
--
-- Coalescing the length makes both branches return a real boolean. Caught by
-- testing that the constraint refuses what it is supposed to refuse, which is
-- the only way this kind of mistake shows up: the schema looked right, applied
-- cleanly, and rejected nothing.
-- =============================================================================

ALTER TABLE public.document_type_fields
    DROP CONSTRAINT document_type_fields_options_match_kind;

ALTER TABLE ONLY public.document_type_fields
    ADD CONSTRAINT document_type_fields_options_match_kind
    CHECK (
        CASE kind
            WHEN 'SELECT'::public."FieldKind" THEN coalesce(array_length(options, 1), 0) >= 1
            ELSE coalesce(array_length(options, 1), 0) = 0
        END
    );
