import { useEffect, useState } from 'react';
import api from '../../lib/api.js';
import { ins } from './ins.js';
import { callout } from '../../ui.js';

/**
 * The document itself, rendered from its actual bytes.
 *
 * Replaces the handoff's illustrated contract for any row backed by a real
 * record. That illustration is the most misleading thing in the application —
 * a real filename above an invented liability clause — so it gives way as soon
 * as there is something true to show.
 *
 * What cannot be rendered is named rather than faked. A spreadsheet says it is
 * a spreadsheet and offers to open; it does not get a page of grey bars.
 */

/** Rendered inline; everything else is described instead. */
const TEXTUAL = /^text\/|json|xml|javascript|csv$/;
const IMAGE = /^image\//;
const PDF = /pdf/;

/** A human name for a media type, for the cases we cannot draw. */
function describe(mime, kind) {
  if (/spreadsheet|excel/.test(mime)) return 'a spreadsheet';
  if (/word|document/.test(mime)) return 'a word-processor document';
  if (/presentation|powerpoint/.test(mime)) return 'a presentation';
  if (/zip|tar|rar|7z|gzip/.test(mime)) return 'an archive';
  if (/^audio\//.test(mime)) return 'an audio recording';
  if (/^video\//.test(mime)) return 'a video recording';
  return kind ? `a ${kind.toLowerCase()} file` : 'a file';
}

const fileSize = (n) =>
  n >= 1_048_576
    ? `${(n / 1_048_576).toFixed(1)} MB`
    : n >= 1024
      ? `${Math.round(n / 1024)} KB`
      : `${n} bytes`;

export default function LivePreview({ record }) {
  const doc = record?.record;
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    if (!doc?.id) return undefined;

    let cancelled = false;
    let url = null;
    setState({ status: 'loading' });

    api.documents
      .content(doc.id)
      .then(async (res) => {
        if (cancelled) {
          URL.revokeObjectURL(res.url);
          return;
        }
        url = res.url;
        const mime = res.type || doc.mimeType || '';

        // Text is read into the component rather than framed: an iframe of a
        // .txt inherits none of the page's typography and renders in the
        // browser's default monospace at whatever size it likes.
        if (TEXTUAL.test(mime)) {
          const text = await fetch(res.url).then((r) => r.text());
          if (cancelled) return;
          setState({ status: 'text', text, mime, size: res.size });
        } else {
          setState({ status: 'binary', url: res.url, mime, size: res.size });
        }
      })
      .catch(async (err) => {
        if (cancelled) return;

        // 403 means read without download. Rather than leave a reader with an
        // empty pane, ask for a rendering instead — that endpoint needs only
        // READ and never returns the stored bytes (VEW-2).
        if (err?.status === 403) {
          try {
            const rendered = await api.documents.view(doc.id);
            if (cancelled) return;
            setState(
              rendered.kind === 'text'
                ? { status: 'text', text: rendered.text, readOnly: true, truncated: rendered.truncated }
                : { status: 'norender', reason: rendered.reason },
            );
            return;
          } catch (viewErr) {
            if (!cancelled) setState({ status: 'error', error: viewErr });
            return;
          }
        }
        setState({ status: 'error', error: err });
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc?.id, doc?.mimeType]);

  if (!doc) return null;

  if (state.status === 'loading') {
    return (
      <div className="bg-desk p-8">
        <div className="mx-auto max-w-[660px] bg-surface p-9 shadow-sheet">
          {[100, 96, 88, 72, 100, 64].map((w, i) => (
            <div
              key={i}
              className="mb-2.5 h-[9px] animate-[cv-skeleton_1.4s_ease-in-out_infinite] bg-skeleton"
              style={{ width: `${w}%`, animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className={ins.pane}>
        <div className={callout('red')}>
          <strong>That did not load.</strong>
          <p className="mt-1.5">
            {state.error?.message ?? 'The document could not be fetched.'}
          </p>
        </div>
      </div>
    );
  }

  // Read access, no download right, and nothing that can be rendered without
  // handing over the file. Said plainly rather than shown as an empty sheet.
  if (state.status === 'norender') {
    return (
      <div className={ins.pane}>
        <div className={callout('ochre')}>
          <strong>Nothing to show on screen yet.</strong>
          <p className="mt-1.5">{state.reason}</p>
        </div>
      </div>
    );
  }

  const header = (
    <div className="mb-5 flex items-baseline justify-between border-b border-line-soft pb-3">
      <span className="text-label font-bold uppercase tracking-[0.07em] text-soft">
        {doc.classification?.toLowerCase() ?? 'internal'}
      </span>
      <span className="text-label font-bold uppercase tracking-[0.07em] text-faint">
        {state.size != null ? fileSize(state.size) : ''}
      </span>
    </div>
  );

  if (state.status === 'text') {
    return (
      <div className="bg-desk p-8">
        <div className="mx-auto max-w-[660px] bg-surface px-9 pb-10 pt-[34px] shadow-sheet">
          {header}
          <h1 className="mb-4 text-[20px] font-bold tracking-[-0.015em]">{doc.name}</h1>
          {/* pre-wrap keeps the file's own line breaks without letting a long
              line push the sheet wider than the pane. */}
          <pre className="whitespace-pre-wrap break-words font-sans text-[13.5px] leading-[1.7] text-ink-2">
            {state.text}
          </pre>

          {state.truncated && (
            <p className={ins.note}>
              Shown to the first 200,000 characters. Open the document for the rest.
            </p>
          )}

          {state.readOnly && (
            <p className={ins.note}>
              You may read this record but not take a copy, so this is its text rather than the
              file itself — the original never reaches your browser. Formatting, images and
              signatures are not shown.
            </p>
          )}
        </div>
      </div>
    );
  }

  const mime = state.mime ?? '';

  if (IMAGE.test(mime)) {
    return (
      <div className="bg-desk p-8">
        <div className="mx-auto max-w-[660px] bg-surface p-4 shadow-sheet">
          <img src={state.url} alt={doc.name} className="mx-auto block max-w-full" />
        </div>
      </div>
    );
  }

  if (PDF.test(mime)) {
    return (
      <div className="bg-desk p-4">
        {/* A tall frame rather than a paged viewer. Page thumbnails, search
            within the document and annotation are the viewer proper (VEW-3);
            this shows the document truthfully in the meantime. */}
        <iframe
          src={state.url}
          title={doc.name}
          className="mx-auto block h-[720px] w-full max-w-[660px] border-0 bg-surface shadow-sheet"
        />
      </div>
    );
  }

  return (
    <div className={ins.pane}>
      <div className={ins.section}>
        <div className={ins.label}>This file</div>
        <p className="text-[14px] leading-[1.6]">
          {doc.name} is {describe(mime, doc.kind)}
          {state.size != null ? `, ${fileSize(state.size)}` : ''}. It cannot be shown in the browser
          yet.
        </p>
        <p className={ins.note}>
          Rendering office formats without downloading them needs a conversion step, which is part
          of the viewer rather than of this pane. Open takes a copy in the meantime.
        </p>
      </div>
    </div>
  );
}
