-- Why a task is sitting there with nobody able to act on it.
--
-- The engine already refused to skip a step nobody holds, on the grounds that
-- silently advancing past an approval is the one outcome nobody wants. It left
-- the task unassigned instead. That is right, and it threw away the reason: an
-- administrator looking at a stuck workflow could see that no name was attached
-- and not why.
--
-- There are now two reasons, and they need different remedies. NO_ASSIGNEE
-- means the role is empty, so somebody must be given it. REFUSED means the
-- people who hold it are denied the record, so either the deny goes or the step
-- is reassigned. Guessing between them from the outside is not possible.
--
-- Nullable, and null on every task that is proceeding normally.

ALTER TABLE public.workflow_tasks
    ADD COLUMN "blockedReason" text;

ALTER TABLE ONLY public.workflow_tasks
    ADD CONSTRAINT workflow_tasks_blocked_reason_known
    CHECK ("blockedReason" IS NULL OR "blockedReason" IN ('NO_ASSIGNEE', 'REFUSED'));

COMMENT ON COLUMN public.workflow_tasks."blockedReason" IS
    'Why this task has no assignee: NO_ASSIGNEE (nobody holds the role) or '
    'REFUSED (everybody who does is denied the record). Null when assigned.';
