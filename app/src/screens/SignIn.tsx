import { useState } from 'react'
import { config } from '../config'
import { startLogin } from '../github/auth'

export function SignIn({ error }: { error?: string }) {
  const [busy, setBusy] = useState(false)
  const configured = config.clientId && config.authUrl
  return (
    <main className="app" style={{ justifyContent: 'center' }}>
      <div className="stack card">
        <h1>Activity Log</h1>
        <p className="secondary" style={{ margin: 0 }}>
          Your log lives in <span className="mono">{config.dataRepo}</span>. Sign in once per device.
        </p>
        {error && (
          <div className="banner" role="alert">
            {error}
          </div>
        )}
        {!configured && (
          <div className="banner" role="alert">
            App not configured: missing GitHub App client ID or auth URL.
          </div>
        )}
        <button
          className="btn primary big"
          disabled={busy || !configured}
          onClick={() => {
            setBusy(true)
            void startLogin()
          }}
        >
          {busy ? 'Opening GitHub…' : 'Sign in with GitHub'}
        </button>
      </div>
    </main>
  )
}
