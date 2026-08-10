import { useCallback, useState } from 'react'

/**
 * The one-line message that appears and fades. Used for things a control's own
 * appearance cannot say — which way a mode just went, that a copy worked, what
 * a held category is waiting for.
 */
export function useToast() {
  const [toast, setToast] = useState<string | null>(null)

  const flashToast = useCallback((message: string) => {
    setToast(message)
    // Matched on the way out, so a second message arriving during the first
    // one's two seconds is not cut short by the first one's timer.
    setTimeout(() => setToast(t => (t === message ? null : t)), 2200)
  }, [])

  return { toast, flashToast }
}
