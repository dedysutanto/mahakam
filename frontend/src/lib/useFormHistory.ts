import { useEffect, useRef } from 'react'

/**
 * Bridges a state-driven overlay (form/detail view) with browser history so
 * the device/browser back button closes the overlay instead of leaving the
 * module entirely.
 *
 * - `isOpen` flips true  -> pushes a history entry (ref-guarded, no duplicates)
 * - popstate while pushed -> closes the overlay via `close`
 * - programmatic close    -> consumes the marker entry; resulting popstate is a no-op
 */
export function useFormHistory(isOpen: boolean, close: () => void) {
  const closeRef = useRef(close)
  closeRef.current = close
  const pushedRef = useRef(false)

  useEffect(() => {
    if (isOpen && !pushedRef.current) {
      window.history.pushState({ mahakamOverlay: true }, '')
      pushedRef.current = true
    } else if (!isOpen && pushedRef.current) {
      pushedRef.current = false
      if ((window.history.state as { mahakamOverlay?: boolean } | null)?.mahakamOverlay) {
        window.history.back()
      }
    }
  }, [isOpen])

  useEffect(() => {
    const onPop = () => {
      if (!pushedRef.current) return
      pushedRef.current = false
      closeRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
}
