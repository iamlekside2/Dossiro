import { useState } from 'react';
import PasscodeInput from './PasscodeInput.jsx';
import { BrandLock, Button, Callout, Card, Foot, H1, Lede } from './parts.jsx';

/**
 * Raised when someone opens a drawer that carries its own passcode.
 *
 * This is deliberately not a sign-in step: role access and drawer access are
 * separate layers, and the passcode is asked for at the moment it is needed.
 * A passcode sits *above* role, so holding the drawer's role — or even owning
 * it — does not skip this.
 */
export default function LockedDrawerPrompt({ drawer, onUnlock, onCancel }) {
  const [code, setCode] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [error, setError] = useState(null);

  const locked = attemptsLeft <= 0;

  function submit(value = code) {
    if (locked) return;
    if (value === drawer.code) {
      onUnlock();
      return;
    }
    const left = attemptsLeft - 1;
    setAttemptsLeft(left);
    setCode('');
    setError(
      left > 0
        ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} remaining.`
        : 'This drawer is now locked. The records manager has been notified.',
    );
  }

  return (
    // Raised over the list pane rather than replacing it: the drawer you are
    // trying to open stays visible behind, so it is clear what is being asked
    // for. The veil is the desk colour at 92%, not a generic black scrim.
    <div className="absolute inset-0 z-30 flex items-start justify-center bg-[rgba(233,234,236,0.92)] px-6 py-12">
      <Card width="gate" className="border-line-strong">
        <BrandLock />

        <H1>This drawer has its own passcode</H1>
        <Lede>
          {drawer.label} is locked separately from your role. Enter the six-digit code held by{' '}
          {drawer.holder}.
        </Lede>

        <PasscodeInput
          value={code}
          onChange={(v) => {
            setCode(v);
            setError(null);
          }}
          autoFocus
          onComplete={submit}
        />

        {error && (
          <Callout tone={locked ? 'red' : 'ochre'} className="mb-[14px]">
            {error}
          </Callout>
        )}

        <div className="flex gap-2">
          <Button
            tone="primary"
            className="flex-1"
            disabled={code.length < 6 || locked}
            onClick={() => submit()}
          >
            Unlock
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </div>

        <Foot>
          A passcode overrides inherited role access, including for owners. Every attempt, successful
          or not, is written to the audit trail.
        </Foot>
      </Card>
    </div>
  );
}
