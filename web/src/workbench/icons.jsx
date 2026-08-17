/* Minimal inline stroke icons. The handoff assumes no icon library; swap these
   for the house icon set if one is ever adopted. */

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function SearchIcon({ size = 13, color = 'var(--text-ghost)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ color, flex: '0 0 auto' }} aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" {...base} />
      <path d="M10.5 10.5 14 14" {...base} />
    </svg>
  );
}

export function LockIcon({ size = 28, color = 'var(--text-faint)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ color }} aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="10" {...base} />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" {...base} />
    </svg>
  );
}

export function PlayIcon({ size = 13, color = 'var(--ink)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ color }} aria-hidden="true">
      <path d="M5 3.5v9l7-4.5-7-4.5Z" fill="currentColor" />
    </svg>
  );
}

export function DownloadIcon({ size = 13, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ color, flex: '0 0 auto' }} aria-hidden="true">
      <path d="M8 2v8m0 0L5 7m3 3 3-3" {...base} />
      <path d="M2.5 12.5h11" {...base} />
    </svg>
  );
}
