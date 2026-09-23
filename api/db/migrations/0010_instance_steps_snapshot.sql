-- An instance runs the steps it started with.
--
-- Every read of a running instance joined workflow_definitions and took the
-- steps live, so editing a definition rewrote what was already in progress.
-- The interface has been telling people the opposite, and the interface is
-- right: somebody who approved step 1 of a two-step review agreed to that, not
-- to a third step added afterwards.
--
-- It is worse than a policy question. A task records the index of the step it
-- belongs to. Remove a step from the middle of a definition and every open task
-- on it now points at a different step than the one it was raised for — the
-- name shown to the approver, the access it grants and the action it asks for
-- all shift silently under them.
--
-- So the steps are copied onto the instance when it starts. The definition
-- stays the template that new instances are cut from.

ALTER TABLE public.workflow_instances
    ADD COLUMN steps jsonb;

-- Existing instances have only ever run their definition's current steps, so
-- that is their history as much as their present.
UPDATE public.workflow_instances i
   SET steps = w.steps
  FROM public.workflow_definitions w
 WHERE w.id = i."definitionId";

ALTER TABLE public.workflow_instances
    ALTER COLUMN steps SET NOT NULL;

COMMENT ON COLUMN public.workflow_instances.steps IS
    'The steps as they stood when this instance started. Read in preference to '
    'the definition''s, which may have been edited since.';
