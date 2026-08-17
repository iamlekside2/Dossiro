import { useRef } from 'react';

/**
 * Six single-character boxes behaving as one field.
 *
 * Typing advances, Backspace on an empty box steps back, and a pasted code
 * fills every box at once — people paste these out of an email far more often
 * than they type them.
 */
export default function PasscodeInput({ value, onChange, length = 6, autoFocus = false, onComplete }) {
  const refs = useRef([]);

  const chars = Array.from({ length }, (_, i) => value[i] ?? '');

  function setAt(i, char) {
    const next = chars.slice();
    next[i] = char;
    const joined = next.join('').slice(0, length);
    onChange(joined);
    return joined;
  }

  function handleInput(i, raw) {
    const digit = raw.replace(/\D/g, '').slice(-1);
    if (!digit) return;
    const joined = setAt(i, digit);
    if (i < length - 1) refs.current[i + 1]?.focus();
    if (joined.length === length && !joined.includes('')) onComplete?.(joined);
  }

  function handleKeyDown(i, e) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (chars[i]) {
        setAt(i, '');
      } else if (i > 0) {
        setAt(i - 1, '');
        refs.current[i - 1]?.focus();
      }
    }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus();
  }

  function handlePaste(e) {
    const text = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, length);
    if (!text) return;
    e.preventDefault();
    onChange(text);
    const target = Math.min(text.length, length - 1);
    refs.current[target]?.focus();
    if (text.length === length) onComplete?.(text);
  }

  return (
    <div className="digits">
      {chars.map((c, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className={c ? 'is-filled' : undefined}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={c}
          autoFocus={autoFocus && i === 0}
          aria-label={`Digit ${i + 1} of ${length}`}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
        />
      ))}
    </div>
  );
}
