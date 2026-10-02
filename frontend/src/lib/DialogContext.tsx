import { useCallback, useEffect, useRef, useState } from 'react'

// V60: every user-facing message/confirmation is app-rendered. Native
// alert/confirm/prompt are invisible in iOS home-screen standalone mode and in
// some in-app webviews; the old code gated every destructive action on
// confirm(), which then silently returned false, so draft invoices looked
// undeletable.
//
// window.alert/confirm/prompt are replaced with this host instead of editing
// ~50 call sites; main.tsx already patches window.fetch the same way.

type ConfirmOptions = { title?: string; confirmLabel?: string; destructive?: boolean }

type State =
  | { kind: 'alert'; message: string; title?: string }
  | { kind: 'confirm'; message: string; title?: string; confirmLabel?: string; destructive?: boolean }
  | { kind: 'prompt'; message: string; title?: string; defaultValue?: string }

// Standalone holder lets the global patch (module scope, no hooks) route into
// React state. Null before DialogProvider mounts → dialogs resolve as
// cancelled rather than throwing.
let pending: ((d: State) => Promise<any>) | null = null

const request = (d: State): Promise<any> => {
  if (!pending) return Promise.resolve(d.kind === 'confirm' ? false : null)
  return pending(d)
}

export const dialog = {
  alert: (message: string, title?: string) => request({ kind: 'alert', message: message, title: title }),
  confirm: (message: string, opts?: ConfirmOptions) => request({ kind: 'confirm', message: message, ...opts }),
  prompt: (message: string, defaultValue?: string) => request({ kind: 'prompt', message: message, defaultValue: defaultValue }),
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State | null>(null)
  const [input, setInput] = useState('')
  const resolver = useRef<(v: any) => void>(() => {})
  const okRef = useRef<HTMLButtonElement>(null)

  const open = useCallback((d: State): Promise<any> => {
    setInput(d.kind === 'prompt' ? (d.defaultValue ?? '') : '')
    setState(d)
    // ponytail: executor form kept deliberately — Promise.withResolvers is
    // Safari 17.4+, Vite's build target covers Safari 16.
    return new Promise((resolve) => {
      resolver.current = resolve
    })
  }, [])

  useEffect(() => {
    pending = open
    return () => {
      pending = null
    }
  }, [open])

  const close = useCallback((value: any) => {
    resolver.current?.(value)
    setState(null)
  }, [])

  useEffect(() => {
    if (!state) return
    okRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(state.kind === 'confirm' ? false : null)
      else if (e.key === 'Enter' && state.kind !== 'alert')
        close(state.kind === 'confirm' ? true : input)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, input, close])

  const title =
    state?.title ||
    (state?.kind === 'prompt' ? 'Input' : state?.kind === 'confirm' ? 'Konfirmasi' : 'Informasi')

  return (
    <>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xl">
            <h3 className="mb-2 text-base font-semibold">{title}</h3>
            <p className="mb-4 text-sm whitespace-pre-wrap text-muted-foreground">{state.message}</p>
            {state.kind === 'prompt' && (
              <input
                value={input}
                autoFocus
                onChange={(e) => setInput(e.target.value)}
                className="mb-4 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              />
            )}
            <div className="flex justify-end gap-2">
              {state.kind !== 'alert' && (
                <button
                  onClick={() => close(state.kind === 'confirm' ? false : null)}
                  className="btn btn-secondary btn-sm"
                >
                  Batal
                </button>
              )}
              <button
                ref={okRef}
                onClick={() =>
                  close(state.kind === 'confirm' ? true : state.kind === 'prompt' ? input : undefined)
                }
                className={`btn btn-sm ${
                  state.kind === 'confirm' && state.destructive ? 'btn-destructive' : 'btn-primary'
                }`}
              >
                {state.kind === 'confirm' ? state.confirmLabel || 'OK' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Replace the native globals with the in-app host. The sync return values keep
// un-awaited legacy callers safe: confirm() blocks, prompt() yields no value.
export function installDialogGlobals() {
  ;(window as any).alert = (message?: any) => {
    void dialog.alert(String(message ?? ''))
  }
  ;(window as any).confirm = (message?: any) => {
    void dialog.confirm(String(message ?? ''))
    return false
  }
  ;(window as any).prompt = (message?: any, defaultValue?: string) => {
    void dialog.prompt(String(message ?? ''), defaultValue)
    return null
  }
}
