import { chipClass, flagClass } from '../data/areas.js';
import BuildStateBanner from './BuildStateBanner.jsx';
import { LockIcon } from './icons.jsx';

/** `1` means minmax(0, 1fr) — a bare 1fr cannot shrink below its content. */
function gridTemplate(cols) {
  return cols.map(([, w]) => (w === 1 ? 'minmax(0, 1fr)' : `${w}px`)).join(' ');
}

export default function ListPane({
  area,
  cols,
  rows,
  selectedIndex,
  onSelectRow,
  sortCol,
  sortDir,
  onSort,
  sel,
  onToggle,
  onSelectAll,
  onClear,
  bulkVerbs,
  selCount,
  isDenied,
  isLoading,
  isEmpty,
  isPhone,
  foldColumns,
  scopeIndex,
  overlay,
  error,
  onRetry,
  isLive,
}) {
  const grid = gridTemplate(cols);

  return (
    // `position: relative` anchors the locked-drawer prompt to this pane.
    <div className="list" style={{ position: 'relative' }}>
      {overlay}

      {/* Says what is actually behind this screen, before the rows persuade
          anyone otherwise. */}
      <BuildStateBanner area={area} scopeIndex={scopeIndex} />
      <div className="list__head" style={{ gridTemplateColumns: grid }}>
        {cols.map(([label], i) => (
          <button
            key={label}
            type="button"
            className={`list__col${i === sortCol ? ' is-sorted' : ''}`}
            onClick={() => onSort(i)}
          >
            <span>{label}</span>
            <span className={`list__caret${i === sortCol && sortDir === 'asc' ? ' is-asc' : ''}`}>▾</span>
          </button>
        ))}
      </div>

      {selCount > 0 && (
        <BulkBar
          count={selCount}
          total={rows.length}
          verbs={bulkVerbs}
          onSelectAll={onSelectAll}
          onClear={onClear}
        />
      )}

      <div className="list__rows">
        {error && <ErrorState error={error} onRetry={onRetry} />}
        {!error && isDenied && <DeniedState />}
        {!error && isLoading && (isLive ? <FetchingState /> : <LoadingState />)}
        {!error && isEmpty && <EmptyState area={area} />}

        {!error &&
          !isDenied &&
          !isLoading &&
          rows.map((r, i) => (
            <Row
              key={`${r[1]}-${i}`}
              record={r}
              cols={cols}
              grid={grid}
              selected={i === selectedIndex}
              checked={Boolean(sel[r[1]])}
              onSelect={() => onSelectRow(i)}
              onToggle={() => onToggle(r[1])}
              foldColumns={foldColumns}
            />
          ))}
      </div>
    </div>
  );
}

function Row({ record, cols, grid, selected, checked, onSelect, onToggle, foldColumns }) {
  const [kind, name, meta, flag, c2, c3, c4] = record;
  const c2Chip = chipClass(c2);

  return (
    <div
      className={`row${selected ? ' is-selected' : ''}`}
      style={{ gridTemplateColumns: grid }}
      onClick={onSelect}
      role="row"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="row__record">
        <button
          type="button"
          className={`row__check${checked ? ' is-checked' : ''}`}
          aria-label={checked ? `Deselect ${name}` : `Select ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          ✓
        </button>

        <span className="row__kind">{kind}</span>

        <div className="row__text">
          <div className="row__name" title={name}>
            {name}
          </div>
          <div className="row__meta">
            {flag ? <span className={`chip ${flagClass(flag)}`}>{flag}</span> : null}
            <span className="row__metaText" title={meta}>
              {meta}
            </span>
          </div>

          {/* Below 1180px the list pane cannot hold four columns, so the
              secondary values fold under the name rather than being dropped. */}
          {foldColumns && (
            <div className="row__mobileMeta">
              {c2Chip !== null ? (
                <span className={`chip ${c2Chip}`}>{c2}</span>
              ) : (
                <span>{c2}</span>
              )}
              {c3 ? <span>· {c3}</span> : null}
              {c4 ? <span>· {c4}</span> : null}
            </div>
          )}
        </div>
      </div>

      {/* Always inside .row__cell, even when the value is a chip — otherwise a
          bare chip escapes the rule that hides these columns when they fold,
          and shows up twice. */}
      <div className="row__cell">
        {c2Chip !== null ? <span className={`chip ${c2Chip}`}>{c2}</span> : c2}
      </div>
      <div className="row__cell">{c3}</div>
      <div className="row__cell">{c4}</div>
    </div>
  );
}

function BulkBar({ count, total, verbs, onSelectAll, onClear }) {
  return (
    <div className="bulk">
      <span className="bulk__count">
        {count} record{count === 1 ? '' : 's'} selected
      </span>
      <button type="button" className="bulk__link" onClick={onSelectAll}>
        Select all {total}
      </button>
      <span className="bulk__divider" />
      {verbs.map((v) => (
        <button key={v} type="button" className="bulk__verb">
          {v}
        </button>
      ))}
      <span className="bulk__spacer" style={{ flex: '1 1 auto' }} />
      <button type="button" className="bulk__clear" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}

/* -- The three states that replace the rows entirely --------------------- */

function DeniedState() {
  return (
    <div className="state">
      <div className="state__lock">
        <LockIcon />
      </div>
      <h2 className="state__title">Litigation is closed to your role</h2>
      <p className="state__body">
        This drawer is restricted to Legal Counsel and the General Counsel. You can see that it
        exists and how many records it holds, but not their names.
      </p>
      <p className="state__body">
        That is deliberate: a folder listing should never leak the existence of a matter.
      </p>
      <div className="state__actions">
        <button type="button" className="btn btn--primary">
          Request access
        </button>
        <button type="button" className="btn">
          Who can grant it
        </button>
      </div>
      <p className="state__note">
        Requests go to Rachel Tan, Legal Counsel. This attempt is already in the audit trail.
      </p>
    </div>
  );
}

function EmptyState({ area }) {
  const isApprovals = area === 'approvals';
  return (
    <div className="state">
      <h2 className="state__title">
        {isApprovals ? 'Nothing completed yet this week' : 'Nothing here'}
      </h2>
      <p className="state__body">
        {isApprovals
          ? 'Items you approve or return will appear here. The queue clears at the end of each week.'
          : 'No records match this scope.'}
      </p>
      <p className="state__note">
        Records you have no clearance for are hidden entirely rather than shown as locked rows.
      </p>
    </div>
  );
}

/**
 * A live area failed to load. Says what went wrong and offers the one action
 * that helps — no apology, no stack trace.
 */
function ErrorState({ error, onRetry }) {
  const denied = error?.status === 403;
  const offline = !error?.status;

  return (
    <div className="state">
      <h2 className="state__title">
        {denied ? 'You do not have access to this' : offline ? 'Cannot reach the server' : 'That did not load'}
      </h2>
      <p className="state__body">
        {denied
          ? error.message
          : offline
            ? 'The API is not responding. Check that it is running on port 4010.'
            : error?.message}
      </p>
      {!denied && (
        <div className="state__actions">
          <button type="button" className="btn btn--primary" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

/** Skeleton for a live fetch — no progress strip, because there is no progress. */
function FetchingState() {
  return (
    <div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="skel" style={{ animationDelay: `${i * 0.12}s` }}>
          <div className="skel__box" />
          <div className="skel__lines">
            <div className="skel__line" style={{ width: `${[54, 42, 62, 38, 48][i]}%` }} />
            <div className="skel__line--2" style={{ width: `${[34, 26, 40, 22, 30][i]}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadingState() {
  return (
    <div>
      <div className="loading__strip">
        <span>Scanner — reception is capturing sheet 7 of 18</span>
        <span>39%</span>
      </div>
      <div className="loading__bar">
        <div className="loading__fill" style={{ width: '39%' }} />
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="skel" style={{ animationDelay: `${i * 0.12}s` }}>
          <div className="skel__box" />
          <div className="skel__lines">
            <div className="skel__line" style={{ width: `${[62, 48, 70, 40, 55][i]}%` }} />
            <div className="skel__line--2" style={{ width: `${[38, 30, 44, 26, 34][i]}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
