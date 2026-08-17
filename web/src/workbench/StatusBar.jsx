export default function StatusBar({ cells }) {
  return (
    <div className="statusbar">
      {cells.map((c, i) => (
        <div key={`${c}-${i}`} className="statusbar__cell">
          {c}
        </div>
      ))}
      <div className="statusbar__spacer" />
      <div className="statusbar__sync">
        <span className="statusbar__dot" />
        <span>Synced 12s ago</span>
      </div>
    </div>
  );
}
