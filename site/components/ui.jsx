/**
 * The marketing site's layout and text primitives.
 *
 * These were the `.wrap` / `.section` / `.h-hero` / `.btn` classes in
 * globals.css. As components the page files read as structure rather than as
 * a list of class names, and a section cannot accidentally get tight padding
 * because somebody typed `section--tight` out of habit.
 *
 * `eyebrow` and `lede` stay as CSS classes: a navy band restyles both, and
 * expressing that as components would mean threading a `dark` prop through
 * every heading on the page.
 */

/* -- Layout ---------------------------------------------------------------- */

/** The page's outer bound, with fluid gutters. */
export const Wrap = ({ className = '', children }) => (
  <div className={`mx-auto w-full max-w-wrap px-[clamp(1.25rem,5vw,3rem)] ${className}`}>
    {children}
  </div>
);

/**
 * Vertical rhythm. `tight` is for sections that sit against another rather
 * than standing alone — two full-height bands in a row read as a gap.
 */
export const Section = ({ tight = false, className = '', children, ...props }) => (
  <section
    {...props}
    className={`${
      tight ? 'py-[clamp(2.5rem,6vw,4.5rem)]' : 'py-[clamp(3.5rem,9vw,7rem)]'
    } ${className}`}
  >
    {children}
  </section>
);

/** A pale band, for separating sections without a rule. */
export const BandTint = ({ className = '', children }) => (
  <div className={`bg-surface-2 ${className}`}>{children}</div>
);

/**
 * The navy band. A plain div carrying `band-dark`, which is the one place the
 * site uses a contextual CSS class — see globals.css.
 */
export const BandDark = ({ className = '', children }) => (
  <div className={`band-dark ${className}`}>{children}</div>
);

/* -- Headings --------------------------------------------------------------

   Fluid sizes, so a headline is never orphaned at an awkward width. Serif by
   inheritance from the base layer rather than by repeating font-serif here.
   -------------------------------------------------------------------------- */

export const Hero = ({ className = '', children }) => (
  <h1 className={`text-hero ${className}`}>{children}</h1>
);

export const H2 = ({ className = '', children }) => (
  <h2 className={`text-section ${className}`}>{children}</h2>
);

export const H3 = ({ className = '', children }) => (
  <h3 className={`text-sub ${className}`}>{children}</h3>
);

/* -- Buttons ---------------------------------------------------------------

   Four skins, because a button on navy cannot be the same button as one on
   paper. The arrow nudges on hover, which is the site's only motion besides
   the page-fan graphic.
   -------------------------------------------------------------------------- */

const BTN =
  'group inline-flex cursor-pointer items-center gap-2 whitespace-nowrap border px-[1.35rem] py-[0.85rem] '
  + 'font-sans text-[0.9375rem] font-semibold leading-none transition-[background-color,border-color,color] duration-150';

const SKIN = {
  primary: 'border-transparent bg-blue text-white hover:bg-blue-hover',
  ghost: 'border-line-strong bg-transparent text-ink hover:border-ink',
  onDark: 'border-transparent bg-white text-blue-ink hover:bg-blue-tint',
  ghostDark: 'border-on-dark-line bg-transparent text-on-dark hover:border-on-dark',
};

export function Button({ as: Tag = 'button', variant = 'primary', className = '', children, ...props }) {
  return (
    <Tag {...props} className={`${BTN} ${SKIN[variant]} ${className}`}>
      {children}
    </Tag>
  );
}

/** A link that reads as one, with the same nudging arrow. */
export function TextLink({ as: Tag = 'a', className = '', children, ...props }) {
  return (
    <Tag
      {...props}
      className={`group inline-flex items-center gap-[0.4rem] text-[0.9375rem] font-semibold text-blue hover:text-blue-hover ${className}`}
    >
      {children}
    </Tag>
  );
}

/** Nudges right inside a hovered Button or TextLink. */
export const Arrow = () => (
  <span className="transition-transform duration-150 group-hover:translate-x-[3px]" aria-hidden="true">
    →
  </span>
);

/* -- Inner-page patterns ---------------------------------------------------

   Every page except the home page opens with the same compact hero and closes
   with the same call to action. Both were classes used five times each.
   -------------------------------------------------------------------------- */

/** Compact, left-aligned page hero on white, over a hairline. */
export function PageHero({ eyebrow, title, lede }) {
  return (
    <div className="border-b border-line bg-surface">
      <Wrap>
        <div className="max-w-[52rem] py-[clamp(3rem,6vw,5rem)]">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1 className="mb-5 text-[clamp(2.25rem,5vw,3.5rem)]">{title}</h1>
          {lede ? <p className="lede text-[clamp(1.125rem,1.7vw,1.375rem)]">{lede}</p> : null}
        </div>
      </Wrap>
    </div>
  );
}

/** A section heading block: eyebrow, title, optional lede. */
export function SectionHead({ eyebrow, title, lede, className = '' }) {
  return (
    <div className={className}>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <H2>{title}</H2>
      {lede ? <p className="lede mt-5">{lede}</p> : null}
    </div>
  );
}

/** The navy closing band that every page ends on. */
export function CallToAction({ title, lede, children }) {
  return (
    <BandDark>
      <Wrap>
        <Section className="text-center">
          <H2 className="mx-auto max-w-[36rem]">{title}</H2>
          {lede ? <p className="lede mx-auto mt-5 text-center">{lede}</p> : null}
          <div className="mt-8 flex flex-wrap justify-center gap-3">{children}</div>
        </Section>
      </Wrap>
    </BandDark>
  );
}

/**
 * A reading column. Paragraphs take the softer ink and space themselves, so
 * prose does not need a class on every child.
 */
export const Prose = ({ className = '', children }) => (
  <div
    className={`max-w-measure [&>*+*]:mt-[1.15rem] [&_h3]:mt-10 [&_h3]:text-step-2 [&_p]:text-ink-2 ${className}`}
  >
    {children}
  </div>
);

/** Honest framing about what is and is not built yet. */
export const StatusNote = ({ children }) => (
  <div className="max-w-[48rem] border border-blue-line bg-blue-tint px-[1.35rem] py-[1.1rem] text-[0.9375rem] text-blue-ink">
    {children}
  </div>
);

/**
 * A hairline grid. The 1px gap over a line-coloured ground is what draws the
 * dividers, so there are no borders to collapse or double up.
 */
export const CardGrid = ({ cols = 3, className = '', children }) => (
  <div
    className={`grid gap-px border border-line bg-line max-[820px]:grid-cols-1 ${
      cols === 2 ? 'grid-cols-2' : 'grid-cols-3'
    } ${className}`}
  >
    {children}
  </div>
);

export const Card = ({ title, children }) => (
  <div className="bg-surface p-[clamp(1.5rem,2.5vw,2rem)]">
    <h3 className="mb-[0.6rem] text-xl">{title}</h3>
    <p className="text-[0.9375rem] leading-[1.55] text-muted">{children}</p>
  </div>
);

/** Numbered steps. The rule under the number is the only ornament. */
export const Steps = ({ className = '', children }) => (
  <div className={`mt-10 grid grid-cols-3 gap-6 max-[820px]:grid-cols-1 ${className}`}>
    {children}
  </div>
);

export const Step = ({ n, title, children }) => (
  <div>
    <span className="mb-4 inline-block border-b-2 border-blue pb-3 font-sans text-[0.8125rem] font-bold tabular-nums text-blue">
      {n}
    </span>
    <h3 className="mb-2 text-lg">{title}</h3>
    <p className="text-[0.9375rem] text-muted">{children}</p>
  </div>
);

/* -- Capability rows -------------------------------------------------------

   A label and title on the left, the explanation on the right. Used for the
   product's capabilities and the three deployment models. Stacks below 820px,
   where two columns leave neither enough room.
   -------------------------------------------------------------------------- */

export const Capabilities = ({ children }) => (
  <div className="flex flex-col border-t border-line">{children}</div>
);

export function Capability({ label, title, children }) {
  return (
    <article className="grid grid-cols-[0.8fr_1.2fr] items-start gap-[clamp(1.5rem,4vw,4rem)] border-b border-line py-[clamp(2rem,4vw,3rem)] max-[820px]:grid-cols-1 max-[820px]:gap-4">
      <div>
        <div className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.12em] text-blue">
          {label}
        </div>
        <h2 className="text-[clamp(1.375rem,2.2vw,1.875rem)]">{title}</h2>
      </div>
      <div className="text-ink-2 [&>p+p]:mt-[0.85rem]">{children}</div>
    </article>
  );
}

/** The closing line of a capability: who it suits, in the softer ink. */
export const BestFor = ({ children }) => (
  <p className="text-[0.9375rem] text-muted">{children}</p>
);

/** A square-bulleted list inside a capability. */
export const Ticks = ({ items }) => (
  <ul className="mt-[0.85rem] list-none p-0">
    {items.map((t) => (
      <li
        key={t}
        className="relative mt-2 pl-[1.4rem] text-[0.9375rem] text-muted before:absolute before:left-0 before:top-[0.55em] before:h-2 before:w-2 before:bg-blue before:content-['']"
      >
        {t}
      </li>
    ))}
  </ul>
);

/* -- Comparison table ------------------------------------------------------ */

export const CompareWrap = ({ children }) => (
  <div className="mt-10 overflow-x-auto">
    <table className="w-full border-collapse text-[0.9375rem]">{children}</table>
  </div>
);

export const Th = ({ children }) => (
  <th
    scope="col"
    className="border-b border-line-strong bg-surface-2 px-4 py-[0.9rem] text-left align-top font-sans text-xs font-bold uppercase tracking-[0.08em] text-muted"
  >
    {children}
  </th>
);

export const Td = ({ first, tone, children }) => (
  <td
    className={`border-b border-line px-4 py-[0.9rem] text-left align-top ${
      first ? 'font-semibold text-ink' : ''
    } ${tone === 'yes' ? 'font-bold text-blue' : ''} ${tone === 'no' ? 'text-faint' : ''}`}
  >
    {children}
  </td>
);

/* -- Form fields ----------------------------------------------------------- */

export const Field = ({ label, children }) => (
  <label className="mb-[1.1rem] flex flex-col">
    <span className="mb-[0.4rem] text-sm font-semibold">{label}</span>
    {children}
  </label>
);

/** Two fields side by side, stacking below 820px. */
export const FieldRow = ({ children }) => (
  <div className="grid grid-cols-2 gap-4 max-[820px]:grid-cols-1">{children}</div>
);

const CONTROL =
  'border border-line-strong bg-surface px-[0.85rem] py-[0.7rem] font-sans text-base text-ink '
  + 'focus:border-blue focus:outline-none';

export const Input = ({ className = '', ...props }) => (
  <input {...props} className={`${CONTROL} ${className}`} />
);

export const Select = ({ className = '', children, ...props }) => (
  <select {...props} className={`${CONTROL} ${className}`}>
    {children}
  </select>
);

export const Textarea = ({ className = '', ...props }) => (
  <textarea {...props} className={`${CONTROL} min-h-[120px] resize-y ${className}`} />
);
