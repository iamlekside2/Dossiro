import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../lib/api.js';
import { useSession } from '../session/SessionContext.jsx';
import {
  BrandLock, Button, Callout, Card, Facts, Field, Foot, H1, Label, Lede, Rail, Select, TextInput,
} from './parts.jsx';

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
    <div className="allow-scroll flex min-h-screen bg-surface-3 max-[900px]:flex-col">
      <div className="flex min-w-0 flex-1 items-center justify-center px-6 py-12 max-[900px]:px-4 max-[900px]:py-8">
        {step === 'credentials' ? (
          <Credentials onSignedIn={() => setStep('device')} />
        ) : (
          <DeviceTrust />
        )}
      </div>

      <Rail
        title="What this protects"
        notes={NOTES}
        foot="Every sign-in, refusal and device change is written to the audit trail."
      />
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
    <Card width="sso">
      <BrandLock />
      <H1>{heading}</H1>
      <Lede>Use your work account.</Lede>

      <form onSubmit={submit}>
        <Field label="Work email">
          <TextInput
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={checkTenants}
            required
          />
        </Field>

        {/* Only where the host settles nothing. On a tenant's own address the
            organisation is not a question the person should be asked. */}
        {!hostOrgId && tenants.length > 1 && (
          <Field
            label="Organisation"
            hint="This address exists in more than one organisation. The operator console administers tenants and holds no documents of its own."
          >
            <Select
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
            </Select>
          </Field>
        )}

        <Field label="Password">
          <TextInput
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>

        {error && <Callout tone="red" className="mb-[14px]">{error}</Callout>}

        <Button type="submit" tone="primary" block disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {/* Rules either side of the word, drawn with flex rather than a
          pseudo-element so there is nothing hidden in a stylesheet. */}
      <div className="my-[22px] mb-[14px] flex items-center gap-2.5 text-label font-bold uppercase tracking-[0.07em] text-faint">
        <span className="h-px flex-1 bg-line-soft" />
        <span>Single sign-on</span>
        <span className="h-px flex-1 bg-line-soft" />
      </div>

      <Button block disabled title="No identity provider is connected yet">
        Continue with Microsoft
      </Button>
      <Button block disabled className="mt-2" title="No identity provider is connected yet">
        Continue with Okta
      </Button>
      <Foot className="mt-2.5">
        Single sign-on is not connected yet. Once Entra or Okta is configured it becomes the
        default and passwords are retired.
      </Foot>

      <Foot className="mt-[18px] border-t border-line-soft pt-4">
        External party with a share link? You do not need an account — open the link you were sent
        and enter its passcode.
      </Foot>
    </Card>
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
    <Card width="sso" className="max-w-[452px]">
      <BrandLock />

      <Label>Step 2 of 2</Label>
      <H1>Trust this device?</H1>
      <Lede>
        Signed in as <strong>{user?.email}</strong>, {user?.tier?.replace('_', ' ').toLowerCase()}
        {user?.organizationName ? ` at ${user.organizationName}` : organization ? ` at ${organization.name}` : ''}.
      </Lede>
      {user?.isPlatform && (
        <Callout tone="blue" className="mb-[14px]">
          This is the platform organisation. You will land in the operator console, not a
          repository — it holds no documents.
        </Callout>
      )}

      <Facts rows={DEVICE_FACTS} />

      {/* The real checkbox is visually hidden rather than removed, so the
          label, keyboard and screen readers all still work; the square beside
          it is what gets drawn. */}
      <label className="mt-5 flex cursor-pointer items-start gap-2.5">
        <span
          className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center border text-meta text-white ${
            trust ? 'border-blue bg-blue' : 'border-line-strong bg-surface'
          }`}
        >
          {trust ? '✓' : ''}
        </span>
        <input
          type="checkbox"
          checked={trust}
          onChange={(e) => setTrust(e.target.checked)}
          className="sr-only"
        />
        <span className="text-row leading-[1.55]">
          Keep records on this device for offline work. Cached files stay encrypted and are wiped if
          the device is revoked.
        </span>
      </label>

      {trust && (
        <Callout tone="ochre" className="mt-3">
          Confidential records will be limited to 30 days offline. Restricted records are never
          cached, on any device.
        </Callout>
      )}

      <div className="mt-[22px] flex gap-2">
        <Button tone="primary" onClick={enter}>
          {user?.isPlatform ? 'Open the operator console' : 'Open the repository'}
        </Button>
      </div>

      <Foot>
        This sign-in, the device fingerprint and your offline choice are written to the audit trail.
      </Foot>
    </Card>
  );
}
