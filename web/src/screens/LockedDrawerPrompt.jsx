import { useState } from 'react';
import PasscodeInput from './PasscodeInput.jsx';

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
    <div className="drawerlock">
      <div className="card card--gate drawerlock__card">
        <div className="brandlock">
          <span className="brandlock__mark" aria-hidden="true" />
          <span className="brandlock__name">Arkin</span>
        </div>

        <h1 className="screen__h1">This drawer has its own passcode</h1>
        <p className="screen__lede">
          {drawer.label} is locked separately from your role. Enter the six-digit code held by{' '}
          {drawer.holder}.
        </p>

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
          <div className={`callout ${locked ? 'callout--red' : 'callout--ochre'}`} style={{ marginBottom: 14 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn--primary"
            style={{ flex: '1 1 auto', justifyContent: 'center' }}
            disabled={code.length < 6 || locked}
            onClick={() => submit()}
          >
            Unlock
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>

        <p className="screen__foot">
          A passcode overrides inherited role access, including for owners. Every attempt, successful
          or not, is written to the audit trail.
        </p>
      </div>
    </div>
  );
}
