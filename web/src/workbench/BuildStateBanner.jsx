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
    <div className={`buildstate ${isReady ? 'buildstate--ready' : 'buildstate--sample'}`}>
      <span className={`chip ${isReady ? 'chip--blue' : 'chip--ochre'}`}>
        {isReady ? 'Not wired yet' : 'Sample data'}
      </span>

      <div className="buildstate__text">
        {isReady || partial ? (
          <>
            <strong>These rows are from the design, not the database.</strong>{' '}
            {info.note}
            {info.endpoint && (
              <>
                {' '}
                The endpoint is ready: <code>{info.endpoint}</code>
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
