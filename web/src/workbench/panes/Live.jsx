import { useEffect, useState } from 'react';
import api from '../../lib/api.js';
import { ins } from './ins.js';
import { callout, chip } from '../../ui.js';

/**
 * Inspector panes for areas whose rows already carry everything they need.
 *
 * Each of these areas was live in the list and illustrated in the inspector —
 * a real row beside an invented description, which is the most misleading
 * state the workbench can be in. None of them needed a new endpoint: the row's
 * own record had the answer.
 */

const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const Row = ({ k, v }) => (
  <div className={ins.kvrow}>
    <span className={ins.k}>{k}</span>
    <span className="text-right text-[14px]">{v ?? '—'}</span>
  </div>
);

const Empty = ({ children }) => <div className={ins.noteSection}>{children}</div>;

/* -- Approvals --------------------------------------------------------------- */

export function ApprovalPane({ record }) {
  const t = record?.record;
  if (!t?.stepKey) return <Empty>Select something waiting on you.</Empty>;

  return (
    <div>
      <div className={ins.section}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={chip(t.overdue ? 'red' : 'blue')}>
            {String(t.action).toLowerCase()}
          </span>
          {t.overdue ? <span className={chip('red')}>overdue</span> : null}
        </div>
        <p className="text-[14px] leading-[1.6]">{t.stepName ?? t.stepKey}</p>
        <p className={ins.note}>Part of {t.workflowName}.</p>
      </div>

      <div className={ins.section}>
        <div className={ins.label}>What you are deciding on</div>
        <Row k="Document" v={t.documentName} />
        <Row k="Classification" v={String(t.classification ?? '').toLowerCase() || '—'} />
        <Row k="Raised" v={when(t.createdAt)} />
        <Row k="Due" v={t.dueAt ? when(t.dueAt) : 'No deadline'} />
      </div>

      {t.grantedLevel ? (
        <div className={ins.section}>
          <div className={callout()}>
            This task carries <strong>{String(t.grantedLevel).toLowerCase()}</strong> access to the
            record for as long as it is open, and no longer. You are not meant to approve something
            you cannot read (WFL-4).
          </div>
        </div>
      ) : null}

      <div className={ins.noteSection}>
        Approving closes the other outstanding tasks on this step — a step assigned to a role means
        one of those people rather than all of them. Returning it stops the whole workflow, because
        continuing past a refusal would make the approval decorative.
      </div>
    </div>
  );
}

/* -- E-forms ----------------------------------------------------------------- */

const KIND_WORD = {
  TEXT: 'Text',
  DATE: 'Date',
  NUMBER: 'Number',
  BOOLEAN: 'Yes/no',
  SELECT: 'List',
  USER: 'Person',
};

export function FormPane({ record }) {
  const f = record?.record;
  if (!f?.id || f.isPublished === undefined) return <Empty>Select a form.</Empty>;

  const fields = f.fields ?? [];

  return (
    <div>
      <div className={ins.section}>
        <div className="mb-2 flex items-center gap-2">
          <span className={chip(f.isPublished ? 'green' : 'ochre')}>
            {f.isPublished ? 'open for submissions' : 'draft'}
          </span>
        </div>
        <p className="text-[14px] leading-[1.6]">{f.description || 'No description.'}</p>
      </div>

      <div className={ins.section}>
        <div className={ins.label}>Where a submission goes</div>
        <Row k="Filed into" v={f.targetFolderName ?? 'Nowhere yet'} />
        <Row k="Starts" v={f.workflowName ?? 'No workflow'} />
        <Row k="Received" v={`${f.submissionCount ?? 0}`} />
      </div>

      <div className={ins.section}>
        <div className={ins.label}>Fields</div>
        {Number(f.fieldCount ?? fields.length) === 0 ? (
          <p className="text-detail text-dim">None yet. A form with no fields cannot be published.</p>
        ) : fields.length ? (
          fields.map((x) => (
            <div key={x.key} className="flex items-baseline justify-between gap-3 py-[5px]">
              <span className="text-[13.5px]">{x.label}</span>
              <span className="flex flex-none items-center gap-1.5">
                {x.required ? <span className={chip('blue')}>Required</span> : null}
                <span className={chip()}>{KIND_WORD[x.kind] ?? x.kind}</span>
              </span>
            </div>
          ))
        ) : (
          <p className="text-detail text-dim">
            {f.fieldCount} field{Number(f.fieldCount) === 1 ? '' : 's'}. Open the form through the
            API to see them.
          </p>
        )}
      </div>

      <div className={ins.noteSection}>
        A submission becomes a document in that folder, indexed so it can be found by its own
        answers. Building a form is API-only so far.
      </div>
    </div>
  );
}

/* -- HR ----------------------------------------------------------------------- */

export function EmployeeFilePane({ record }) {
  const p = record?.record;
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    if (!p?.id) return undefined;
    let off = false;
    setState({ loading: true });
    api.hr
      .file(p.id)
      .then((d) => !off && setState({ loading: false, ...d }))
      .catch((err) => !off && setState({ loading: false, error: err.body?.message ?? err.message }));
    return () => {
      off = true;
    };
  }, [p?.id]);

  if (!p?.displayName) return <Empty>Select somebody.</Empty>;
  if (state.loading) return <Empty>Loading…</Empty>;
  if (state.error) return <Empty>{state.error}</Empty>;

  const docs = state.documents ?? [];
  const gaps = state.gaps ?? [];

  return (
    <div>
      <div className={ins.section}>
        <div className={ins.label}>Person</div>
        <Row k="Name" v={p.displayName} />
        <Row k="Email" v={p.email} />
        <Row k="Job title" v={p.jobTitle || '—'} />
        <Row k="Unit" v={p.unitName ?? 'No unit'} />
      </div>

      <div className={ins.section}>
        <div className={ins.label}>What we hold about them</div>
        {docs.length === 0 ? (
          <p className="text-detail text-dim">
            Nothing names this person. A record joins their file by carrying a person field that
            points at them, wherever it is filed.
          </p>
        ) : (
          docs.map((d) => (
            <div key={d.id} className="py-[6px]">
              <div className="text-[13.5px]">{d.name}</div>
              <div className="text-chip text-dim">
                {d.typeName} · via {d.fieldName} · {d.folderName ?? 'unfiled'}
              </div>
            </div>
          ))
        )}
      </div>

      {gaps.length > 0 && (
        <div className={ins.section}>
          <div className={callout('ochre')}>
            <strong className="mb-1 block">
              {gaps.length} required field{gaps.length === 1 ? '' : 's'} unfilled
            </strong>
            {gaps.map((g, i) => (
              <div key={i}>
                {g.documentName} is missing <strong>{g.fieldName}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={ins.noteSection}>
        Completeness is computed from each type&rsquo;s own required fields rather than a checklist
        kept beside them, which would drift the first time somebody adds a field.
      </div>
    </div>
  );
}

/* -- Ingest -------------------------------------------------------------------- */

export function JobPane({ record }) {
  const j = record?.record;
  if (!j?.type) return <Empty>Select a job.</Empty>;

  const out = j.output ?? {};
  const failed = j.status === 'FAILED';

  return (
    <div>
      <div className={ins.section}>
        <div className="mb-2 flex items-center gap-2">
          <span className={chip(failed ? 'red' : j.status === 'SUCCEEDED' ? 'green' : 'ochre')}>
            {j.status.toLowerCase()}
          </span>
          <span className={chip()}>{j.type.replace(/_/g, ' ').toLowerCase()}</span>
        </div>
        <p className="text-[14px] leading-[1.6]">{j.documentName}</p>
        <p className={ins.note}>
          {j.mimeType} · {j.folderName ?? 'unfiled'}
        </p>
      </div>

      <div className={ins.section}>
        <div className={ins.label}>What happened</div>
        <Row k="Queued" v={when(j.createdAt)} />
        <Row k="Started" v={when(j.startedAt)} />
        <Row k="Finished" v={when(j.finishedAt)} />
        <Row k="Attempts" v={`${j.attempts} of ${j.maxAttempts}`} />
        {out.characters ? (
          <Row k="Read" v={`${Number(out.characters).toLocaleString('en-GB')} characters`} />
        ) : null}
        {out.source ? <Row k="From" v={out.source} /> : null}
        {out.pages ? <Row k="Pages" v={out.pages} /> : null}
      </div>

      {failed ? (
        <div className={ins.section}>
          <div className={callout('ochre')}>
            <strong className="mb-1 block">Could not read it</strong>
            {j.error}
          </div>
        </div>
      ) : null}

      <div className={ins.noteSection}>
        A document is read so it can be searched by its contents. A job that failed because this
        deployment cannot read the file will fail the same way if it is tried again — that is a
        statement about what is installed here, not about the file.
      </div>
    </div>
  );
}

/* -- Sharing -------------------------------------------------------------------- */

export function ShareDetailsPane({ record }) {
  const s = record?.record;
  if (!s?.token) return <Empty>Select a link.</Empty>;

  return (
    <div>
      <div className={ins.section}>
        <div className={ins.label}>Link</div>
        <Row k="Document" v={s.document?.name ?? s.documentName} />
        <Row k="Created" v={when(s.createdAt)} />
        <Row k="Expires" v={s.expiresAt ? when(s.expiresAt) : 'No expiry'} />
        <Row k="Opens" v={s.accessCount ?? 0} />
        <Row
          k="Downloads"
          v={s.maxDownloads ? `${s.downloadCount ?? 0} of ${s.maxDownloads}` : `${s.downloadCount ?? 0}`}
        />
      </div>

      <div className={ins.section}>
        <div className={ins.label}>What the recipient may do</div>
        <Row k="Read on screen" v="Yes" />
        <Row k="Download" v={s.allowDownload ? 'Yes' : 'No'} />
        <Row k="Access code" v={s.hasPassword ? 'Required' : 'Not set'} />
      </div>

      <div className={ins.noteSection}>
        View-only is enforced by the server, not hidden in the interface — asking for the bytes is
        refused rather than the button being removed. Every open is written to the audit trail.
      </div>
    </div>
  );
}
