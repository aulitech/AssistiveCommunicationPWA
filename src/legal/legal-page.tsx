// Served at /privacy and /terms. Standalone rather than a panel: these are
// linked from the sign-in page and given to Google and Meta as the app's
// published policy URLs, so they must render without an account and without any
// of the app's state.
//
// **Driven by dwell like every other screen**, which it was not: the links were
// plain anchors and the page scrolled only by wheel. Somebody who reached the
// privacy policy by dwell from the guide or the sign-in page could read as far as
// the first screen and had no way back to their board.

import { type ProseDocument } from '../core/prose'
import { DwellCursor, DwellLink, ProseSections, ScrollPane } from '../ui/controls'

export function LegalPage({ doc }: { doc: ProseDocument }) {
  return (
    <div className="legal-page">
      <ScrollPane className="legal-scroller" paneClassName="legal-body" step={160}>
        <article className="legal-measure">
          <p className="legal-back">
            <DwellLink href="/">← Back to Peri</DwellLink>
          </p>
          <h1 className="legal-title">{doc.title}</h1>
          <p className="legal-updated">Last updated {doc.updated}</p>
          {doc.intro && <p className="legal-intro">{doc.intro}</p>}
          <ProseSections sections={doc.sections} />
          <p className="help-legal-links">
            <DwellLink href="/privacy">Privacy Policy</DwellLink> ·{' '}
            <DwellLink href="/terms">Terms of Service</DwellLink> · <DwellLink href="/">Peri</DwellLink>
          </p>
        </article>
      </ScrollPane>
      <DwellCursor />
    </div>
  )
}
