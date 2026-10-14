import { useState } from 'react'
import type { Injury } from '../format/types'
import { todayISO } from '../lib/stats'
import { commit, useStore } from '../store/store'
import { SyncBadge } from '../ui/SyncBadge'

function InjuryForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Injury
  onSave: (i: Injury) => void
  onCancel?: () => void
}) {
  const [description, setDescription] = useState(initial?.description ?? '')
  const [start, setStart] = useState(initial?.start ?? todayISO())
  const [end, setEnd] = useState(initial?.end ?? '')
  const valid = description.trim() && start && (!end || end >= start)
  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        const injury: Injury = { start, description: description.trim().replace(/\n/g, ' ') }
        if (end) injury.end = end
        onSave(injury)
        if (!initial) setDescription('')
      }}
    >
      <label className="field">
        <span>What happened</span>
        <input
          value={description}
          placeholder="Sprained ankle, flu, sore shoulder…"
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="row">
        <label className="field grow">
          <span>From</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field grow">
          <span>Until (empty = ongoing)</span>
          <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <div className="row">
        {onCancel && (
          <button type="button" className="btn grow" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn primary grow" disabled={!valid}>
          {initial ? 'Save' : 'Add injury'}
        </button>
      </div>
    </form>
  )
}

export function Injuries() {
  const { doc } = useStore()
  const [editing, setEditing] = useState<number | null>(null)
  return (
    <>
      <header className="topbar">
        <h1>Injuries</h1>
        <SyncBadge />
      </header>
      <InjuryForm onSave={(injury) => void commit({ type: 'addInjury', injury })} />
      <ul className="list">
        {doc.injuries.map((inj, i) =>
          editing === i ? (
            <li key={i}>
              <InjuryForm
                initial={inj}
                onCancel={() => setEditing(null)}
                onSave={(after) => {
                  setEditing(null)
                  void commit({ type: 'replaceInjury', before: inj, after })
                }}
              />
            </li>
          ) : (
            <li key={i} className="card stack" style={{ gap: 8 }}>
              <div className="row between">
                <strong>{inj.description}</strong>
                {!inj.end && <span className="badge warn">ongoing</span>}
              </div>
              <span className="secondary small">
                {inj.start} → {inj.end ?? 'now'}
              </span>
              <div className="row">
                {!inj.end && (
                  <button
                    className="btn grow"
                    onClick={() =>
                      void commit({ type: 'replaceInjury', before: inj, after: { ...inj, end: todayISO() } })
                    }
                  >
                    Recovered today
                  </button>
                )}
                <button className="btn grow" onClick={() => setEditing(i)}>
                  Edit
                </button>
                <button
                  className="btn danger"
                  onClick={() =>
                    confirm(`Delete "${inj.description}"?`) &&
                    void commit({ type: 'replaceInjury', before: inj, after: null })
                  }
                >
                  Delete
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
    </>
  )
}
