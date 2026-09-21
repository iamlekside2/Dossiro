import { chipClass, flagClass } from '../data/areas.js';
import BuildStateBanner from './BuildStateBanner.jsx';
import { LockIcon } from './icons.jsx';

/** `1` means minmax(0, 1fr) — a bare 1fr cannot shrink below its content. */
function gridTemplate(cols) {
  return cols.map(([, w]) => (w === 1 ? 'minmax(0, 1fr)' : `${w}px`)).join(' ');
}

export default function ListPane({
  hidden,
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
    // `relative` anchors the locked-drawer prompt to this pane.
    <div
      className={`relative min-h-0 min-w-0 flex-1 flex-col bg-surface ${hidden ? 'hidden' : 'flex'}`}
    >
      {overlay}

      {/* Says what is actually behind this screen, before the rows persuade
          anyone otherwise. */}
      <BuildStateBanner area={area} scopeIndex={scopeIndex} />

      {/* The column template travels as a custom property rather than an inline
          grid-template-columns, so the fold below 1180px can override it with a
          plain utility instead of needing !important to beat an inline style.
          The 12px right gutter aligns the header with scrollbar-inset rows. */}
      <div
        style={{ '--cols': grid }}
        className="grid h-listhead flex-none grid-cols-[var(--cols)] items-center gap-[14px] border-y border-line bg-surface-3 pl-4 pr-7 text-meta font-semibold text-soft max-wide:grid-cols-1"
      >
        {cols.map(([label], i) => {
          const sorted = i === sortCol;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onSort(i)}
              className={`flex min-w-0 cursor-pointer items-center gap-[5px] overflow-hidden whitespace-nowrap border-0 bg-none p-0 text-left font-[inherit] ${
                sorted ? 'text-ink' : 'text-inherit'
              } ${i > 0 ? 'max-wide:hidden' : ''}`}
            >
              <span>{label}</span>
              {/* Transparent until sorted, so the row does not shift when a
                  caret appears. */}
              <span
                className={`text-[8px] transition-transform duration-[120ms] ${
                  sorted ? 'text-soft' : 'text-transparent'
                } ${sorted && sortDir === 'asc' ? 'rotate-180' : ''}`}
              >
                ▾
              </span>
            </button>
          );
        })}
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

      <div className="min-h-0 flex-1 overflow-y-auto">
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
      style={{ '--cols': grid }}
      className={`grid cursor-pointer grid-cols-[var(--cols)] items-center gap-[14px] border-b border-line-faint px-4 py-[9px] max-wide:grid-cols-1 max-wide:py-[11px] max-narrow:min-h-16 max-narrow:py-3 ${
        selected ? 'bg-blue-tint' : 'hover:bg-row-hover'
      }`}
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
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          aria-label={checked ? `Deselect ${name}` : `Select ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          // The tick is always rendered and merely transparent, so checking a
          // row cannot change its height.
          // 22px on a phone, because 16px is not a thumb-sized target.
          className={`flex h-4 w-4 flex-none cursor-pointer items-center justify-center border p-0 text-[10.5px] max-narrow:h-[22px] max-narrow:w-[22px] ${
            checked
              ? 'border-blue bg-blue text-white'
              : 'border-line-strong bg-surface text-transparent'
          }`}
        >
          ✓
        </button>

        <span className="flex h-[22px] w-[30px] flex-none items-center justify-center border border-neutral-border bg-line-faint text-tag font-bold text-soft">
          {kind}
        </span>

        {/* 120px floor so the record name can never be crushed to nothing. */}
        <div className="min-w-[120px] flex-1">
          <div className="truncate text-row font-medium max-narrow:text-[15px]" title={name}>
            {name}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            {flag ? <span className={`chip ${flagClass(flag)}`}>{flag}</span> : null}
            <span className="truncate text-detail text-dim max-narrow:text-ui" title={meta}>
              {meta}
            </span>
          </div>

          {/* Below 1180px the list pane cannot hold four columns, so the
              secondary values fold under the name rather than being dropped. */}
          {foldColumns && (
            <div className="mt-[5px] hidden flex-wrap items-center gap-2 text-detail text-dim max-wide:flex">
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

      {/* Always wrapped, even when the value is a chip — otherwise a bare chip
          escapes the rule that hides these columns when they fold, and shows up
          twice. */}
      <Cell>{c2Chip !== null ? <span className={`chip ${c2Chip}`}>{c2}</span> : c2}</Cell>
      <Cell>{c3}</Cell>
      <Cell>{c4}</Cell>
    </div>
  );
}

/** A secondary column. Flex so a chip inside does not stretch to fill it. */
const Cell = ({ children }) => (
  <div className="flex min-w-0 items-center overflow-hidden truncate whitespace-nowrap text-detail text-muted max-wide:hidden">
    {children}
  </div>
);

function BulkBar({ count, total, verbs, onSelectAll, onClear }) {
  return (
    <div className="flex h-bulkbar flex-none items-center gap-2.5 bg-ink px-4 text-white max-narrow:gap-1.5 max-narrow:overflow-x-auto max-narrow:px-3">
      <span className="whitespace-nowrap text-detail font-semibold">
        {count} record{count === 1 ? '' : 's'} selected
      </span>
      <button
        type="button"
        onClick={onSelectAll}
        className="cursor-pointer border-0 bg-none p-0 text-detail text-blue-on-dark"
      >
        Select all {total}
      </button>
      <span className="h-[18px] w-px bg-[#4a4f57]" />
      {verbs.map((v, i) => (
        <button
          key={v}
          type="button"
          className={`h-[26px] cursor-pointer whitespace-nowrap border-0 bg-transparent px-2.5 text-detail text-white hover:bg-ink-2 ${
            i === 0 ? 'font-semibold' : ''
          }`}
        >
          {v}
        </button>
      ))}
      <span className="flex-1" />
      <button
        type="button"
        onClick={onClear}
        className="cursor-pointer border-0 bg-none text-detail text-crumb-sep"
      >
        Clear
      </button>
    </div>
  );
}

/* -- The three states that replace the rows entirely --------------------- */

function DeniedState() {
  return (
    <State>
      <div className="mb-[14px] text-faint">
        <LockIcon />
      </div>
      <StateTitle>Litigation is closed to your role</StateTitle>
      <StateBody>
        This drawer is restricted to Legal Counsel and the General Counsel. You can see that it
        exists and how many records it holds, but not their names.
      </StateBody>
      <StateBody>
        That is deliberate: a folder listing should never leak the existence of a matter.
      </StateBody>
      <StateActions>
        <Btn primary>Request access</Btn>
        <Btn>Who can grant it</Btn>
      </StateActions>
      <StateNote>
        Requests go to Rachel Tan, Legal Counsel. This attempt is already in the audit trail.
      </StateNote>
    </State>
  );
}

function EmptyState({ area }) {
  const isApprovals = area === 'approvals';
  return (
    <State>
      <StateTitle>
        {isApprovals ? 'Nothing completed yet this week' : 'Nothing here'}
      </StateTitle>
      <StateBody>
        {isApprovals
          ? 'Items you approve or return will appear here. The queue clears at the end of each week.'
          : 'No records match this scope.'}
      </StateBody>
      <StateNote>
        Records you have no clearance for are hidden entirely rather than shown as locked rows.
      </StateNote>
    </State>
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
    <State>
      <StateTitle>
        {denied ? 'You do not have access to this' : offline ? 'Cannot reach the server' : 'That did not load'}
      </StateTitle>
      <StateBody>
        {denied
          ? error.message
          : offline
            ? 'The API is not responding. Check that it is running on port 4010.'
            : error?.message}
      </StateBody>
      {!denied && (
        <StateActions>
          <Btn primary onClick={onRetry}>
            Try again
          </Btn>
        </StateActions>
      )}
    </State>
  );
}

/** Skeleton for a live fetch — no progress strip, because there is no progress. */
function FetchingState() {
  return (
    <div>
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} index={i} wide={[54, 42, 62, 38, 48][i]} narrow={[34, 26, 40, 22, 30][i]} />
      ))}
    </div>
  );
}

/** A scan in progress, which does report real progress — hence the strip. */
function LoadingState() {
  return (
    <div>
      <div className="flex items-center justify-between border-b border-ochre-border bg-ochre-bg px-4 py-[9px] text-detail text-ochre">
        <span>Scanner — reception is capturing sheet 7 of 18</span>
        <span>39%</span>
      </div>
      <div className="h-0.5 bg-line-soft">
        <div className="h-0.5 bg-ochre" style={{ width: '39%' }} />
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} index={i} wide={[62, 48, 70, 40, 55][i]} narrow={[38, 30, 44, 26, 34][i]} />
      ))}
    </div>
  );
}

/* -- Shared state furniture ------------------------------------------------ */

const State = ({ children }) => <div className="max-w-[560px] px-10 py-11">{children}</div>;

const StateTitle = ({ children }) => (
  <h2 className="mb-2 text-head font-semibold">{children}</h2>
);

const StateBody = ({ children }) => (
  <p className="mb-2 text-row leading-[1.6] text-muted">{children}</p>
);

const StateNote = ({ children }) => (
  <p className="mt-[14px] text-meta leading-[1.55] text-dim">{children}</p>
);

const StateActions = ({ children }) => <div className="mt-[18px] flex gap-2">{children}</div>;

const Btn = ({ primary, children, ...props }) => (
  <button
    type="button"
    {...props}
    className={`inline-flex h-[30px] cursor-pointer items-center justify-center whitespace-nowrap border px-[14px] text-ui font-semibold ${
      primary
        ? 'border-blue bg-blue text-white hover:border-blue-hover hover:bg-blue-hover'
        : 'border-line-strong bg-surface text-ink hover:border-ink'
    }`}
  >
    {children}
  </button>
);

/**
 * One placeholder row. The stagger is what makes a list of five read as
 * loading rather than as a broken render — one of only two animations the
 * handoff permits.
 */
const Skeleton = ({ index, wide, narrow }) => (
  <div
    className="flex animate-[cv-skeleton_1.4s_ease-in-out_infinite] items-center gap-2.5 border-b border-line-faint px-4 py-[13px]"
    style={{ animationDelay: `${index * 0.12}s` }}
  >
    <div className="h-[22px] w-[30px] flex-none bg-skeleton" />
    <div className="flex-1">
      <div className="mb-1.5 h-[9px] bg-skeleton" style={{ width: `${wide}%` }} />
      <div className="h-2 bg-skeleton-2" style={{ width: `${narrow}%` }} />
    </div>
  </div>
);
