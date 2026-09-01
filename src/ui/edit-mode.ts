// Whether the app is in edit mode, and how a control asks to edit something.
//
// Read by the phrase cells and the emergency bar, both of which change what a
// dwell does when it is on. Its own module because those two live in different
// files and neither owns the idea.

import { createContext, useContext } from 'react'
import { type Phrase } from '../core/phrases'

export interface EditCtxValue {
  editMode: boolean
  openEdit: (phrase: Phrase | null, isEmergency?: boolean) => void // null = new phrase
}

export const EditCtx = createContext<EditCtxValue>({ editMode: false, openEdit: () => {} })

export const useEdit = () => useContext(EditCtx)
