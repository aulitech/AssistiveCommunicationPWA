// The messages already said, as phrases that can be said again.

import { useCallback, useMemo, useState } from 'react'
import { addSent, loadSent, saveSent, type SentMessage } from './store'
import { plainPhrase, type Phrase } from './phrases'

/** The category its phrases claim, and the word on its tab. */
export const SENT_CATEGORY = 'Sent'

/**
 * The filter id. The leading space keeps it out of reach of a real category:
 * names are trimmed before they are saved, so none can ever collide with this.
 */
export const SENT_FILTER = ' sent'

export function useSent() {
  const [messages, setMessages] = useState<SentMessage[]>(loadSent)

  const write = useCallback((next: SentMessage[]) => {
    saveSent(next)
    setMessages(next)
  }, [])

  // Both of these read storage back rather than closing over `messages`. Two
  // sends can happen without a render in between — speaking a phrase in
  // auto-speak, then another straight after — and the second would otherwise be
  // written against a list that no longer exists.
  const record = useCallback((text: string) => write(addSent(loadSent(), text)), [write])

  const forget = useCallback((id: string) => write(loadSent().filter(m => m.id !== id)), [write])

  const phrases = useMemo<Phrase[]>(
    () => messages.map(m => plainPhrase(m.id, m.text, SENT_CATEGORY)),
    [messages],
  )

  return { phrases, record, forget }
}
