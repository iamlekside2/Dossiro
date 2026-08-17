import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { getRefreshToken, onUnauthorized, setAccessToken, setRefreshToken } from '../lib/api.js';

/**
 * The real session.
 *
 * Identity comes from the API, not from this file — `signIn` exchanges
 * credentials for tokens and the server decides who you are and what you may
 * do. On reload the refresh token in sessionStorage is exchanged for a fresh
 * access token and the identity is re-fetched, so a role change or a revoked
 * session takes effect immediately rather than at the next login.
 */

const SessionContext = createContext(null);

/** Drawers unlocked with their own passcode this session. Not security — the
 *  API enforces drawer locks; this only stops the UI asking twice. */
const UNLOCKED_KEY = 'cv.unlocked';
/** Whether this device has already been through the trust question. */
const DEVICE_KEY = 'cv.device';

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [device, setDevice] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(DEVICE_KEY) ?? 'null');
    } catch {
      return null;
    }
  });
  const [unlockedDrawers, setUnlockedDrawers] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(UNLOCKED_KEY) ?? '[]');
    } catch {
      return [];
    }
  });
  /** 'restoring' until we know whether the stored refresh token is still good. */
  const [status, setStatus] = useState(getRefreshToken() ? 'restoring' : 'anonymous');

  const clear = useCallback(() => {
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    setOrganization(null);
    try {
      sessionStorage.removeItem(UNLOCKED_KEY);
      sessionStorage.removeItem(DEVICE_KEY);
    } catch {
      /* ignore */
    }
    setUnlockedDrawers([]);
    setDevice(null);
    setStatus('anonymous');
  }, []);

  /**
   * Records the answer to "trust this device?".
   *
   * Also the signal that the sign-in flow is finished. Without it, `signIn`
   * flips the route guard and /signin redirects away before step 2 of 2 can
   * render — the device question would be unreachable.
   */
  const decideDevice = useCallback((trusted) => {
    const next = { trusted, decidedAt: new Date().toISOString() };
    try {
      sessionStorage.setItem(DEVICE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setDevice(next);
  }, []);

  // A 401 that survives a refresh means the session is genuinely gone.
  useEffect(() => {
    onUnauthorized(clear);
    return () => onUnauthorized(null);
  }, [clear]);

  // Restore across a reload.
  useEffect(() => {
    if (status !== 'restoring') return undefined;
    let cancelled = false;

    (async () => {
      try {
        const me = await api.auth.me();
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
        api.organization
          .current()
          .then((org) => !cancelled && setOrganization(org))
          .catch(() => undefined);
      } catch {
        if (!cancelled) clear();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, clear]);

  const signIn = useCallback(async (email, password, organizationId) => {
    const res = await api.auth.login(email, password, organizationId);
    setAccessToken(res.accessToken);
    setRefreshToken(res.refreshToken);
    setUser(res.user);
    setStatus('authenticated');

    // Not fatal if it fails; the workbench only uses it for the tenant name.
    api.organization.current().then(setOrganization).catch(() => undefined);

    return res.user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Already invalid server-side; clearing locally is still correct.
    }
    clear();
  }, [clear]);

  const unlockDrawer = useCallback((name) => {
    setUnlockedDrawers((prev) => {
      if (prev.includes(name)) return prev;
      const next = [...prev, name];
      try {
        sessionStorage.setItem(UNLOCKED_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      organization,
      status,
      signedIn: status === 'authenticated',
      restoring: status === 'restoring',
      deviceTrusted: device?.trusted ?? false,
      /** False until the trust question has been answered on this device. */
      deviceDecided: device !== null,
      decideDevice,
      unlockedDrawers,
      isUnlocked: (name) => unlockedDrawers.includes(name),
      unlockDrawer,
      signIn,
      signOut,
    }),
    [user, organization, status, device, decideDevice, unlockedDrawers, unlockDrawer, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside a SessionProvider');
  return ctx;
}

/** Drawers that carry their own passcode on top of role access. */
export const LOCKED_DRAWERS = {
  'Human resources': {
    label: 'Human resources / Personnel files',
    code: '802914',
    holder: 'HR',
  },
};
