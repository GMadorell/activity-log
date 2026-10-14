import { config } from '../config'
import { serializeLog } from '../format/serialize'
import { refreshDaysLeft, signOut } from '../github/auth'
import { describeOps } from '../model/ops'
import { discardPending, refresh, setSignedIn, useStore } from '../store/store'
import { lazy, Suspense, useState } from 'react'
import { SyncBadge, SyncError } from '../ui/SyncBadge'
import { getTheme, setTheme, type Theme } from '../ui/theme'

// Loaded only in mock mode so production builds never include it.
const MockPanel = import.meta.env.VITE_MOCK === '1' ? lazy(() => import('../ui/MockPanel')) : null

function Appearance() {
  const [theme, set] = useState<Theme>(getTheme)
  return (
    <section className="card stack">
      <h2>Appearance</h2>
      <div className="seg" role="group" aria-label="Theme">
        {(['system', 'light', 'dark'] as Theme[]).map((t) => (
          <button
            key={t}
            aria-pressed={theme === t}
            onClick={() => {
              setTheme(t)
              set(t)
            }}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
    </section>
  )
}

export function Settings() {
  const { doc, pending, needsInstall, conflict } = useStore()
  const days = refreshDaysLeft()

  const exportFile = () => {
    const blob = new Blob([serializeLog(doc)], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <header className="topbar">
        <h1>Settings</h1>
        <SyncBadge />
      </header>
      <SyncError />

      {MockPanel && (
        <Suspense>
          <MockPanel />
        </Suspense>
      )}

      <Appearance />

      <section className="card stack">
        <h2>Data</h2>
        <p className="secondary small" style={{ margin: 0 }}>
          Stored in{' '}
          <a
            href={`https://github.com/${config.dataRepo}/blob/HEAD/${config.dataPath}`}
            target="_blank"
            rel="noreferrer"
          >
            {config.dataRepo}/{config.dataPath}
          </a>
          . Edit it there by hand any time; the app picks changes up when reopened.
        </p>
        <div className="row wrap">
          <button className="btn grow" onClick={() => void refresh()}>
            Reload from GitHub
          </button>
          <button className="btn grow" onClick={exportFile}>
            Download .md
          </button>
        </div>
      </section>

      {needsInstall && (
        <section className="card stack">
          <h2>Grant access</h2>
          <p className="small" style={{ margin: 0 }}>
            The GitHub App needs to be installed on <span className="mono">{config.dataRepo}</span> (only that repo).
          </p>
          <a
            className="btn primary"
            href={`https://github.com/apps/${config.appSlug}/installations/new`}
            target="_blank"
            rel="noreferrer"
          >
            Install on GitHub
          </a>
        </section>
      )}

      {pending.length > 0 && (
        <section className="card stack">
          <h2>Unsaved changes ({pending.length})</h2>
          <ul className="small" style={{ margin: 0 }}>
            {pending.map((op, i) => (
              <li key={i}>{describeOps([op])}</li>
            ))}
          </ul>
          {conflict && (
            <button
              className="btn danger"
              onClick={() => confirm('Drop all unsaved changes? This cannot be undone.') && discardPending()}
            >
              Discard unsaved changes
            </button>
          )}
        </section>
      )}

      <section className="card stack">
        <h2>Account</h2>
        <p className="secondary small" style={{ margin: 0 }}>
          Signed in with GitHub on this device.
          {days !== null && ` Stays signed in while you use the app at least every ${Math.max(days, 0)} days.`}
        </p>
        <button
          className="btn danger"
          onClick={async () => {
            if (pending.length && !confirm('There are unsaved changes on this device. Sign out anyway?')) return
            await signOut()
            setSignedIn(false)
          }}
        >
          Sign out
        </button>
      </section>
    </>
  )
}
