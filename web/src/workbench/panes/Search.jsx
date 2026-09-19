/**
 * Inspector pane for a search result.
 *
 * Describes the match rather than the document — the same file ranks
 * differently against a different query, so this is not something Document.jsx
 * could answer. The document's own facts are still shown by the Summary pane,
 * which search reuses unchanged.
 */

const sentence = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '—');

function Rows({ title, rows }) {
  return (
    <div className="ins__section">
      {title && <div className="ins__label">{title}</div>}
      {rows.map(([k, v]) => (
        <div key={k} className="kvrow">
          <span className="kv__k">{k}</span>
          <span style={{ fontSize: 14 }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

export function SearchMatchPane({ record }) {
  const d = record?.record;
  if (!d) return null;

  // Postgres marks the matched words with <b>. They are split out and rendered
  // as React elements rather than injected as HTML: this pane exists to show
  // what matched, but not at the cost of an HTML sink on document content.
  const parts = d.snippet ? d.snippet.split(/(<b>.*?<\/b>)/g).filter(Boolean) : null;

  return (
    <div>
      {parts ? (
        <div className="ins__section">
          <div className="ins__label">What matched</div>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            {parts.map((part, i) =>
              part.startsWith('<b>') ? (
                <strong key={i}>{part.slice(3, -4)}</strong>
              ) : (
                <span key={i}>{part}</span>
              ),
            )}
          </p>
        </div>
      ) : null}

      <Rows
        title="Match"
        rows={[
          ['Relevance', d.rank != null ? d.rank.toFixed(4) : 'Not ranked — matched on metadata'],
          ['Found in', d.snippet ? 'The document text' : 'Name and metadata only'],
          ['Classification', sentence(d.classification)],
        ]}
      />

      <div className="ins__section ins__note">
        Occurrence counts and page numbers are not shown because the index stores a document's
        text, not where in it each word falls. Scanned pages match nothing at all until OCR runs.
      </div>
    </div>
  );
}
