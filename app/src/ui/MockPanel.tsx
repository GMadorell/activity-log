import { useState } from 'react'
import { isMockOffline, mockSource, resetMock, setMockOffline } from '../github/mock'
import { flush } from '../store/store'

/** Dev-only controls for local mock mode. */
export default function MockPanel() {
  const [offline, setOffline] = useState(isMockOffline)
  return (
    <section className="card stack">
      <h2>Mock mode</h2>
      <p className="secondary small">
        Local only. "GitHub" is this browser's storage, seeded from <span className="mono">{mockSource()}</span>.
      </p>
      <label className="row">
        <input
          type="checkbox"
          checked={offline}
          style={{ width: 24, minHeight: 24 }}
          onChange={(e) => {
            setMockOffline(e.target.checked)
            setOffline(e.target.checked)
            if (!e.target.checked) void flush()
          }}
        />
        <span>Simulate offline (saves queue up)</span>
      </label>
      <button
        className="btn danger"
        onClick={() => {
          if (!confirm('Reset all mock data back to the seed file?')) return
          resetMock()
          location.reload()
        }}
      >
        Reset mock data
      </button>
    </section>
  )
}
