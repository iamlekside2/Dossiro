/**
 * Inspector panes for a document type.
 *
 * Everything shown comes from the row's own record, so the Fields and Type
 * panes make no request of their own. "Who can file it" does, because the
 * answer is a list of roles rather than anything carried on the row.
 */
import { useEffect, useState } from 'react';
import api from '../../lib/api.js';
import { ins } from './ins.js';
import { btn, chip } from '../../ui.js';

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
  const [state, setState] = useState({ status: 'loading' });
  const [chosen, setChosen] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!t?.id) return undefined;
    let cancelled = false;
    setState({ status: 'loading' });
    setError(null);

    api.documentTypes
      .roles(t.id)
      .then((res) => {
        if (cancelled) return;
        setState({ status: 'ready', ...res });
        setChosen(new Set(res.roles.filter((r) => r.allowed).map((r) => r.id)));
      })
      .catch((err) => !cancelled && setState({ status: 'error', error: err }));

    return () => {
      cancelled = true;
    };
  }, [t?.id]);

  if (!t) return <div className={ins.noteSection}>Select a type.</div>;
  if (state.status === 'loading') return <div className={ins.noteSection}>Loading…</div>;
  if (state.status === 'error') {
    return (
      <div className={ins.noteSection}>
        {state.error?.message ?? 'Could not load who may file this.'}
      </div>
    );
  }

  const allowed = chosen ?? new Set();
  const restricted = allowed.size > 0;
  const dirty =
    state.roles.some((r) => r.allowed !== allowed.has(r.id));

  function toggle(id) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await api.documentTypes.setRoles(t.id, [...allowed]);
      setState({ status: 'ready', ...res });
      setChosen(new Set(res.roles.filter((r) => r.allowed).map((r) => r.id)));
    } catch (err) {
      setError(err.body?.message ?? err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className={ins.section}>
        <div className={ins.label}>Who can file it</div>
        <p className="text-detail leading-[1.55] text-muted">
          {restricted ? (
            <>
              Only the roles ticked below may file a record as <strong>{t.name}</strong>.
            </>
          ) : (
            <>
              Anyone who can add a document to a folder may file it as <strong>{t.name}</strong>.
              Tick a role to restrict that.
            </>
          )}
        </p>
      </div>

      <div className={ins.section}>
        {state.roles.map((r) => (
          <label
            key={r.id}
            className="flex cursor-pointer items-start gap-2.5 py-[7px]"
          >
            <input
              type="checkbox"
              checked={allowed.has(r.id)}
              onChange={() => toggle(r.id)}
              className="mt-[3px] h-4 w-4 flex-none accent-blue"
            />
            <span className="min-w-0">
              <span className="block text-[13.5px] font-medium">{r.name}</span>
              {r.description ? (
                <span className="block text-chip leading-[1.45] text-dim">{r.description}</span>
              ) : null}
            </span>
          </label>
        ))}

        {error ? (
          <div className="mt-3 border border-red-border bg-red-bg px-3 py-2 text-detail text-red">
            {error}
          </div>
        ) : null}

        <div className="mt-3.5 flex items-center gap-2">
          <button
            type="button"
            className={btn('primary')}
            disabled={!dirty || saving}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {restricted && (
            <button
              type="button"
              className={btn()}
              disabled={saving}
              onClick={() => setChosen(new Set())}
            >
              Remove the restriction
            </button>
          )}
        </div>
      </div>

      <div className={ins.noteSection}>
        This governs filing, not reading. Who may open a record is decided by the folder it sits in
        and its classification — restricting a type here does not hide anything already filed as it.
      </div>
    </div>
  );
}
