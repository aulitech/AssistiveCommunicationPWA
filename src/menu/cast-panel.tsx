// Menu → Cast. The steps are data in `cast.ts`; this renders them, in the
// guide's column and folds.

import { ProseSections, ScrollPane } from '../ui/controls'
import { browserOf, castSections, deviceOf } from './cast'

export function CastPanel() {
  const sections = castSections(
    deviceOf(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    browserOf(navigator.userAgent),
  )
  return (
    <div className="help-panel cast-panel">
      <ScrollPane className="help-scroller" paneClassName="help-body">
        <div className="help-measure">
          <h2 className="help-title">Showing Peri on a TV</h2>
          <p className="help-text">
            The TV shows everything on this screen, the words you write before you say them too. Peri cannot start
            it for you — a web page is not allowed to — so here is how, on this device first. To show only what is
            said, use presentation mode instead: Present, in the message box.
          </p>
          <ProseSections sections={sections} collapsible />
        </div>
      </ScrollPane>
    </div>
  )
}
