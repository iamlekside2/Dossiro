import { useEffect, useMemo, useRef, useState } from 'react';
import { CURRENT_USER } from '../data/areas.js';
import { AREA_STATE, HIDE_UNBUILT, LIVE, READY, UNBUILT } from '../data/buildState.js';
import { useSession } from '../session/SessionContext.jsx';
import { chip } from '../ui.js';

/** The API speaks displayName/tier; the chrome wants name/role/initials. */
function present(user, organization) {
  if (!user) return CURRENT_USER;
  const name = user.displayName ?? user.email;
  return {
    name,
    email: user.email,
    role: (user.tier ?? '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
    organization: organization?.name,
    initials: name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase(),
  };
}

export default function TabStrip({ tabs, active, onSelect, counts }) {
  // Optionally drop unbuilt areas entirely, for a client demo.
  const shown = HIDE_UNBUILT ? tabs.filter(([id]) => AREA_STATE[id]?.state !== UNBUILT) : tabs;

  const { user, organization, deviceTrusted, signOut } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);

  const who = useMemo(() => present(user, organization), [user, organization]);

  // Close on an outside click or Escape, the way a menu is expected to behave.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div className="flex h-tabstrip flex-none items-stretch border-b border-line bg-chrome">
      <div className="flex items-center gap-2 border-r border-line px-[14px] text-ui font-bold">
        <img className="block h-5 w-auto" src="/brand/dossiro-logo.svg" alt="Dossiro" />
      </div>

      {/* On a phone the tabs scroll sideways rather than wrapping or shrinking
          to nothing; the scrollbar is hidden because it would be thicker than
          the 38px strip it sits in. */}
      <div
        role="tablist"
        className="flex min-w-0 items-stretch max-narrow:overflow-x-auto max-narrow:[scrollbar-width:none] max-narrow:[&::-webkit-scrollbar]:hidden"
      >
        {shown.map(([id, label, count]) => {
          const on = id === active;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSelect(id)}
              // The active tab is marked by an inset rule along its bottom
              // edge, which is why this is a shadow rather than a border: a
              // border would change the tab's height by a pixel.
              className={`flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-0 border-r border-line px-[14px] text-ui text-ink max-narrow:px-[13px] ${
                on
                  ? 'bg-surface font-semibold shadow-[inset_0_-2px_0_var(--color-blue)]'
                  : 'bg-transparent font-normal hover:bg-line-soft'
              }`}
            >
              <span>{label}</span>
              {/* A count on an unbuilt area is fiction, so show the state instead. */}
              {AREA_STATE[id]?.state === UNBUILT ? (
                <Marker>Sample</Marker>
              ) : AREA_STATE[id]?.state === READY ? (
                <Marker ready>Not wired</Marker>
              ) : counts?.[id] != null ? (
                // A live area reports what it actually holds.
                <Count>{counts[id].toLocaleString('en-GB')}</Count>
              ) : AREA_STATE[id]?.state === LIVE ? (
                // Live, but its real count is not known yet — only the area you
                // are in has fetched. Nothing is shown rather than the handoff's
                // figure, which is how Repository came to advertise 1,204
                // documents over a repository holding two.
                null
              ) : count ? (
                <Count>{count}</Count>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      <div className="relative flex items-stretch" ref={wrapRef}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
          className="flex cursor-pointer items-center gap-[9px] border-0 border-l border-line bg-transparent px-3 font-[inherit] hover:bg-line-soft"
        >
          {/* The avatar alone on a phone: the name and role cost more width
              than they earn when the tabs are already scrolling. */}
          <span className="text-right leading-[1.15] max-narrow:hidden">
            <span className="block text-detail text-muted">{who.name}</span>
            <span className="block text-chip text-faint">{who.role}</span>
          </span>
          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center bg-blue text-[10.5px] font-bold text-white">
            {who.initials}
          </span>
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full z-50 w-[268px] border border-line bg-surface shadow-menu"
          >
            <div className="border-b border-line-soft px-[14px] py-3">
              <div className="text-row font-semibold">{who.name}</div>
              <div className="mt-0.5 text-detail text-dim">{who.email ?? '—'}</div>
              {who.organization && (
                <div className="mt-0.5 text-detail text-dim">{who.organization}</div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2.5 border-b border-line-soft px-[14px] py-2.5 text-detail text-muted">
              <span>This device</span>
              <span className={chip(deviceTrusted ? 'green' : '')}>
                {deviceTrusted ? 'Trusted, caching' : 'Not trusted'}
              </span>
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="block w-full cursor-pointer border-0 bg-transparent px-[14px] py-[11px] text-left text-ui font-semibold text-ink hover:bg-row-hover"
            >
              Sign out
            </button>

            <p className="px-[14px] pb-3 text-chip leading-[1.5] text-dim">
              Signing out ends this session and clears anything cached on this device.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const Count = ({ children }) => <span className="text-chip text-faint">{children}</span>;

/**
 * Marks a tab whose contents are not real. Ochre for sample data, blue where
 * an endpoint exists but the screen is not wired to it — the second is a
 * morning's work, the first is a feature, and the colours say which.
 */
const Marker = ({ ready, children }) => (
  <span
    className={`whitespace-nowrap border px-1 py-px text-tag font-bold uppercase tracking-[0.04em] ${
      ready ? 'border-blue-border bg-blue-bg text-blue' : 'border-ochre-border bg-ochre-bg text-ochre'
    }`}
  >
    {children}
  </span>
);
