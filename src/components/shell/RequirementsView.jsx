import GenEdProgress from './GenEdProgress'

export default function RequirementsView({ panel }) {
  return (
    <div className="ds-view ds-requirements">
      <p className="ds-eyebrow">Requirements</p>
      <h2 className="ds-h2">General education</h2>
      {panel ? (
        <GenEdProgress panel={panel} />
      ) : (
        <div className="ds-empty-state">
          This plan has no general-education requirements to track.
        </div>
      )}
    </div>
  )
}
