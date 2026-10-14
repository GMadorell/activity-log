import { useMemo, useState } from 'react'
import { isGym, lastLocation, locationsOf, todayISO } from '../lib/stats'
import { draftFromSession, draftToSession, emptyDraft, type Draft } from '../model/draft'
import { commit, setDraft, useStore } from '../store/store'
import { ago, formatDay, itemLine, sessionTitle } from '../lib/display'
import type { Session } from '../format/types'
import { Heatmap } from '../ui/Heatmap'
import { navigate } from '../ui/router'

export function LocationField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { doc } = useStore()
  const locations = useMemo(() => locationsOf(doc.sessions), [doc.sessions])
  return (
    <div className="field">
      <span>Location (optional)</span>
      <div className="chips" role="group" aria-label="Recent locations">
        {locations.slice(0, 6).map((l) => (
          <button
            key={l}
            type="button"
            className="chip"
            aria-pressed={value === l}
            onClick={() => onChange(value === l ? '' : l)}
          >
            {l}
          </button>
        ))}
      </div>
      <input
        aria-label="Location"
        list="locations"
        value={value}
        placeholder="New location…"
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id="locations">
        {locations.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
    </div>
  )
}

const RECENT = 10

export function NewSession({ mode }: { mode?: string }) {
  const { doc, draft } = useStore()
  // An unfinished activity draft is resumed here; gym drafts live in the workout screen.
  const existing = draft?.kind === 'activity' ? draft : null
  const [date, setDate] = useState(existing?.date ?? todayISO())
  const [location, setLocation] = useState(existing?.location ?? lastLocation(doc.sessions) ?? '')
  const [kind, setKind] = useState<Draft['kind']>(existing?.kind ?? (mode === 'activity' ? 'activity' : 'gym'))
  const [text, setText] = useState(existing?.text ?? '')

  const gymSessions = useMemo(() => doc.sessions.filter(isGym), [doc.sessions])
  const [picked, setPicked] = useState<{ day: string; session?: Session } | null>(null)

  const start = (d: Draft) => {
    if (draft?.kind === 'gym' && !confirm('Replace the workout in progress?')) return
    setDraft(d)
    navigate('workout')
  }

  const saveActivity = () => {
    const session = draftToSession({ ...emptyDraft(date, location), kind: 'activity', text })
    if (!session.items.length) return
    setDraft(null)
    void commit({ type: 'addSession', session })
    navigate('')
  }

  return (
    <>
      <header className="topbar">
        <h1>{kind === 'gym' ? 'Start workout' : 'Log activity'}</h1>
        <a className="btn ghost" href="#/">
          Cancel
        </a>
      </header>

      <div className="seg" role="group" aria-label="Session type">
        <button aria-pressed={kind === 'gym'} onClick={() => setKind('gym')}>
          Gym
        </button>
        <button aria-pressed={kind === 'activity'} onClick={() => setKind('activity')}>
          Activity
        </button>
      </div>

      <label className="field">
        <span>Date</span>
        <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} />
      </label>

      <LocationField value={location} onChange={setLocation} />

      {kind === 'activity' ? (
        <>
          <label className="field">
            <span>What did you do?</span>
            <textarea
              value={text}
              autoFocus
              placeholder="Football 1h with friends"
              onChange={(e) => {
                setText(e.target.value)
                setDraft({ ...emptyDraft(date, location), kind: 'activity', text: e.target.value })
              }}
            />
          </label>
          <button className="btn primary big" disabled={!text.trim()} onClick={saveActivity}>
            Save activity
          </button>
        </>
      ) : (
        <>
          <button className="btn big" onClick={() => start(emptyDraft(date, location))}>
            Blank session
          </button>
          {gymSessions.length > 0 && (
            <section className="stack" aria-label="Recent sessions">
              <h2>Recent sessions</h2>
              <ul className="list">
                {gymSessions.slice(0, RECENT).map((s) => (
                  <li key={doc.sessions.indexOf(s)}>
                    <button
                      className="block"
                      aria-pressed={picked?.session === s}
                      onClick={() => setPicked(picked?.session === s ? null : { day: s.date, session: s })}
                    >
                      <span className="grow">
                        <span className="name">{sessionTitle({ ...s, location: undefined })}</span>
                        <br />
                        <span className="muted small">
                          {formatDay(s.date)} · {ago(s.date)}
                          {s.location ? ` · ${s.location}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Heatmap
            sessions={gymSessions}
            injuries={doc.injuries}
            selected={picked?.day ?? null}
            onSelect={(day) => setPicked(day ? { day, session: gymSessions.find((s) => s.date === day) } : null)}
          />
          {picked && (
            <section className="card stack sheet" aria-label="Selected session">
              <div className="row between">
                <span>
                  <strong>{formatDay(picked.day)}</strong>{' '}
                  <span className="muted small">
                    {ago(picked.day)}
                    {picked.session?.location ? ` · ${picked.session.location}` : ''}
                  </span>
                </span>
                <button className="btn ghost icon" aria-label="Close" onClick={() => setPicked(null)}>
                  ✕
                </button>
              </div>
              {picked.session ? (
                <>
                  <ul className="lines">
                    {picked.session.items.map((item, i) => (
                      <li key={i}>{itemLine(item)}</li>
                    ))}
                  </ul>
                  <button
                    className="btn primary big"
                    onClick={() => start(draftFromSession(picked.session!, date, location, doc.sessions))}
                  >
                    Repeat this session
                  </button>
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  No workout on this day.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </>
  )
}
