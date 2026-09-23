import { btn, callout, chip } from '../../ui.js';

/**
 * One renderer, many panes.
 *
 * Every pane in the operator console is some combination of five things: a
 * block of key and value, a titled list whose rows may carry a chip, a
 * callout, some actions, and a footnote. Rather than eleven components that
 * drift apart, each pane is a plain object naming which of the five it wants.
 *
 * A pane spec:
 *
 *   {
 *     kv: [['Plan', 'Standard'], ['Seats', '5 of 5']],
 *     list: { title: 'Roles', items: [{ label, note, chip: 'green' }] },
 *     callout: { tone: 'ochre', title: '…', text: '…' },
 *     actions: [{ label: 'Request access', onClick, tone: 'primary' }],
 *     footnote: '…',
 *   }
 *
 * Everything is optional, and a pane that returns null says so itself.
 */
export function ConsoleInspector({ panes, active, onSelect, spec, empty }) {
  return (
    <aside className="flex w-[430px] min-h-0 flex-none flex-col border-l border-line bg-surface-2 max-wide:w-[360px] max-narrow:hidden">
      <div role="tablist" className="flex h-instabs flex-none items-stretch border-b border-line">
        {panes.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={id === active}
            onClick={() => onSelect(id)}
            className={`cursor-pointer whitespace-nowrap border-0 border-r border-line px-[13px] text-detail text-ink ${
              id === active
                ? 'bg-surface font-semibold shadow-[inset_0_-2px_0_var(--color-blue)]'
                : 'bg-transparent hover:bg-line-soft'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!spec ? (
          <p className="px-4 py-[14px] text-chip leading-[1.55] text-dim">{empty}</p>
        ) : (
          <PaneBody spec={spec} />
        )}
      </div>
    </aside>
  );
}

function PaneBody({ spec }) {
  return (
    <div>
      {spec.kv?.length ? (
        <div className="border-b border-line-soft px-4 py-[14px]">
          {spec.kv.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 py-[5px]">
              <span className="flex-none text-detail text-dim">{k}</span>
              <span className="text-right text-[14px]">{v ?? '—'}</span>
            </div>
          ))}
        </div>
      ) : null}

      {spec.list?.items?.length ? (
        <div className="border-b border-line-soft px-4 py-[14px]">
          <div className="mb-2 text-label font-bold uppercase tracking-[0.07em] text-soft">
            {spec.list.title}
          </div>
          {spec.list.items.map((item, i) => (
            <div key={`${item.label}-${i}`} className="flex items-start gap-2 py-[6px]">
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px]">{item.label}</span>
                {item.note ? (
                  <span className="block text-chip leading-[1.45] text-dim">{item.note}</span>
                ) : null}
              </span>
              {item.chip ? (
                <span className={`${chip(item.chipTone ?? '')} mt-px flex-none`}>{item.chip}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {spec.callout ? (
        <div className="px-4 py-[14px]">
          <div className={callout(spec.callout.tone ?? '')}>
            {spec.callout.title ? (
              <strong className="mb-0.5 block">{spec.callout.title}</strong>
            ) : null}
            {spec.callout.text}
          </div>
        </div>
      ) : null}

      {spec.actions?.length ? (
        <div className="flex flex-wrap gap-2 px-4 pb-[14px]">
          {spec.actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={btn(a.tone)}
              disabled={a.disabled}
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}

      {spec.footnote ? (
        <p className="border-t border-line-soft px-4 py-[14px] text-chip leading-[1.55] text-dim">
          {spec.footnote}
        </p>
      ) : null}
    </div>
  );
}
