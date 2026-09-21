import { SearchIcon } from './icons.jsx';

export default function Toolbar({
  crumbs,
  verbs,
  findPlaceholder,
  onOpenScope,
  scopeLabel,
  onVerb,
  find,
  onFind,
}) {
  return (
    <div className="flex h-toolbar flex-none items-center gap-2.5 border-b border-line bg-surface-3 px-3 max-narrow:gap-2 max-narrow:px-2.5">
      {/* Only above the fold does the scope pane sit beside the list; below it,
          this opens it as a drawer. */}
      <button
        type="button"
        onClick={onOpenScope}
        className="flex h-[26px] max-w-[190px] flex-none cursor-pointer items-center gap-[7px] overflow-hidden whitespace-nowrap border border-line-strong bg-surface px-3 text-ui font-semibold text-muted wide:hidden"
      >
        <span aria-hidden="true">☰</span>
        <span className="truncate">{scopeLabel}</span>
      </button>

      {/* The breadcrumb is the first thing to go on a phone: the tab strip
          already says where you are, and the find field earns the space. */}
      <div className="flex flex-none items-center gap-1.5 whitespace-nowrap text-ui max-narrow:hidden">
        {crumbs.map((label, i) => (
          <span key={`${label}-${i}`} className="contents">
            {i > 0 ? <span className="text-crumb-sep">/</span> : null}
            <span className={i === crumbs.length - 1 ? 'font-semibold text-ink' : undefined}>
              {label}
            </span>
          </span>
        ))}
      </div>

      <div className="h-5 w-px flex-none bg-line max-narrow:hidden" />

      {/* Verbs scroll rather than wrap, and the scrollbar is hidden: a visible
          one inside a 42px toolbar is thicker than the row it sits in. */}
      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {verbs.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => onVerb?.(label)}
            // The first verb is the primary action for the area, so it carries
            // the weight; the rest are muted until hovered.
            className={`h-[26px] cursor-pointer whitespace-nowrap border-0 bg-transparent px-2.5 text-ui hover:bg-line-soft max-narrow:h-[34px] ${
              i === 0 ? 'font-semibold text-ink' : 'text-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {/* Shrinks before anything clips, down to 150px — then takes the width
          the breadcrumb gave up once that is hidden. */}
      <label className="flex h-[26px] min-w-[150px] flex-[0_1_250px] items-center gap-1.5 border border-line-strong bg-surface px-2 max-narrow:min-w-0 max-narrow:flex-1">
        <SearchIcon />
        <input
          type="search"
          placeholder={findPlaceholder}
          aria-label={findPlaceholder}
          value={find ?? ''}
          onChange={(e) => onFind?.(e.target.value)}
          className="min-w-0 flex-1 border-0 bg-transparent text-detail text-ink outline-0 placeholder:text-ghost"
        />
      </label>
    </div>
  );
}
