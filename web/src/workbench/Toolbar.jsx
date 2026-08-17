import { SearchIcon } from './icons.jsx';

export default function Toolbar({ crumbs, verbs, findPlaceholder, onOpenScope, scopeLabel, onVerb }) {
  return (
    <div className="toolbar">
      {/* Only rendered below 1180px, where the scope pane becomes a drawer. */}
      <button type="button" className="toolbar__menu" onClick={onOpenScope}>
        <span aria-hidden="true">☰</span>
        <span>{scopeLabel}</span>
      </button>

      <div className="crumbs">
        {crumbs.map((label, i) => (
          <span key={`${label}-${i}`} style={{ display: 'contents' }}>
            {i > 0 ? <span className="crumbs__sep">/</span> : null}
            <span className={i === crumbs.length - 1 ? 'crumbs__last' : undefined}>{label}</span>
          </span>
        ))}
      </div>

      <div className="toolbar__divider" />

      <div className="toolbar__verbs">
        {verbs.map((label) => (
          <button key={label} type="button" className="verb" onClick={() => onVerb?.(label)}>
            {label}
          </button>
        ))}
      </div>

      <div className="toolbar__spacer" />

      <label className="find">
        <SearchIcon />
        <input type="search" placeholder={findPlaceholder} aria-label={findPlaceholder} />
      </label>
    </div>
  );
}
