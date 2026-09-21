import { LIVE, READY, areaState, isScopeLive } from '../data/buildState.js';

/**
 * Says plainly what is behind the screen you are looking at.
 *
 * Shown above the rows rather than tucked into a corner, because the failure
 * mode this prevents is somebody believing the sample data — and that only
 * happens if the warning is easy to miss.
 */
export default function BuildStateBanner({ area, scopeIndex }) {
  const info = areaState(area);

  // Fully live: nothing to say, and a banner on every screen would train
  // people to ignore banners.
  if (info.state === LIVE && isScopeLive(area, scopeIndex)) return null;

  const isReady = info.state === READY;
  const partial = info.state === LIVE;

  return (
    // Blue where an endpoint exists and the screen is simply not wired to it,
    // ochre where nothing is built. Two different pieces of news.
    <div
      className={`flex flex-none items-start gap-2.5 border-b px-4 py-[9px] text-detail leading-[1.5] ${
        isReady ? 'border-blue-border bg-blue-bg text-muted' : 'border-ochre-border bg-ochre-bg text-ochre'
      }`}
    >
      <span className={`chip ${isReady ? 'chip--blue' : 'chip--ochre'}`}>
        {isReady ? 'Not wired yet' : 'Sample data'}
      </span>

      <div className="min-w-0">
        {isReady || partial ? (
          <>
            <strong>These rows are from the design, not the database.</strong>{' '}
            {info.note}
            {info.endpoint && (
              <>
                {' '}
                The endpoint is ready:{' '}
                <code className="whitespace-nowrap border border-line-strong bg-surface px-1 font-mono text-chip">
                  {info.endpoint}
                </code>
              </>
            )}
          </>
        ) : (
          <>
            <strong>Nothing is built behind this screen yet.</strong> {info.note}
            {info.needs && (
              <>
                {' '}
                Needs: {info.needs}.
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
