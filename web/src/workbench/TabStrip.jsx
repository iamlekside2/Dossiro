import { useEffect, useMemo, useRef, useState } from 'react';
import { CURRENT_USER } from '../data/areas.js';
import { AREA_STATE, HIDE_UNBUILT, READY, UNBUILT } from '../data/buildState.js';
import { useSession } from '../session/SessionContext.jsx';

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

export default function TabStrip({ tabs, active, onSelect }) {
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
    <div className="tabstrip">
      <div className="tabstrip__brand">
        <img className="tabstrip__logo" src="/brand/dossiro-logo.svg" alt="Dossiro" />
      </div>

      <div className="tabstrip__tabs" role="tablist">
        {shown.map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={id === active}
            className={`tab${id === active ? ' is-active' : ''}`}
            onClick={() => onSelect(id)}
          >
            <span>{label}</span>
            {/* A count on an unbuilt area is fiction, so show the state instead. */}
            {AREA_STATE[id]?.state === UNBUILT ? (
              <span className="tab__marker">Sample</span>
            ) : AREA_STATE[id]?.state === READY ? (
              <span className="tab__marker tab__marker--ready">Not wired</span>
            ) : count ? (
              <span className="tab__count">{count}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="tabstrip__spacer" />

      <div className="tabstrip__userWrap" ref={wrapRef}>
        <button
          type="button"
          className="tabstrip__user"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span className="tabstrip__userText">
            <span className="tabstrip__userName">{who.name}</span>
            <span className="tabstrip__userRole">{who.role}</span>
          </span>
          <span className="tabstrip__avatar">{who.initials}</span>
        </button>

        {menuOpen && (
          <div className="usermenu" role="menu">
            <div className="usermenu__head">
              <div className="usermenu__name">{who.name}</div>
              <div className="usermenu__email">{who.email ?? '—'}</div>
              {who.organization && <div className="usermenu__email">{who.organization}</div>}
            </div>

            <div className="usermenu__row">
              <span>This device</span>
              <span className={`chip ${deviceTrusted ? 'chip--green' : ''}`}>
                {deviceTrusted ? 'Trusted, caching' : 'Not trusted'}
              </span>
            </div>

            <button type="button" role="menuitem" className="usermenu__item" onClick={signOut}>
              Sign out
            </button>

            <p className="usermenu__note">
              Signing out ends this session and clears anything cached on this device.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
