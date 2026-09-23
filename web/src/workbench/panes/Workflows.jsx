import { useEffect, useState } from 'react';
import api from '../../lib/api.js';
import { ins } from './ins.js';
import { callout, chip } from '../../ui.js';

/**
 * Inspector panes for a workflow definition.
 *
 * The Steps pane is the one that matters: a trigger block, then the steps as a
 * timeline. It reads the definition's own jsonb rather than a summary, so what
 * is drawn is what the engine will actually do.
 */

const ASSIGNEE_WORD = {
  USER: 'A named person',
  ROLE: 'Role',
  GROUP: 'Unit',
  BRANCH: 'Branch',
};

const isWorkflow = (w) => Boolean(w?.steps && w?.name && 'isActive' in w);

export function WorkflowStepsPane({ record }) {
  const w = record?.record;
  if (!isWorkflow(w)) return <div className={ins.noteSection}>Select a workflow.</div>;

  const steps = w.steps ?? [];
  const trigger = w.trigger ?? null;

  return (
    <div>
      <div className={ins.section}>
        <div className={ins.labelBlue}>When it starts</div>
        {trigger ? (
          <div className={callout()}>
            {w.triggerTypeName ? (
              <div>
                When a record of type <strong>{w.triggerTypeName}</strong> is filed
              </div>
            ) : null}
            {w.triggerFolderName ? (
              <div>
                Into <strong>{w.triggerFolderName}</strong>, or any folder beneath it
              </div>
            ) : null}
            {(trigger.where ?? []).map((c, i) => (
              <div key={i}>
                And an index value is {c.op === 'gt' ? 'above' : c.op === 'lt' ? 'below' : 'exactly'}{' '}
                <strong>{String(c.value)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-detail leading-[1.55] text-muted">
            Nothing starts this automatically. It runs when somebody asks for it.
          </p>
        )}
      </div>

      <div className={ins.section}>
        <div className={ins.label}>Then</div>
        {steps.length === 0 ? (
          <p className="text-detail text-dim">No steps. This workflow would complete instantly.</p>
        ) : (
          steps.map((s, i) => (
            <div key={s.key ?? i} className="flex gap-3 py-2">
              {/* A dot on a connector, so the order reads as a sequence rather
                  than a list of unrelated things. */}
              <div className="flex flex-none flex-col items-center">
                <span className="mt-1.5 h-2 w-2 rounded-full bg-blue" />
                {i < steps.length - 1 ? <span className="mt-1 w-px flex-1 bg-line-strong" /> : null}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <div className="text-[13.5px] font-medium">{s.name ?? s.key}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className={chip()}>{ASSIGNEE_WORD[s.assignee?.type] ?? 'Somebody'}</span>
                  {s.grant ? (
                    <span className={chip('blue')}>Temporary access</span>
                  ) : null}
                  {s.dueInDays ? (
                    <span className="text-chip text-dim">
                      {s.dueInDays} working day{s.dueInDays === 1 ? '' : 's'}
                    </span>
                  ) : (
                    <span className="text-chip text-dim">No deadline</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {steps.some((s) => s.grant) && (
        <div className={ins.section}>
          <div className={callout()}>
            A step marked <strong>temporary access</strong> gives its approver sight of the record
            for the duration of the task and no longer. Without it they would need a standing grant
            nobody remembers to remove, or would approve it unread (WFL-4).
          </div>
        </div>
      )}

      {steps.some((s) => s.escalateTo) ? (
        <div className={ins.section}>
          <div className={callout('ochre')}>
            An overdue step escalates on its own to the named alternative, not to everybody, and the
            escalation is recorded (WFL-6).
          </div>
        </div>
      ) : (
        <div className={ins.noteSection}>
          No step here escalates. An overdue approval will wait indefinitely for the person it was
          assigned to.
        </div>
      )}
    </div>
  );
}

export function WorkflowDetailsPane({ record }) {
  const w = record?.record;
  if (!isWorkflow(w)) return <div className={ins.noteSection}>Select a workflow.</div>;

  return (
    <div>
      <div className={ins.section}>
        <div className={ins.label}>Workflow</div>
        <Row k="Name" v={w.name} />
        <Row k="State" v={w.isActive ? 'Live' : 'Draft'} />
        <Row k="Steps" v={(w.steps ?? []).length} />
        <Row k="In flight" v={w.inFlight} />
        <Row k="Completed" v={w.completed} />
        <Row k="Overdue steps" v={w.overdue} />
      </div>
      {w.description ? (
        <div className={ins.section}>
          <div className={ins.label}>What it is for</div>
          <p className="text-[14px] leading-[1.6]">{w.description}</p>
        </div>
      ) : null}
      <div className={ins.noteSection}>
        Editing a workflow is API-only so far. Changing one affects records filed afterwards;
        anything already in flight finishes under the steps it started with.
      </div>
    </div>
  );
}

export function WorkflowInFlightPane({ record }) {
  const w = record?.record;
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    if (!isWorkflow(w)) return undefined;
    let off = false;
    setState({ loading: true });
    api.workflow
      .inFlight(w.id)
      .then((r) => !off && setState({ loading: false, items: r.items }))
      .catch((err) => !off && setState({ loading: false, error: err.body?.message ?? err.message }));
    return () => {
      off = true;
    };
  }, [w?.id]);

  if (!isWorkflow(w)) return <div className={ins.noteSection}>Select a workflow.</div>;
  if (state.loading) return <div className={ins.noteSection}>Loading…</div>;
  if (state.error) return <div className={ins.noteSection}>{state.error}</div>;

  const items = state.items ?? [];
  if (items.length === 0) {
    return (
      <div className={ins.noteSection}>
        Nothing is running under this workflow. It starts when a document matching its trigger is
        filed.
      </div>
    );
  }

  return (
    <div>
      {items.map((i) => (
        <div key={i.id} className={ins.section}>
          <div className="mb-1 flex items-center gap-2">
            <span className={chip(i.status === 'ACTIVE' ? 'green' : '')}>
              {i.status.toLowerCase()}
            </span>
            <span className="text-chip text-dim">
              step {Number(i.currentStep) + 1} · {i.openTasks} waiting
            </span>
          </div>
          <div className="text-[13.5px] font-medium">{i.documentName}</div>
        </div>
      ))}
    </div>
  );
}

const Row = ({ k, v }) => (
  <div className={ins.kvrow}>
    <span className={ins.k}>{k}</span>
    <span className="text-[14px]">{v ?? '—'}</span>
  </div>
);
