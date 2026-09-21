/**
 * The furniture shared by the screens outside the workbench — sign-in, share
 * links, invitations, the operator console and the locked-drawer prompt.
 *
 * These were classes in screens.css. As components they carry the same
 * definitions to the same places, with the advantage that a screen importing
 * `Card` cannot accidentally get a card that is 404px wide because somebody
 * wrote `card--sso` out of habit.
 *
 * Sizes are the handoff's: cards at 404/432/560 depending on what they hold,
 * a 21px screen heading, 11.5px footnotes.
 */

/* -- Page and card -------------------------------------------------------- */

/** A centred sheet on the desk background. Scrolls, unlike the workbench. */
export function SheetPage({ children }) {
  return (
    <div className="allow-scroll flex min-h-screen items-start justify-center bg-surface-3 px-6 py-14">
      {children}
    </div>
  );
}

const CARD_WIDTH = {
  sso: 'max-w-[404px]',   // sign-in
  gate: 'max-w-[432px]',  // passcode gate
  sign: 'max-w-[560px]',  // signing
};

export function Card({ width = 'sso', className = '', children }) {
  return (
    <div className={`w-full border border-line bg-surface p-8 ${CARD_WIDTH[width]} ${className}`}>
      {children}
    </div>
  );
}

export function BrandLock() {
  return (
    <div className="mb-[26px] flex items-center gap-[9px]">
      <img className="block h-[30px] w-auto" src="/brand/dossiro-logo.svg" alt="Dossiro" />
    </div>
  );
}

/* -- Type ----------------------------------------------------------------- */

export const H1 = ({ children }) => (
  <h1 className="mb-2 text-[21px] font-bold tracking-[-0.02em]">{children}</h1>
);

export const Lede = ({ children }) => (
  <p className="mb-[22px] text-body leading-[1.6] text-muted">{children}</p>
);

export const Foot = ({ className = '', children }) => (
  <p className={`mt-4 text-chip leading-[1.55] text-dim ${className}`}>{children}</p>
);

export const Label = ({ children }) => (
  <div className="text-label font-bold uppercase tracking-[0.07em] text-faint">{children}</div>
);

/* -- Fields --------------------------------------------------------------- */

/**
 * `hintTone` turns the hint red for a validation message. The hint slot is
 * reused rather than a separate error line appearing below it, so the field
 * does not change height when a password is too short — a form that grows as
 * you type it is a form you lose your place in.
 */
export function Field({ label, hint, hintTone = 'dim', children }) {
  return (
    <label className="mb-[14px] block">
      <span className="mb-[5px] block text-detail font-semibold text-muted">{label}</span>
      {children}
      {hint ? (
        <span className={`mt-[5px] block text-chip ${hintTone === 'red' ? 'text-red' : 'text-dim'}`}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

const INPUT = 'h-[38px] w-full border border-line-strong bg-surface px-[14px] text-body';

export const TextInput = ({ className = '', ...props }) => (
  <input {...props} className={`${INPUT} ${className}`} />
);

/** Native chevron removed and redrawn, because the platform's differs per OS. */
export const Select = ({ children, ...props }) => (
  <select
    {...props}
    className={`${INPUT} appearance-none bg-[length:5px_5px,5px_5px] bg-[position:calc(100%-17px)_17px,calc(100%-12px)_17px] bg-no-repeat pr-8`}
    style={{
      backgroundImage:
        'linear-gradient(45deg, transparent 50%, var(--color-dim) 50%),'
        + 'linear-gradient(135deg, var(--color-dim) 50%, transparent 50%)',
    }}
  >
    {children}
  </select>
);

/* -- Buttons --------------------------------------------------------------

   `block` is the full-width 42px form button; the default is the 30px one
   used in toolbars and dialogues.
   ------------------------------------------------------------------------- */

const BTN_BASE = 'inline-flex items-center justify-center whitespace-nowrap border font-semibold '
  + 'cursor-pointer disabled:cursor-not-allowed disabled:text-ghost';

const BTN_TONE = {
  primary: 'border-blue bg-blue text-white hover:border-blue-hover hover:bg-blue-hover '
    + 'disabled:border-line-strong disabled:bg-surface',
  plain: 'border-line-strong bg-surface text-ink hover:border-ink',
  // Reads as danger at rest, not only under the cursor — the colour is the
  // warning, and a warning that waits for a hover has already failed.
  danger: 'border-red bg-surface text-red',
};

export function Button({ tone = 'plain', block = false, className = '', ...props }) {
  const size = block ? 'h-[42px] w-full px-[14px] text-body' : 'h-[30px] px-[14px] text-ui';
  return <button {...props} className={`${BTN_BASE} ${size} ${BTN_TONE[tone]} ${className}`} />;
}

/* -- Callout -------------------------------------------------------------- */

const TONE = {
  blue: 'border-blue-border bg-blue-bg text-muted',
  green: 'border-green-border bg-green-bg text-green',
  ochre: 'border-ochre-border bg-ochre-bg text-ochre',
  red: 'border-red-border bg-red-bg text-red',
};

export function Callout({ tone = 'blue', className = '', children }) {
  return (
    <div className={`border px-3 py-2.5 text-detail leading-[1.55] ${TONE[tone]} ${className}`}>
      {children}
    </div>
  );
}

/* -- Explanation rail ------------------------------------------------------

   Hidden below 900px rather than squeezed. These notes are policy, and policy
   at four words a line is not readable.
   ------------------------------------------------------------------------- */

export function Rail({ title, notes, foot }) {
  return (
    <aside className="w-[352px] shrink-0 border-l border-line bg-surface-2 px-8 py-10 max-[900px]:hidden">
      <Label>{title}</Label>
      {notes.map((n) => (
        <div className="border-b border-line-soft py-[14px]" key={n.title}>
          <div className="mb-1 text-ui font-semibold">{n.title}</div>
          <div className="text-detail leading-[1.6] text-muted">{n.text}</div>
        </div>
      ))}
      {foot ? <Foot>{foot}</Foot> : null}
    </aside>
  );
}

/* -- Terms with coloured dots ---------------------------------------------

   Used before a share link is opened, to state plainly what the recipient can
   and cannot do. The dot carries the meaning: green allowed, red refused,
   blue merely a fact.
   ------------------------------------------------------------------------- */

const DOT = { green: 'bg-green', red: 'bg-red', blue: 'bg-blue', ochre: 'bg-ochre' };

export function Terms({ items }) {
  return (
    <ul className="mt-[22px]">
      {items.map(([tone, text]) => (
        <li className="flex gap-2.5 py-1.5 text-ui leading-[1.5] text-ink-2" key={text}>
          <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 ${DOT[tone]}`} />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

/* -- Modal -----------------------------------------------------------------

   Anchored to the top rather than centred, and the backdrop scrolls, so a tall
   form on a short window can still be reached.
   -------------------------------------------------------------------------- */

export function Modal({ label, onSubmit, children }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[rgba(26,29,33,0.45)] px-5 py-12"
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-[520px] border border-line-strong bg-surface p-[26px]"
      >
        {children}
      </form>
    </div>
  );
}

export const ModalTitle = ({ children }) => (
  <h2 className="mb-1 text-[19px] font-bold tracking-[-0.02em]">{children}</h2>
);

export const ModalLede = ({ className = 'mb-[18px]', children }) => (
  <p className={`max-w-[62ch] text-row leading-[1.6] text-muted ${className}`}>{children}</p>
);

/** Two fields side by side, stacking on a narrow window. */
export const ModalRow = ({ children }) => (
  <div className="grid grid-cols-2 gap-[14px] max-[560px]:grid-cols-1">{children}</div>
);

export const ModalActions = ({ children }) => (
  <div className="mt-2 flex gap-2">{children}</div>
);

/* -- Key/value rows -------------------------------------------------------- */

export function Facts({ rows, className = '' }) {
  return (
    <div className={`border-t border-line-soft ${className}`}>
      {rows.map(([k, v]) => (
        <div
          className="flex items-baseline justify-between gap-3 border-b border-line-faint py-2"
          key={k}
        >
          <span className="text-detail text-dim">{k}</span>
          <span className="text-ui">{v}</span>
        </div>
      ))}
    </div>
  );
}
