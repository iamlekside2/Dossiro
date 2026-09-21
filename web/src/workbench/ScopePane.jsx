/**
 * The left pane: what the list is filtered to.
 *
 * Rows are indented 13px per level, which is enough to read as a hierarchy at
 * 32px row height without pushing deep labels off the edge — the label
 * ellipsises rather than wrapping, because a scope list that changes height as
 * you scroll is hard to aim at.
 */
export default function ScopePane({ heading, note, items, activeIndex, onSelect, open }) {
  return (
    // A column of the shell above 1180px; below it, a drawer that slides over
    // the content from the left. The transform is what animates, so the pane
    // stays in the layout and does not have to be re-measured when it opens.
    <div
      className={`flex w-scope min-h-0 flex-none flex-col border-r border-line bg-surface-2
        max-wide:fixed max-wide:inset-y-0 max-wide:left-0 max-wide:z-40 max-wide:w-[280px]
        max-wide:shadow-[1px_0_0_var(--color-line)] max-wide:transition-transform max-wide:duration-[180ms]
        max-narrow:w-[86vw] max-narrow:max-w-[320px]
        ${open ? 'max-wide:translate-x-0' : 'max-wide:-translate-x-full'}`}
    >
      <div className="flex h-listhead flex-none items-center border-b border-line-soft px-3 text-label font-bold uppercase tracking-[0.07em] text-soft">
        {heading}
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {items.map(([label, depth, count], i) => (
          <button
            key={`${label}-${i}`}
            type="button"
            onClick={() => onSelect(i)}
            style={{ paddingLeft: 12 + depth * 13 }}
            className={`flex h-8 w-full cursor-pointer items-center gap-1.5 border-0 pr-3 text-left text-ui text-ink max-narrow:h-11 ${
              i === activeIndex
                ? 'bg-blue-tint font-semibold'
                : 'bg-transparent hover:bg-line-faint'
            }`}
          >
            <span className="w-2 flex-none text-[9px] text-faint">{depth === 0 ? '▸' : ''}</span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {count ? <span className="flex-none text-chip text-faint">{count}</span> : null}
          </button>
        ))}
      </div>

      <div className="flex-none border-t border-line-soft px-3 pb-[13px] pt-[11px] text-chip leading-[1.5] text-dim">
        {note}
      </div>
    </div>
  );
}
