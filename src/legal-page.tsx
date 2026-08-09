
// Served at /privacy and /terms. Standalone rather than a panel: these are
// linked from the sign-in page and given to Google and Meta as the app's
// published policy URLs, so they must render without an account and without any
// of the app's state.

import { type ProseDocument } from './prose'
import { ProseSections } from './ui'

export function LegalPage({ doc }: { doc: ProseDocument }) {
  return (
    <div className="legal-page">
      <article className="legal-measure">
        <a className="legal-back" href="/">← Back to Peri</a>
        <h1 className="legal-title">{doc.title}</h1>
        <p className="legal-updated">Last updated {doc.updated}</p>
        {doc.intro && <p className="legal-intro">{doc.intro}</p>}
        <ProseSections sections={doc.sections} />
        <p className="help-legal-links">
          <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a> ·{' '}
          <a href="/">Peri</a>
        </p>
      </article>
    </div>
  )
}
