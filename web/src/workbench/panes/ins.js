/**
 * The inspector body's shared class strings.
 *
 * These were the last six classes in a stylesheet. They are exported as
 * strings rather than wrapped in components on purpose: they appear about a
 * hundred and thirty times across seven pane files, on divs, spans and
 * paragraphs alike, and are frequently combined with a one-off utility at the
 * call site. Turning each into a component would mean rewriting every one of
 * those sites and inventing a component per element type, for no gain over
 * naming the string once.
 *
 * A pane that wants a section with extra spacing writes
 * `className={`${ins.section} pt-0`}` and gets exactly what it asks for.
 */
export const ins = {
  /** A padded block with no divider — used where the pane is one unit. */
  pane: 'px-4 py-[14px]',

  /** The standard divided block. Most of the inspector is a stack of these. */
  section: 'border-b border-line-soft px-4 py-[14px]',

  /** Small caps heading above a block. */
  label: 'mb-2 text-label font-bold uppercase tracking-[0.07em] text-soft',

  /** The same, in blue — used where the block is AI or system output. */
  labelBlue: 'mb-2 text-label font-bold uppercase tracking-[0.07em] text-blue',

  /**
   * Explanatory small print. Carries real policy in most places, which is why
   * it is a defined thing rather than an ad-hoc span.
   */
  note: 'mt-2.5 text-chip leading-[1.55] text-dim',

  /** A whole section that is nothing but a note. */
  noteSection: 'border-b border-line-soft px-4 py-[14px] mt-2.5 text-chip leading-[1.55] text-dim',

  /** Key on the left, value on the right, sharing a baseline. */
  kvrow: 'flex items-baseline justify-between gap-3 py-[5px]',
  k: 'text-detail text-dim',

  /** A confidence percentage beside an extracted value. */
  conf: 'text-chip font-semibold text-blue',
};
