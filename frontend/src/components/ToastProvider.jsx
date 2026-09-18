import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ToastContext from './toastContext'

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(0)
  const timers = useRef(new Map())

  const dismissToast = useCallback((id) => {
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }

    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const addToast = useCallback((toast) => {
    const id = nextId.current++
    setToasts((current) => [...current, { ...toast, id }])

    const timer = window.setTimeout(() => {
      dismissToast(id)
    }, 4000)
    timers.current.set(id, timer)
  }, [dismissToast])

  useEffect(() => {
    const activeTimers = timers.current

    return () => {
      activeTimers.forEach((timer) => window.clearTimeout(timer))
      activeTimers.clear()
    }
  }, [])

  const contextValue = useMemo(() => ({ addToast }), [addToast])

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-label="Vital alerts">
        {toasts.map((toast) => (
          <article key={toast.id} className={`toast toast--${toast.zone}`} role="alert">
            <span className="toast__message">{toast.message}</span>
            <button
              type="button"
              className="toast__close"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss alert"
            >
              ×
            </button>
          </article>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export default ToastProvider
