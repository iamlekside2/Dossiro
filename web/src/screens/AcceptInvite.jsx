import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api.js';
import { useSession } from '../session/SessionContext.jsx';
import {
  BrandLock, Button, Callout, Card, Field, Foot, H1, Lede, SheetPage, TextInput,
} from './parts.jsx';

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
        <H1>This invitation is not valid</H1>
        <Lede>{loadError}</Lede>
        <Foot>
          Invitations expire after 14 days and can only be used once. Ask whoever invited you to
          send a new one.
        </Foot>
      </Frame>
    );
  }

  if (!invite) {
    return (
      <Frame>
        <Lede>Checking your invitation…</Lede>
      </Frame>
    );
  }

  return (
    <Frame>
      <H1>Join {invite.organizationName}</H1>
      <Lede>
        Choose a password for <strong>{invite.email}</strong>. You will use it with your email
        address to sign in.
      </Lede>

      <form onSubmit={submit}>
        <Field
          label="Password"
          hintTone={tooShort ? 'red' : 'dim'}
          hint={tooShort ? `${12 - password.length} more characters needed` : 'At least 12 characters'}
        >
          <TextInput
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </Field>

        <Field
          label="Confirm password"
          hintTone="red"
          hint={mismatch ? 'These do not match' : null}
        >
          <TextInput
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </Field>

        {error && <Callout tone="red" className="mb-[14px]">{error}</Callout>}

        <Button type="submit" tone="primary" block disabled={!ready || busy}>
          {busy ? 'Setting up…' : 'Set password and continue'}
        </Button>
      </form>

      {/* Operator-neutral, and it was also overclaiming: the people who run the
          platform cannot read a tenant's documents either, so singling them out
          as a party who merely cannot read passwords understated it. */}
      <Foot>
        This invitation works once. Your password is stored only as a hash — nobody can
        read it, not your administrator and not the people who run this service.
      </Foot>
    </Frame>
  );
}

function Frame({ children }) {
  return (
    <SheetPage>
      <Card width="gate">
        <BrandLock />
        {children}
      </Card>
    </SheetPage>
  );
}
