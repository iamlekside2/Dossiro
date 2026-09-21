/**
 * The fanned document stack — the site's signature graphic, a cousin of the
 * logo's fanned-book mark.
 *
 * A white "live" document sits in front, carrying faint content lines and two
 * typed index-field chips (a nod to what the product actually does). Behind it,
 * four sheets fan out in the brand palette — teal, sky, blue, navy — reading as
 * the versions and records stacked behind every document. Radius 0, no shadow;
 * depth comes entirely from the offset planes.
 */
export default function PageStack({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 560 480"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="A document with its stack of versions and records fanned behind it"
    >
      {/* Fanned sheets behind, back to front */}
      <g opacity="0.95">
        <path d="M250 96 L516 150 L470 402 L214 340 Z" fill="var(--color-g-navy)" />
        <path d="M212 118 L474 176 L432 420 L182 356 Z" fill="var(--color-g-blue)" />
        <path d="M176 142 L430 202 L392 436 L152 372 Z" fill="var(--color-g-sky)" />
        <path d="M142 168 L384 228 L350 450 L126 388 Z" fill="var(--color-g-teal)" />
      </g>

      {/* The live document, front and upright */}
      <g>
        <rect x="44" y="70" width="256" height="340" fill="#ffffff" stroke="var(--color-line-strong)" strokeWidth="1.5" />

        {/* Title block */}
        <rect x="72" y="104" width="120" height="14" fill="var(--color-blue-ink)" />
        <rect x="72" y="130" width="180" height="9" fill="var(--color-line)" />

        {/* Two typed index-field chips */}
        <rect x="72" y="162" width="86" height="26" fill="var(--color-blue-tint)" stroke="var(--color-blue-line)" strokeWidth="1" />
        <rect x="84" y="172" width="52" height="6" fill="var(--color-blue)" />
        <rect x="170" y="162" width="86" height="26" fill="var(--color-blue-tint)" stroke="var(--color-blue-line)" strokeWidth="1" />
        <rect x="182" y="172" width="40" height="6" fill="var(--color-blue)" />

        {/* Content lines */}
        <g fill="var(--color-line)">
          <rect x="72" y="214" width="204" height="8" />
          <rect x="72" y="234" width="204" height="8" />
          <rect x="72" y="254" width="150" height="8" />
          <rect x="72" y="288" width="204" height="8" />
          <rect x="72" y="308" width="178" height="8" />
        </g>

        {/* A signature line, hinting at e-signature / accountability */}
        <rect x="72" y="352" width="96" height="1.5" fill="var(--color-ink-2)" />
        <path
          d="M74 350 C 86 338, 96 360, 108 346 S 130 338, 146 348"
          stroke="var(--color-blue)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
