/**
 * Inspector panes for a document type.
 *
 * Everything shown comes from the row's own record, so the Fields and Type
 * panes make no request of their own. "Who can file it" does not exist yet as
 * a real permission — there is no per-type access control in the schema — so
 * it says so rather than showing an invented list.
 */
import { useEffect, useState } from 'react';
import api from '../../lib/api.js';
import { ins } from './ins.js';
import { chip } from '../../ui.js';

const KIND_WORD = {
  TEXT: 'Text',
  DATE: 'Date',
  NUMBER: 'Number',
  BOOLEAN: 'Yes/no',
  SELECT: 'List',
};

/* -- Fields: the substance of a type -------------------------------------- */

export function TypeFieldsPane({ record }) {
  const type = record?.record;

  // The list endpoint returns a field COUNT, not the fields — carrying every
  // field of every type in the list response would be a lot of payload for a
  // column that shows one number. So the pane fetches the type it is showing.
  const [fields, setFields] = useState(null);
  const [error, setError] = useState(null);
  const id = type?.id;

  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    setFields(null);
    setError(null);
    api.documentTypes
      .get(id)
      .then((t) => !cancelled && setFields(t.fields ?? []))
      .catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!type) return <div className={ins.noteSection}>Select a type to see its fields.</div>;
  if (error) {
    return <div className={ins.noteSection}>Could not load the fields: {error.message}</div>;
  }
  if (fields === null) {
    return <div className={ins.noteSection}>Loading fields…</div>;
  }

  return (
    <div>
      <div className={ins.section}>
        <div className={ins.label}>Index fields</div>
        {fields.length === 0 ? (
          <p className="text-detail leading-[1.55] text-dim">
            No fields yet. A type needs at least one before it can be published — a type with
            none is one nobody can fill in.
          </p>
        ) : (
          fields.map((f) => (
            <div key={f.id} className="border-b border-line-faint py-2.5 last:border-b-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-ui font-medium">{f.name}</span>
                <span className="flex flex-none items-center gap-1.5">
                  {f.required ? <span className={chip('blue')}>Required</span> : null}
                  <span className={chip()}>{KIND_WORD[f.kind] ?? f.kind}</span>
                </span>
              </div>

              {f.description ? (
                <div className="mt-1 text-detail leading-[1.5] text-dim">{f.description}</div>
              ) : null}

              {/* A selection list is only as useful as its options, so they are
                  shown rather than summarised as a count. */}
              {f.kind === 'SELECT' && f.options?.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {f.options.map((o) => (
                    <span key={o} className={chip()}>
                      {o}
                    </span>
                  ))}
                </div>
              ) : null}

              {f.isRetentionAnchor ? (
                <div className="mt-1.5 text-chip font-semibold text-ochre">
                  The retention clock counts from this date
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className={ins.section}>
        <div className="callout-blue border border-blue-border bg-blue-bg px-3 py-2.5 text-detail leading-[1.55] text-muted">
          A selection list can draw its values from a system you already run, so a supplier name
          is never re-keyed or spelled two ways. Not built yet.
        </div>
        <div className={ins.note}>
          Changing a field on a published type applies to records filed afterwards. Existing
          records keep the values they were filed with, and a field’s kind cannot change at all
          once documents carry values for it.
        </div>
      </div>
    </div>
  );
}

/* -- The type itself ------------------------------------------------------- */

export function TypeDetailsPane({ record }) {
  const t = record?.record;
  if (!t) return <div className={ins.noteSection}>Select a type.</div>;

  const rows = [
    ['Name', t.name],
    ['Status', String(t.status).toLowerCase()],
    ['Fields', String(t.fieldCount ?? t.fields?.length ?? 0)],
    ['Editions', t.keepVersions ? 'Every edition kept' : 'One edition only'],
    ['Watermark', t.watermarkAll ? 'Every view, however reached' : 'Share links only'],
    ['Files as', String(t.defaultClassification ?? 'INTERNAL').toLowerCase()],
    ['Retention', t.retention ? t.retention.name : 'No schedule'],
    ['In use', Number(t.inUse) ? `${t.inUse} documents` : 'Not yet used'],
  ];

  return (
    <div>
      <div className={ins.section}>
        <div className={ins.label}>Type</div>
        {rows.map(([k, v]) => (
          <div className={ins.kvrow} key={k}>
            <span className={ins.k}>{k}</span>
            <span className="text-body">{v}</span>
          </div>
        ))}
      </div>

      {t.description ? (
        <div className={ins.section}>
          <div className={ins.label}>Description</div>
          <p className="text-detail leading-[1.55] text-muted">{t.description}</p>
        </div>
      ) : null}

      <div className={ins.section}>
        <div className={ins.note}>
          {Number(t.inUse)
            ? `${t.inUse} documents are filed as this type, so it cannot be deleted — archiving `
              + 'keeps those records intact and stops anything new being filed as it.'
            : 'Nothing is filed as this type yet, so it can still be reshaped or deleted freely.'}
        </div>
      </div>
    </div>
  );
}

/* -- Who can file it ------------------------------------------------------- */

/**
 * Deliberately empty of invented detail.
 *
 * The handoff shows a list of roles per type. There is no per-type permission
 * in the schema — access is decided on the folder a document lands in — so a
 * list here would be describing a control that does not exist.
 */
export function TypeAccessPane({ record }) {
  const t = record?.record;
  if (!t) return <div className={ins.noteSection}>Select a type.</div>;

  return (
    <div>
      <div className={ins.section}>
        <div className={ins.label}>Who can file it</div>
        <p className="text-detail leading-[1.55] text-muted">
          Anyone who can add a document to a folder can file it as{' '}
          <strong>{t.name}</strong>. Access is decided by the folder the record lands in, not by
          its type.
        </p>
      </div>

      <div className={ins.section}>
        <div className="border border-ochre-border bg-ochre-bg px-3 py-2.5 text-detail leading-[1.55] text-ochre">
          Restricting a type to particular roles is not built. The design shows it; the schema has
          no per-type permission, so there is nothing real to display here yet.
        </div>
      </div>
    </div>
  );
}
