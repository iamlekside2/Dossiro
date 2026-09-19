import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../lib/api.js';
import { useSession } from '../session/SessionContext.jsx';

/**
 * Getting in.
 *
 * The design specifies enforced single sign-on. No identity provider is
 * connected yet, so the SSO buttons say so rather than pretending — and the
 * working path is a work-account password. When Entra or Okta is wired up, the
 * password form becomes the fallback it is meant to be.
 */

const DEVICE_FACTS = [
  ['Device', 'This browser'],
  ['Address', 'Your current network'],
  ['Posture', 'Not yet evaluated'],
  ['Last seen', 'New device'],
];

const NOTES = [
  {
    title: 'No password to steal',
    text: 'Authentication will happen at Microsoft or Okta. Dossiro only receives who you are and which groups you belong to.',
  },
  {
    title: 'Role, then drawer, then document',
    text: 'Your role sets the floor. A locked drawer or a document passcode can sit above it, and neither can be bypassed by an owner.',
  },
  {
    title: 'Offline is a decision, not a default',
    text: 'A device only caches records once you trust it, and revoking the device wipes that cache at its next connection.',
  },
  {
    title: 'Every attempt is recorded',
    text: 'Successful sign-ins, refusals, passcode failures and device changes all land in the same audit trail as document activity.',
  },
];

export default function SignIn() {
  const [step, setStep] = useState('credentials');

  return (
    <div className="signin">
      <div className="signin__main">
        {step === 'credentials' ? (
          <Credentials onSignedIn={() => setStep('device')} />
        ) : (
          <DeviceTrust />
        )}
      </div>

      <aside className="signin__rail">
        <div className="ins__label">What this protects</div>
        {NOTES.map((n) => (
          <div className="railnote" key={n.title}>
            <div className="railnote__title">{n.title}</div>
            <div className="railnote__text">{n.text}</div>
          </div>
        ))}
        <p className="screen__foot">
          Every sign-in, refusal and device change is written to the audit trail.
        </p>
      </aside>
    </div>
  );
}

function BrandLock() {
  return (
    <div className="brandlock">
      <img className="brandlock__logo" src="/brand/dossiro-logo.svg" alt="Dossiro" />
    </div>
  );
}

/* -- 1. Credentials -------------------------------------------------------- */

function Credentials({ onSignedIn }) {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  /** Populated only when the address exists in more than one tenant. */
  const [tenants, setTenants] = useState([]);
  const [organizationId, setOrganizationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Whose sign-in page is this?
   *
   * One deployment serves every customer, so the shared address belongs to
   * nobody in particular and the product name is the honest heading. Naming any
   * one tenant there is wrong for everyone else who signs in — an Acme clerk
   * should never be asked to sign in to another company's records.
   *
   * A tenant that has verified its own hostname does get its name, which is
   * what `GET /api/tenant/by-host` exists for. Unverified hostnames resolve to
   * nothing, so no one can point a domain at us and dress the page up as
   * somebody else's.
   */
  const [tenantName, setTenantName] = useState(null);
  /**
   * The tenant this hostname belongs to, when it belongs to one.
   *
   * On acme.dossiro.com the organisation is already settled before anyone
   * types anything, so asking which organisation they meant is asking a
   * question the address bar has answered. It also avoids an odder state: a
   * consultant who belongs to two tenants being offered the other one from
   * inside this tenant's branded sign-in page.
   *
   * The picker survives for hosts that identify no tenant — the shared
   * dossiro.com sign-in, and every development machine.
   */
  const [hostOrgId, setHostOrgId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.organization
      .byHost()
      .then((res) => {
        if (cancelled) return;
        if (res?.name) setTenantName(res.name);
        if (res?.organizationId) setHostOrgId(res.organizationId);
      })
      .catch(() => undefined); // Branding is a nicety; never block sign-in for it.
    return () => {
      cancelled = true;
    };
  }, []);

  const heading = tenantName ? `Sign in to ${tenantName}` : 'Sign in to Dossiro';

  /** Email is unique per organisation, so ask which one — unless the host said. */
  async function checkTenants() {
    if (!email.includes('@')) return;
    if (hostOrgId) return; // Already known; nothing to ask.
    try {
      const res = await api.auth.resolve(email);
      if (res.organizations.length > 1) {
        setTenants(res.organizations);
        setOrganizationId(res.organizations[0].id);
      } else {
        setTenants([]);
        setOrganizationId('');
      }
    } catch {
      // Resolution is a convenience; login still works without it.
    }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // The hostname wins when it names a tenant: on a tenant's own address,
      // this is the organisation being signed into, whatever else the account
      // belongs to.
      await signIn(email.trim(), password, hostOrgId || organizationId || undefined);
      onSignedIn();
    } catch (err) {
      if (err.body?.code === 'TENANT_AMBIGUOUS') {
        const res = await api.auth.resolve(email).catch(() => null);
        if (res?.organizations?.length) {
          setTenants(res.organizations);
          setOrganizationId(res.organizations[0].id);
          setError('This address belongs to more than one organisation. Choose which one.');
        } else {
          setError(err.message);
        }
      } else {
        setError(err.message);
      }
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card--sso">
      <BrandLock />
      <h1 className="screen__h1">{heading}</h1>
      <p className="screen__lede">Use your work account.</p>

      <form onSubmit={submit}>
        <label className="field">
          <span className="field__label">Work email</span>
          <input
            className="mfield"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={checkTenants}
            required
          />
        </label>

        {/* Only where the host settles nothing. On a tenant's own address the
            organisation is not a question the person should be asked. */}
        {!hostOrgId && tenants.length > 1 && (
          <label className="field">
            <span className="field__label">Organisation</span>
            <select
              className="mfield"
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {/* The operator console and an ordinary tenancy can have
                      almost the same name — "Calm Global Platform" beside
                      "Calm Global" — and they are entirely different places.
                      Which one you are entering is said, not implied. */}
                  {t.isPlatform ? `${t.name} — operator console` : `${t.name} — records`}
                </option>
              ))}
            </select>
            <span className="field__hint">
              This address exists in more than one organisation. The operator console administers
              tenants and holds no documents of its own.
            </span>
          </label>
        )}

        <label className="field">
          <span className="field__label">Password</span>
          <input
            className="mfield"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && (
          <div className="callout callout--red" style={{ margin: '0 0 14px' }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="signin__divider">
        <span>Single sign-on</span>
      </div>

      <button type="button" className="btn btn--block" disabled title="No identity provider is connected yet">
        Continue with Microsoft
      </button>
      <button
        type="button"
        className="btn btn--block"
        style={{ marginTop: 8 }}
        disabled
        title="No identity provider is connected yet"
      >
        Continue with Okta
      </button>
      <p className="screen__foot" style={{ marginTop: 10 }}>
        Single sign-on is not connected yet. Once Entra or Okta is configured it becomes the
        default and passwords are retired.
      </p>

      <p className="screen__foot" style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-soft)' }}>
        External party with a share link? You do not need an account — open the link you were sent
        and enter its passcode.
      </p>
    </div>
  );
}

/* -- 2. Device trust ------------------------------------------------------- */

function DeviceTrust() {
  const { user, organization, decideDevice } = useSession();
  const [trust, setTrust] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  function enter() {
    decideDevice(trust);
    // Operators have no repository to open.
    const home = user?.isPlatform ? '/platform' : (location.state?.from ?? '/');
    navigate(home, { replace: true });
  }

  return (
    <div className="card card--sso" style={{ maxWidth: 452 }}>
      <BrandLock />

      <div className="ins__label">Step 2 of 2</div>
      <h1 className="screen__h1">Trust this device?</h1>
      <p className="screen__lede">
        Signed in as <strong>{user?.email}</strong>, {user?.tier?.replace('_', ' ').toLowerCase()}
        {user?.organizationName ? ` at ${user.organizationName}` : organization ? ` at ${organization.name}` : ''}.
      </p>
      {user?.isPlatform && (
        <div className="callout callout--blue" style={{ marginBottom: 14 }}>
          This is the platform organisation. You will land in the operator console, not a
          repository — it holds no documents.
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border-soft)' }}>
        {DEVICE_FACTS.map(([k, v]) => (
          <div className="kvrow" key={k} style={{ borderBottom: '1px solid var(--border-faint)' }}>
            <span className="kv__k">{k}</span>
            <span style={{ fontSize: 13 }}>{v}</span>
          </div>
        ))}
      </div>

      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '20px 0 0', cursor: 'pointer' }}>
        <span
          style={{
            width: 20,
            height: 20,
            flex: '0 0 20px',
            marginTop: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            background: trust ? 'var(--blue)' : 'var(--surface)',
            border: `1px solid ${trust ? 'var(--blue)' : 'var(--border-strong)'}`,
            color: '#fff',
          }}
        >
          {trust ? '✓' : ''}
        </span>
        <input
          type="checkbox"
          checked={trust}
          onChange={(e) => setTrust(e.target.checked)}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
        />
        <span style={{ fontSize: 13.5, lineHeight: 1.55 }}>
          Keep records on this device for offline work. Cached files stay encrypted and are wiped if
          the device is revoked.
        </span>
      </label>

      {trust && (
        <div className="callout callout--ochre" style={{ marginTop: 12 }}>
          Confidential records will be limited to 30 days offline. Restricted records are never
          cached, on any device.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
        <button type="button" className="btn btn--primary" onClick={enter}>
          Open the repository
        </button>
      </div>

      <p className="screen__foot">
        This sign-in, the device fingerprint and your offline choice are written to the audit trail.
      </p>
    </div>
  );
}
