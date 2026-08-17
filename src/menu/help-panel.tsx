// Menu → Help. The guide itself is data in `help.ts`; this renders it.

import { HELP_SECTIONS } from './help'
import { ProseSections, ScrollPane } from '../ui/controls'

export function HelpPanel() {
  return (
    <div className="help-panel">
      <ScrollPane className="help-scroller" paneClassName="help-body" step={120}>
        {/* The panel spans the full viewport, so the prose needs its own
            column — text running the width of a wide monitor is unreadable. */}
        <div className="help-measure">
          <h2 className="help-title">Using Peri</h2>
          {/* Folded up, one open at a time. Fifteen sections is a lot of guide
              to scroll past by dwell to reach the one you came for. */}
          <ProseSections sections={HELP_SECTIONS} collapsible />
          <p className="help-legal-links">
            <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a>
          </p>
        </div>
      </ScrollPane>
    </div>
  )
}
