export default function ScopePane({ heading, note, items, activeIndex, onSelect }) {
  return (
    <div className="scope">
      <div className="scope__head">{heading}</div>

      <div className="scope__list">
        {items.map(([label, depth, count], i) => (
          <button
            key={`${label}-${i}`}
            type="button"
            className={`scope__row${i === activeIndex ? ' is-active' : ''}`}
            style={{ paddingLeft: 12 + depth * 13 }}
            onClick={() => onSelect(i)}
          >
            <span className="scope__mark">{depth === 0 ? '▸' : ''}</span>
            <span className="scope__label">{label}</span>
            {count ? <span className="scope__count">{count}</span> : null}
          </button>
        ))}
      </div>

      <div className="scope__note">{note}</div>
    </div>
  );
}
