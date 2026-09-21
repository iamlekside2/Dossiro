/**
 * The contextual counts along the bottom of the shell.
 *
 * Cells are divided by a left border, with the first one dropping it so the
 * row does not begin with a stray rule.
 */
export default function StatusBar({ cells }) {
  return (
    <div className="flex h-statusbar flex-none items-stretch border-t border-line bg-chrome text-meta text-soft max-narrow:text-chip">
      {/* On a phone only the first count survives alongside the sync state;
          the rest is noise at that width. */}
      {cells.map((c, i) => (
        <div
          key={`${c}-${i}`}
          className={`flex items-center whitespace-nowrap border-l border-line px-3 first:border-l-0 ${
            i > 0 ? 'max-narrow:hidden' : ''
          }`}
        >
          {c}
        </div>
      ))}
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 border-l border-line px-3">
        <span className="h-1.5 w-1.5 rounded-full bg-green" />
        <span>Synced 12s ago</span>
      </div>
    </div>
  );
}
