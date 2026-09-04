import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api.js';
import { useSession } from '../session/SessionContext.jsx';

/**
 * Where an invitation link lands.
 *
 * The only route into the product for anyone who was not seeded: there is no
 * self-serve signup, so every internal user arrives here.
 *
 * On success it signs the person straight in with the password they just set,
 * rather than bouncing them to a login form to type it a second time.
 */
export default function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { signIn } = useSession();

  const [invite, setInvite] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) {
      setLoadError('This link is missing its invitation code.');
      return undefined;
    }
    let cancelled = false;
    api.invitations
      .describe(token)
      .then((res) => !cancelled && setInvite(res))
      .catch((err) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const tooShort = password.length > 0 && password.length < 12;
  const mismatch = confirm.length > 0 && password !== confirm;
  const ready = password.length >= 12 && password === confirm;

  async function submit(e) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await api.invitations.accept(token, password);
      // Straight in — they have just proved who they are and chosen a password.
      await signIn(invite.email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <Frame>
        <h1 className="screen__h1">This invitation is not valid</h1>
        <p className="screen__lede">{loadError}</p>
        <p className="screen__foot">
          Invitations expire after 14 days and can only be used once. Ask whoever invited you to
          send a new one.
        </p>
      </Frame>
    );
  }

  if (!invite) {
    return (
      <Frame>
        <p className="screen__lede">Checking your invitation…</p>
      </Frame>
    );
  }

  return (
    <Frame>
      <h1 className="screen__h1">Join {invite.organizationName}</h1>
      <p className="screen__lede">
        Choose a password for <strong>{invite.email}</strong>. You will use it with your email
        address to sign in.
      </p>

      <form onSubmit={submit}>
        <label className="field">
          <span className="field__label">Password</span>
          <input
            className="mfield"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
          <span className="field__hint" style={{ color: tooShort ? 'var(--red)' : undefined }}>
            {tooShort ? `${12 - password.length} more characters needed` : 'At least 12 characters'}
          </span>
        </label>

        <label className="field">
          <span className="field__label">Confirm password</span>
          <input
            className="mfield"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          {mismatch && (
            <span className="field__hint" style={{ color: 'var(--red)' }}>
              These do not match
            </span>
          )}
        </label>

        {error && (
          <div className="callout callout--red" style={{ margin: '0 0 14px' }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn btn--primary btn--block" disabled={!ready || busy}>
          {busy ? 'Setting up…' : 'Set password and continue'}
        </button>
      </form>

      <p className="screen__foot">
        This invitation works once. Your password is stored only as a hash — nobody at
        {' '}{invite.organizationName} or Calm Global can read it.
      </p>
    </Frame>
  );
}

function Frame({ children }) {
  return (
    <div className="sheetpage">
      <div className="card card--gate">
        <div className="brandlock">
          <img className="brandlock__logo" src="/brand/dossiro-logo.svg" alt="Dossiro" />
        </div>
        {children}
      </div>
    </div>
  );
}
