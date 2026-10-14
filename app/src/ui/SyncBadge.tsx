import { flush, useStore } from '../store/store'

export function SyncBadge() {
  const { status, pending } = useStore()
  const label =
    status === 'loading'
      ? 'Syncing…'
      : status === 'saving'
        ? 'Saving…'
        : status === 'offline'
          ? `Offline · ${pending.length} unsaved`
          : status === 'error'
            ? 'Sync error'
            : pending.length
              ? `${pending.length} unsaved`
              : 'Synced'
  const warn = status === 'error' || status === 'offline' || pending.length > 0
  return (
    <button
      className={`badge${warn ? ' warn' : ''}`}
      onClick={() => void flush()}
      aria-live="polite"
      title="Tap to retry saving"
    >
      {label}
    </button>
  )
}

export function SyncError() {
  const { status, error, conflict, needsInstall } = useStore()
  if (status !== 'error' || !error) return null
  return (
    <div className="banner stack" role="alert">
      <span>{error}</span>
      {needsInstall && <a href="#/settings">How to fix</a>}
      {conflict && <a href="#/settings">Review unsaved changes</a>}
    </div>
  )
}
