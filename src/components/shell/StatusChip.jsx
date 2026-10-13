// A status as a small pill: an icon, a word and a colour, so it reads without the colour (redesign philosophy: never colour alone).
// Tones are the five statuses of the redesign: done, progress, planned, attention, blocked (--c-* tokens in index.css, .ds-chip-* in AppShell.css).

const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }

const TONES = {
  done:      { label: 'Done',            icon: <><circle cx="8" cy="8" r="6.2" /><path d="M5.2 8.2l1.9 1.9 3.8-4" /></> },
  progress:  { label: 'In progress',     icon: <><circle cx="8" cy="8" r="6.2" /><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor" /></> },
  planned:   { label: 'Planned',         icon: <circle cx="8" cy="8" r="6.2" strokeDasharray="2.6 2.4" /> },
  attention: { label: 'Needs attention', icon: <><path d="M8 2l6.2 11H1.8z" /><path d="M8 6.6v3M8 11.6v.1" /></> },
  blocked:   { label: 'Blocked',         icon: <><circle cx="8" cy="8" r="6.2" /><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" /></> },
}

// the tone names are listed in ./statusTones.js (a component file exports only components)
export default function StatusChip({ tone, label }) {
  const t = TONES[tone]
  if (!t) return null
  return (
    <span className={`ds-chip ds-chip-${tone}`}>
      <svg viewBox="0 0 16 16" {...STROKE} aria-hidden="true">{t.icon}</svg>
      {label ?? t.label}
    </span>
  )
}
