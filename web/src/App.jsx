import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Workbench from './workbench/Workbench.jsx';
import AcceptInvite from './screens/AcceptInvite.jsx';
import PlatformConsole from './screens/PlatformConsole.jsx';
import ShareLink from './screens/ShareLink.jsx';
import SignIn from './screens/SignIn.jsx';
import { SessionProvider, useSession } from './session/SessionContext.jsx';

/**
 * The workbench is a fixed-height shell that manages its own scrolling, so the
 * document must not scroll. Every other screen is an ordinary page that should.
 */
function useScrollMode() {
  const { pathname } = useLocation();
  // Only the workbench owns its own scrolling; the console is a normal page.
  const isShell = pathname === '/';

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.classList.toggle('allow-scroll', !isShell);
    body.classList.toggle('allow-scroll', !isShell);
  }, [isShell]);
}

/**
 * Sends anyone without a session to sign in first, remembering where they were
 * headed so the sign-in can return them there.
 *
 * Navigation only — the API is what actually enforces access.
 */
function RequireSession({ children }) {
  const { signedIn } = useSession();
  const location = useLocation();

  if (!signedIn) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }
  return children;
}

/**
 * The workbench is for people who have documents. The platform organisation
 * holds none, so an operator lands in the console instead — and vice versa.
 */
function RequireTenant({ children }) {
  const { user } = useSession();
  if (user?.isPlatform) return <Navigate to="/platform" replace />;
  return children;
}

function RequirePlatform({ children }) {
  const { user } = useSession();
  if (!user?.isPlatform) return <Navigate to="/" replace />;
  return children;
}

/**
 * Skip the sign-in screen for a session that has completed the whole flow.
 *
 * Deliberately waits for `deviceDecided`, not just `signedIn` — otherwise
 * exchanging credentials would immediately redirect away from /signin and the
 * device-trust step could never be shown.
 */
function RedirectIfSignedIn({ children }) {
  const { signedIn, deviceDecided } = useSession();
  if (signedIn && deviceDecided) return <Navigate to="/" replace />;
  return children;
}

function Shell() {
  useScrollMode();

  return (
    <Routes>
      {/* The external recipient needs no account, so this sits outside the
          session gate entirely — that is the whole point of a share link. */}
      <Route path="/s/:token" element={<ShareLink />} />

      {/* The only way in for anyone not seeded — there is no self-serve signup.
          Outside the session gate: an invitee has no session yet by definition. */}
      <Route path="/accept-invite" element={<AcceptInvite />} />

      <Route
        path="/signin"
        element={
          <RedirectIfSignedIn>
            <SignIn />
          </RedirectIfSignedIn>
        }
      />

      <Route
        path="/"
        element={
          <RequireSession>
            <RequireTenant>
              <Workbench />
            </RequireTenant>
          </RequireSession>
        }
      />

      {/* Calm Global's operator console. Tenant lifecycle, no documents. */}
      <Route
        path="/platform"
        element={
          <RequireSession>
            <RequirePlatform>
              <PlatformConsole />
            </RequirePlatform>
          </RequireSession>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}
