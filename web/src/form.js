/**
 * Modal and form class strings, shared by the workbench's create dialogue and
 * the branch pane.
 *
 * Named `M` at the call sites because they read as `M.field`, `M.input`,
 * `M.actions` — short enough not to crowd the JSX, specific enough to say
 * where the value came from.
 *
 * The screens have their own components for the same shapes in
 * `screens/parts.jsx`. These are not those: the workbench's input is 38px on a
 * 12.5px label, the screens' is the same control at a different rhythm. The
 * two were separate classes before and remain separate here rather than being
 * merged into one component with a size prop nobody would remember to set.
 */
export const M = {
  /* -- Modal --------------------------------------------------------------

     Anchored to the top and scrolling behind, so a tall form on a short
     window can still be reached.
     ---------------------------------------------------------------------- */
  backdrop:
    'fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto '
    + 'bg-[rgba(26,29,33,0.45)] px-5 py-12',
  card: 'w-full max-w-[520px] border border-line-strong bg-surface p-[26px]',
  title: 'mb-1 text-[19px] font-bold tracking-[-0.02em]',
  lede: 'mb-[18px] max-w-[62ch] text-row leading-[1.6] text-muted',
  actions: 'mt-2 flex gap-2',

  /* -- Fields -------------------------------------------------------------- */
  field: 'mb-[14px] block',
  fieldLabel: 'mb-[5px] block text-detail font-semibold text-muted',
  fieldHint: 'mt-[5px] block text-chip text-dim',
  input: 'h-[38px] w-full border border-line-strong bg-surface px-[14px] text-body',

  /* -- A link handed over to be copied ------------------------------------- */
  link: 'mt-2 flex flex-wrap items-center gap-2.5 [&_code]:break-all [&_code]:border '
    + '[&_code]:border-line-strong [&_code]:bg-surface [&_code]:px-[7px] [&_code]:py-1 [&_code]:text-meta',
  linkbtn: 'cursor-pointer border-0 bg-transparent p-0 text-detail font-semibold text-blue hover:underline',

  /**
   * A pulsing dot for live activity. One of only two animations the handoff
   * permits, and the keyframes live in theme.css.
   */
  liveDot: 'h-[7px] w-[7px] rounded-full animate-[cv-pulse_1.7s_ease-in-out_infinite]',
};
