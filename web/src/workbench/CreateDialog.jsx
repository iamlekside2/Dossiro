import { useEffect, useState } from 'react';
import api from '../lib/api.js';
import { btn, callout } from '../ui.js';
import { M } from '../form.js';

/**
 * The "New …" dialogs behind the toolbar's first verb.
 *
 * One component rather than several because the shape is identical — a few
 * fields, a create call, reload on success — and three near-copies would drift
 * apart the moment anyone touched one of them.
 */

const FORMS = {
  branch: {
    title: 'New branch',
    lede: 'An office of this organisation. Staff are posted to one, and cabinets can belong to one.',
    submit: 'Create branch',
    fields: [
      { key: 'name', label: 'Branch name', required: true, placeholder: 'Kano Office' },
      { key: 'code', label: 'Code', placeholder: 'KAN', hint: 'Short code used in reports.' },
      { key: 'address', label: 'Address' },
      { key: 'phone', label: 'Phone' },
    ],
    async submitFn(values) {
      return api.branches.create({
        name: values.name.trim(),
        code: values.code?.trim() || undefined,
        address: values.address?.trim() || undefined,
        phone: values.phone?.trim() || undefined,
      });
    },
  },

  hostname: {
    title: 'Add a web address',
    lede: 'The address this organisation reaches its records on. It must be proven before it resolves.',
    submit: 'Add address',
    fields: [
      {
        key: 'hostname',
        label: 'Hostname',
        required: true,
        placeholder: 'records.example.gov.ng',
        hint: 'Without https:// — just the host.',
      },
    ],
    async submitFn(values) {
      return api.organization.addHostname(values.hostname.trim());
    },
  },

  person: {
    title: 'Invite someone',
    lede: 'They receive a single-use link to choose a password. There is no self-serve signup.',
    submit: 'Send invitation',
    fields: [
      { key: 'displayName', label: 'Full name', required: true },
      { key: 'email', label: 'Work email', required: true, type: 'email' },
      { key: 'jobTitle', label: 'Job title' },
    ],
    async submitFn(values) {
      return api.users.invite({
        displayName: values.displayName.trim(),
        email: values.email.trim(),
        jobTitle: values.jobTitle?.trim() || undefined,
      });
    },
  },

  /* -- Repository ---------------------------------------------------------- */

  folder: {
    title: 'New folder',
    lede: (ctx) =>
      ctx?.folderName
        ? `Created inside ${ctx.folderName}. It inherits that folder's sensitivity, which you can raise but not lower.`
        : 'Created at the top of the repository, as a new cabinet.',
    submit: 'Create folder',
    done: (ctx) => `Folder created${ctx?.folderName ? ` in ${ctx.folderName}` : ''}.`,
    fields: [{ key: 'name', label: 'Folder name', required: true, placeholder: 'Vendor contracts' }],
    async submitFn(values, ctx) {
      return api.folders.create({
        name: values.name.trim(),
        parentId: ctx?.folderId ?? undefined,
      });
    },
  },

  move: {
    title: 'Move document',
    lede: (ctx) => `Where should ${ctx?.documentName ?? 'this document'} be filed?`,
    submit: 'Move',
    done: (ctx) => `${ctx?.documentName ?? 'The document'} moved.`,
    // The destination list is the folder tree, flattened. Loaded when the
    // dialog opens rather than held in the shell, because it is only ever
    // needed here and a stale copy would offer a folder that has since moved.
    load: () => api.folders.tree().then(flattenTree),
    initial: (ctx) => ({ folderId: ctx?.folderId ?? '' }),
    fields: (ctx, folders) => [
      {
        key: 'folderId',
        label: 'Destination',
        required: false,
        type: 'select',
        options: [['', 'Unfiled — no folder'], ...(folders ?? [])],
        hint:
          'A folder is a floor, not a ceiling: moving into somewhere more sensitive than the '
          + 'document is refused rather than silently reclassifying it.',
      },
    ],
    async submitFn(values, ctx) {
      return applyToEach(ctx, (id) => api.documents.move(id, values.folderId || null));
    },
  },

  classify: {
    title: 'Change classification',
    // Agreement matters here because the subject may be "3 documents".
    lede: (ctx) => {
      const many = (ctx?.documentIds?.length ?? 1) > 1;
      const subject = ctx?.documentName ?? 'this document';
      return (
        `How sensitive ${many ? 'are' : 'is'} ${subject}? This governs who may reach `
        + `${many ? 'them' : 'it'} and how ${many ? 'they' : 'it'} may be shared, independently of `
        + 'any permission granted on the folder.'
      );
    },
    submit: 'Apply',
    done: 'Classification applied.',
    initial: (ctx) => ({ classification: ctx?.classification ?? 'INTERNAL' }),
    fields: () => [
      {
        key: 'classification',
        label: 'Classification',
        required: true,
        type: 'select',
        options: [
          ['PUBLIC', 'Public — may leave the organisation freely'],
          ['INTERNAL', 'Internal — staff only'],
          ['CONFIDENTIAL', 'Confidential — external shares must name their recipients'],
          ['RESTRICTED', 'Restricted — cannot leave the organisation by any route'],
        ],
        hint:
          'Lowering it below the folder the document sits in is refused. Move it out first if that '
          + 'is really what you mean.',
      },
    ],
    async submitFn(values, ctx) {
      return applyToEach(ctx, (id) => api.documents.classify(id, values.classification));
    },
  },


  share: {
    title: 'Share outside the organisation',
    lede: (ctx) =>
      `A link that opens ${ctx?.documentName ?? 'this document'} for somebody with no account. `
      + 'They see that document and can reach nothing else.',
    submit: 'Create link',
    done: 'Link created. It works immediately and expires on its own.',
    initial: () => ({ expiresInHours: '168', maxDownloads: '', allowDownload: 'false' }),
    fields: () => [
      {
        key: 'expiresInHours',
        label: 'Expires after',
        required: true,
        type: 'select',
        options: [
          ['24', 'One day'],
          ['168', 'One week'],
          ['720', 'One month'],
          ['2160', 'Three months'],
        ],
        hint: 'The link stops working then, with nobody having to remember to revoke it.',
      },
      {
        key: 'allowDownload',
        label: 'What they may do',
        type: 'select',
        options: [
          ['false', 'Read it on screen only'],
          ['true', 'Read and download'],
        ],
        hint: 'View-only is enforced by the server, not hidden in the interface.',
      },
      {
        key: 'maxDownloads',
        label: 'Close after this many downloads',
        placeholder: 'Leave empty for no limit',
      },
    ],
    async submitFn(values, ctx) {
      return api.shares.create(ctx.documentId, {
        expiresInHours: Number(values.expiresInHours),
        allowDownload: values.allowDownload === 'true',
        maxDownloads: values.maxDownloads ? Number(values.maxDownloads) : undefined,
      });
    },
  },
  /* -- Document types ------------------------------------------------------ */

  type: {
    title: 'New document type',
    lede:
      'A kind of record your organisation files — Contract, Personnel file, Delivery note. Its '
      + 'fields are what make those records searchable as data rather than as prose, and what '
      + 'retention and workflow key off.',
    submit: 'Create type',
    done: 'Type created as a draft. Add its fields, then publish it.',
    initial: () => ({ name: '', keepVersions: 'true', watermarkAll: 'false', defaultClassification: 'INTERNAL' }),
    fields: () => [
      { key: 'name', label: 'Name', required: true, placeholder: 'Contract' },
      {
        key: 'description',
        label: 'What it is for',
        placeholder: 'Agreements with counterparties, signed by both sides.',
      },
      {
        key: 'defaultClassification',
        label: 'Default classification',
        type: 'select',
        options: [
          ['PUBLIC', 'Public'],
          ['INTERNAL', 'Internal'],
          ['CONFIDENTIAL', 'Confidential'],
          ['RESTRICTED', 'Restricted'],
        ],
        hint: 'What a record of this type is classified as when filed. The folder can still raise it.',
      },
      {
        key: 'keepVersions',
        label: 'Version history',
        type: 'select',
        options: [
          ['true', 'Keep every edition'],
          ['false', 'One edition only'],
        ],
        hint: 'Board papers are the usual reason to keep only one — there is no draft to return to.',
      },
      {
        key: 'watermarkAll',
        label: 'Watermark',
        type: 'select',
        options: [
          ['false', 'Only on shared links'],
          ['true', 'Every view of this type'],
        ],
      },
    ],
    async submitFn(values) {
      return api.documentTypes.create({
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        defaultClassification: values.defaultClassification,
        keepVersions: values.keepVersions === 'true',
        watermarkAll: values.watermarkAll === 'true',
      });
    },
  },

  field: {
    title: 'Add an index field',
    lede: (ctx) =>
      `A value every ${ctx?.typeName ?? 'record'} carries, stored as data rather than buried in the `
      + 'text. Searchable as a field, so you can ask for contracts expiring between two dates.',
    submit: 'Add field',
    done: 'Field added.',
    initial: () => ({ kind: 'TEXT', required: 'false', isRetentionAnchor: 'false', options: '' }),
    fields: (ctx, _l) => [
      { key: 'name', label: 'Field name', required: true, placeholder: 'Contractor' },
      { key: 'description', label: 'What it holds', placeholder: 'The counterparty as named on the signature page.' },
      {
        key: 'kind',
        label: 'Kind',
        type: 'select',
        options: [
          ['TEXT', 'Text'],
          ['DATE', 'Date'],
          ['NUMBER', 'Number'],
          ['BOOLEAN', 'Yes / no'],
          ['SELECT', 'Selection list'],
        ],
        hint: 'The kind cannot change once records carry a value for it, so choose it deliberately.',
      },
      {
        key: 'options',
        label: 'List options',
        placeholder: 'Lagos, Abuja, Port Harcourt, Kano',
        hint: 'Separated by commas. Selection lists only — the database refuses them on other kinds.',
      },
      {
        key: 'required',
        label: 'Required',
        type: 'select',
        options: [
          ['false', 'Optional'],
          ['true', 'Must be filled in'],
        ],
      },
      {
        key: 'isRetentionAnchor',
        label: 'Drives the retention clock',
        type: 'select',
        options: [
          ['false', 'No'],
          ['true', 'Yes — count the retention period from this date'],
        ],
        hint: 'One field per type, and it must be a date. This is what makes "six years after expiry" expressible.',
      },
    ],
    async submitFn(values, ctx) {
      const kind = values.kind;
      return api.documentTypes.addField(ctx.typeId, {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        kind,
        required: values.required === 'true',
        isRetentionAnchor: values.isRetentionAnchor === 'true',
        // Sent only for a selection list; the schema refuses options on any
        // other kind, so an empty array on a text field would be a 400.
        options:
          kind === 'SELECT'
            ? values.options.split(',').map((o) => o.trim()).filter(Boolean)
            : undefined,
      });
    },
  },
};

/**
 * Applies an action to every document the dialog is acting on.
 *
 * Keeps going after a refusal rather than stopping at the first, because a
 * mixed selection legitimately produces mixed results — four documents move
 * and the fifth is too sensitive for the destination. Throws a summary when
 * any failed, so the dialog shows what happened instead of closing as though
 * everything worked.
 */
async function applyToEach(ctx, fn) {
  const ids = ctx?.documentIds?.length ? ctx.documentIds : [ctx?.documentId].filter(Boolean);
  const failures = [];

  for (const id of ids) {
    try {
      await fn(id);
    } catch (err) {
      failures.push(err.body?.message ?? err.message);
    }
  }

  if (failures.length) {
    const done = ids.length - failures.length;
    throw new Error(
      ids.length === 1
        ? failures[0]
        : `${done} of ${ids.length} done. ${failures[0]}`,
    );
  }
  return { count: ids.length };
}

/** The folder tree as [id, indented name] pairs for a picker. */
function flattenTree(nodes, depth = 0, out = []) {
  for (const n of nodes ?? []) {
    out.push([n.id, `${'  '.repeat(depth)}${n.name}`]);
    flattenTree(n.children, depth + 1, out);
  }
  return out;
}

/**
 * @param context  What the dialog is acting on — the selected document, the
 *                 folder currently in scope. Move and Classify are about a
 *                 record that is already on screen, so they need to know which
 *                 one rather than asking for an id.
 */
export default function CreateDialog({ kind, context, onClose, onCreated }) {
  const spec = FORMS[kind];
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // Options can depend on what is on screen — the folder list for a move, the
  // classifications above the destination's floor — so fields may be a
  // function of the context rather than a fixed list. Loaded once per open.
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    if (!spec?.load) return undefined;
    let cancelled = false;
    spec
      .load(context)
      .then((d) => !cancelled && setLoaded(d))
      .catch((err) => !cancelled && setError(err.body?.message ?? err.message));
    return () => {
      cancelled = true;
    };
  }, [spec, context]);

  // Defaults come from the record being acted on, so Classify opens showing
  // what the document is now rather than an arbitrary first option.
  useEffect(() => {
    if (spec?.initial) setValues(spec.initial(context, loaded));
  }, [spec, context, loaded]);

  if (!spec) return null;

  // Everything a spec supplies may be a function of what is being acted on,
  // so a dialog can name the actual document rather than say "this record".
  const call = (v) => (typeof v === 'function' ? v(context, loaded) : v);
  const fields = call(spec.fields) ?? [];
  const title = call(spec.title);
  const lede = call(spec.lede);
  const ready = fields.every((f) => !f.required || String(values[f.key] ?? '').trim());

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await spec.submitFn(values, context);
      setResult(res);
      onCreated?.();
    } catch (err) {
      setError(err.body?.message ?? err.message);
    } finally {
      setBusy(false);
    }
  }

  // An invitation returns a link that is shown once. With SMTP off it is the
  // only way in, so the dialog stays open until it has been acknowledged.
  const shareUrl = result?.share?.token
    ? `${window.location.origin}/s/${result.share.token}`
    : null;

  const handoffLink = result?.acceptUrl
    ? `${window.location.origin}${result.acceptUrl}`
    : result?.instructions
      ? null
      : null;

  return (
    <div className={M.backdrop} role="dialog" aria-modal="true" aria-label={title}>
      <form className={M.card} onSubmit={submit}>
        <h2 className={M.title}>
          {title}
        </h2>
        <p className={M.lede}>
          {lede}
        </p>

        {!result ? (
          <>
            {fields.map((f) => (
              <label className={M.field} key={f.key}>
                <span className={M.fieldLabel}>
                  {f.label}
                  {f.required ? '' : ' (optional)'}
                </span>
                {f.type === 'select' ? (
                  <select
                    className={M.input}
                    value={values[f.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  >
                    {(f.options ?? []).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={M.input}
                    type={f.type ?? 'text'}
                    value={values[f.key] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                )}
                {f.hint && <span className={M.fieldHint}>{f.hint}</span>}
              </label>
            ))}

            {error && (
              <div className={callout('red')} style={{ margin: '0 0 14px' }}>
                {error}
              </div>
            )}

            <div className={M.actions}>
              <button type="submit" className={btn('primary')} disabled={!ready || busy}>
                {busy ? 'Working…' : call(spec.submit)}
              </button>
              <button type="button" className={btn()} onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {handoffLink && (
              <div className={callout('ochre')}>
                {result.delivery === 'sent'
                  ? `An invitation has been emailed to ${result.user?.email}.`
                  : 'Email is switched off, so nothing was sent. Pass this link on yourself:'}
                {result.delivery !== 'sent' && (
                  <div className={M.link}>
                    <code>{handoffLink}</code>
                    <button
                      type="button"
                      className={M.linkbtn}
                      onClick={() => navigator.clipboard?.writeText(handoffLink)}
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>
            )}

            {result.instructions && (
              <div className={callout('ochre')}>
                <strong>{result.hostname} added.</strong> It does not resolve yet.
                {Array.isArray(result.instructions) ? (
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                    {result.instructions.map((line) => (
                      <li key={line} style={{ marginBottom: 4, wordBreak: 'break-all' }}>
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: '8px 0 0' }}>{result.instructions}</p>
                )}
              </div>
            )}

            {!handoffLink && !result.instructions && (
              <div className={callout()}>{call(spec.done) ?? 'Created.'}</div>
            )}

            {/* A share is only useful once somebody has the link, so it is
                shown here rather than left for the Sharing area to reveal. */}
            {shareUrl && (
              <div className={M.link}>
                <code>{shareUrl}</code>
                <button
                  type="button"
                  className={M.linkbtn}
                  onClick={() => navigator.clipboard?.writeText(shareUrl)}
                >
                  Copy
                </button>
              </div>
            )}

            <div className={M.actions}>
              <button type="button" className={btn('primary')} onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

/** Which dialog, if any, a toolbar verb opens. */
export function dialogForVerb(area, scopeIndex, verb) {
  if (area === 'repo') {
    if (verb.startsWith('New folder')) return 'folder';
    if (verb.startsWith('Move')) return 'move';
    if (verb.startsWith('Classify')) return 'classify';
    return null; // Open, Check out and Share are actions, not forms.
  }
  if (area === 'types') {
    if (verb.startsWith('New type')) return 'type';
    if (verb.startsWith('Add field')) return 'field';
    return null; // Publish and Archive act on the selected type.
  }
  if (area !== 'admin') return null;
  if (scopeIndex === 0 && verb.startsWith('Add person')) return 'person';
  if (scopeIndex === 2 && (verb.startsWith('New branch') || verb.startsWith('Open branch'))) return 'branch';
  if (scopeIndex === 3 && verb.startsWith('Add address')) return 'hostname';
  return null;
}
