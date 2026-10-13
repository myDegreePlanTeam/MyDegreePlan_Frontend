// A destination's icon (shell/navTabs.js ids): inline stroke SVG in the text colour, decorative (the label beside it names the destination).

const PATHS = {
  plan: (
    <>
      <rect x="3" y="4" width="14" height="13" rx="2" />
      <path d="M3 8.5h14M7 2.5v3M13 2.5v3" />
    </>
  ),
  requirements: <path d="M3.5 5.5l1.4 1.4 2.4-2.6M3.5 11l1.4 1.4 2.4-2.6M10 5.8h7M10 11.3h7M3.6 16.4h.1M10 16.4h7" />,
  advising: <path d="M3 4h14v9H9.5L5.5 16.5V13H3z" />,
  settings: (
    <>
      <path d="M3 6h14M3 10h14M3 14h14" />
      <circle cx="7" cy="6" r="1.9" fill="var(--c-surface)" />
      <circle cx="13" cy="10" r="1.9" fill="var(--c-surface)" />
      <circle cx="9" cy="14" r="1.9" fill="var(--c-surface)" />
    </>
  ),
}

export default function NavIcon({ id }) {
  return (
    <svg className="ds-tab-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[id]}
    </svg>
  )
}
