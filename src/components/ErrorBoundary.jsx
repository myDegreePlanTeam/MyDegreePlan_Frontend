import { Component } from 'react'
import './ErrorBoundary.css'

// ── ErrorBoundary ─────────────────────────────────────────────────────────────
// Error boundaries MUST be class components. React has no hook equivalent for
// getDerivedStateFromError (which updates state synchronously on error, before
// re-render) or componentDidCatch (which fires after the render with error info).
//
// Placement strategy:
//   • Outer wrap in main.jsx — catches anything in the entire app tree,
//     including router-level or auth errors.
//   • Inner wrap around Dashboard in App.jsx — the dashboard is the most
//     complex part of the app and most likely source of runtime errors.
//     A nested boundary gives us more targeted recovery without nuking the
//     entire session.
//
// Recovery: window.location.reload() is the correct approach here because
// the React tree is in an unknown broken state. A soft reset (clearing state)
// won't help if the error lives in a sub-tree — a full reload is safer.

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError:    false,
      error:       null,
      errorInfo:   null,
      showDetails: false,
    }
  }

  // getDerivedStateFromError fires synchronously during the error propagation
  // phase, before the next render. Returning hasError: true tells React to
  // render the fallback instead of the broken child tree.
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  // componentDidCatch fires in the commit phase (after the DOM update).
  // errorInfo.componentStack is the React-formatted stack trace showing which
  // component threw. We store it here so the "Show technical details" section
  // can display it without a re-fetch.
  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
  }

  render() {
    if (this.state.hasError) {
      const { error, errorInfo, showDetails } = this.state

      return (
        <div className="error-boundary-shell">
          <div className="error-boundary-card">

            <p className="error-boundary-eyebrow">MyDegreePlan</p>

            <h1 className="error-boundary-title">Something went wrong</h1>

            <p className="error-boundary-body">
              An unexpected error occurred. Your degree plan data is safe —
              try reloading the page to get back on track.
            </p>

            <button
              className="error-boundary-reload"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>

            {/* Expandable technical detail — useful during development and
                demo situations without hiding the error completely. */}
            <button
              className="error-boundary-toggle"
              onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
            >
              {showDetails ? '▲ Hide' : '▼ Show'} technical details
            </button>

            {showDetails && (
              <pre className="error-boundary-details">
                {error?.toString()}
                {errorInfo?.componentStack}
              </pre>
            )}

          </div>
        </div>
      )
    }

    return this.props.children
  }
}
