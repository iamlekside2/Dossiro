/**
 * Chip, callout and button — the three things used in both the workbench and
 * the screens, and the last of the old stylesheet.
 *
 * Functions returning class strings rather than components, for the same
 * reason as the inspector's `ins`: these appear on buttons, spans, divs and
 * anchors, and half the call sites pick their tone from a variable. A function
 * takes that variable directly; a component would need the same string
 * threaded through a prop anyway.
 */

/* -- Chip ------------------------------------------------------------------

   `w-fit` and `justify-self-start` are load-bearing: without them a chip in a
   grid cell stretches to fill the column, which is how a one-word status ends
   up as a bar across the row.
   -------------------------------------------------------------------------- */

const CHIP_BASE =
  'inline-flex h-[18px] w-fit flex-none items-center justify-self-start whitespace-nowrap '
  + 'border px-1.5 text-label font-semibold';

const CHIP_TONE = {
  neutral: 'border-neutral-border bg-neutral-bg text-muted',
  green: 'border-green-border bg-green-bg text-green',
  ochre: 'border-ochre-border bg-ochre-bg text-ochre',
  red: 'border-red-border bg-red-bg text-red',
  blue: 'border-blue-border bg-blue-bg text-blue',
};

export function chip(tone, extra = '') {
  return `${CHIP_BASE} ${CHIP_TONE[tone] ?? CHIP_TONE.neutral} ${extra}`.trim();
}

/* -- Callout --------------------------------------------------------------- */

const CALLOUT_BASE = 'border px-3 py-2.5 text-detail leading-[1.55]';

const CALLOUT_TONE = {
  blue: 'border-blue-border bg-blue-bg text-muted',
  green: 'border-green-border bg-green-bg text-green',
  ochre: 'border-ochre-border bg-ochre-bg text-ochre',
  red: 'border-red-border bg-red-bg text-red',
};

export function callout(tone, extra = '') {
  return `${CALLOUT_BASE} ${CALLOUT_TONE[tone] ?? CALLOUT_TONE.blue} ${extra}`.trim();
}

/* -- Button ----------------------------------------------------------------

   Danger reads as danger at rest, not only under the cursor — the colour is
   the warning, and a warning that waits for a hover has already failed.
   -------------------------------------------------------------------------- */

const BTN_BASE =
  'inline-flex h-[30px] cursor-pointer items-center justify-center whitespace-nowrap border '
  + 'px-[14px] text-ui font-semibold disabled:cursor-not-allowed disabled:border-line-strong '
  + 'disabled:text-ghost';

const BTN_TONE = {
  plain: 'border-line-strong bg-surface text-ink hover:border-ink',
  primary: 'border-blue bg-blue text-white hover:border-blue-hover hover:bg-blue-hover',
  danger: 'border-red bg-surface text-red',
};

export function btn(tone, extra = '') {
  return `${BTN_BASE} ${BTN_TONE[tone] ?? BTN_TONE.plain} ${extra}`.trim();
}
