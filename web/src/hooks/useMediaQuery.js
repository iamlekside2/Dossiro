import { useEffect, useState } from 'react';

/**
 * Subscribes to a media query.
 *
 * Reads the initial value synchronously so the first paint is already correct —
 * defaulting to desktop and correcting in an effect makes a phone render the
 * three-pane layout for a frame, which shows up as a visible jump.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const sync = () => setMatches(mql.matches);

    sync();
    mql.addEventListener('change', sync);
    // Belt and braces: some environments resize the viewport without emitting a
    // matchMedia change event (devtools device emulation is one). Falling back
    // to resize costs nothing and stops the layout desynchronising from CSS.
    window.addEventListener('resize', sync);

    return () => {
      mql.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
    };
  }, [query]);

  return matches;
}

/** Below this the three-pane layout no longer fits: 238 + 430 + a usable list. */
export const BP_TABLET = 1180;
/** Below this a single pane at a time is the only honest layout. */
export const BP_PHONE = 760;

export const useIsPhone = () => useMediaQuery(`(max-width: ${BP_PHONE - 1}px)`);
export const useIsTablet = () =>
  useMediaQuery(`(min-width: ${BP_PHONE}px) and (max-width: ${BP_TABLET - 1}px)`);
export const useIsNarrow = () => useMediaQuery(`(max-width: ${BP_TABLET - 1}px)`);
