// The live settings, shared with every control in the app.
//
// Split from the panel that edits them so that `ui.tsx` can read a dwell time
// without importing the settings screen — every dwell control needs one, and the
// panel is built out of those same controls.

import { createContext, useContext } from 'react'
import { DEFAULT_SETTINGS, type Settings } from '../core/store'

export const SettingsCtx = createContext<{ settings: Settings; update: (patch: Partial<Settings>) => void }>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
})

export const useSettings = () => useContext(SettingsCtx)
