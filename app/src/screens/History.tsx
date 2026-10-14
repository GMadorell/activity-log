import { useMemo, useState } from 'react'
import { parseLog } from '../format/parse'
import { serializeSession } from '../format/serialize'
import type { Session } from '../format/types'
import { exerciseNamesOf, filterSessions, locationsOf, todayISO, type SessionFilter } from '../lib/stats'
import { draftFromSession } from '../model/draft'
import { commit, setDraft, useStore } from '../store/store'
import { formatDay } from '../lib/display'
import { href, navigate } from '../ui/router'
import { Heatmap } from '../ui/Heatmap'
import { SessionCard } from '../ui/SessionCard'
import { SyncBadge } from '../ui/SyncBadge'

const PAGE = 30

function parseOne(text: string): { session?: Session; problems: string[] } {
  const { doc, warnings } = parseLog(`# Log\n\n${text.trim()}\n`)
  if (doc.sessions.length !== 1 || doc.head.length) {
    return { problems: ['Must contain exactly one session starting with "## YYYY-MM-DD"'] }
  }
  return { session: doc.sessions[0], problems: warnings.map((w) => w.replace(/^[^:]+: /, '')) }
}

function SessionDetail({ session }: { session: Session }) {
  const { doc, draft } = useStore()
  const original = serializeSession(session)
  const [text, setText] = useState(original)
  const [editing, setEditing] = useState(false)
  const parsed = useMemo(() => parseOne(text), [text])

  return (
    <>
      <header className="topbar">
        <a className="btn ghost" href={href('history')}>
          ← History
        </a>
        <SyncBadge />
      </header>
      <h1>{formatDay(session.date)}</h1>
      {editing ? (
        <div className="stack">
          <label className="field">
            <span>Edit as text</span>
            <textarea
              className="mono"
              rows={Math.max(6, text.split('\n').length + 1)}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
            />
          </label>
          <p className="muted small" style={{ margin: 0 }}>
            Format: <span className="mono">- Name 5x5@60</span>, <span className="mono">8,8,7</span>,{' '}
            <span className="mono">@22.5ea</span>, <span className="mono">@+10</span>,{' '}
            <span className="mono">4x60s</span>, <span className="mono">1000m 3:50</span>. Plain lines are notes.
          </p>
          {parsed.problems.length > 0 && (
            <div className="banner small" role="alert">
              {parsed.problems.map((p) => (
                <div key={p}>{p}</div>
              ))}
              {parsed.session && <div>Unrecognized lines are kept as notes.</div>}
            </div>
          )}
          <div className="row">
            <button className="btn grow" onClick={() => (setText(original), setEditing(false))}>
              Cancel
            </button>
            <button
              className="btn primary grow"
              disabled={!parsed.session || text.trim() === original.trim()}
              onClick={() => {
                void commit({ type: 'replaceSession', before: session, after: parsed.session! })
                navigate('history')
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <pre className="mono small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {original}
            </pre>
          </div>
          <button className="btn big" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button
            className="btn big"
            disabled={!!draft}
            title={draft ? 'Finish the current session first' : undefined}
            onClick={() => {
              setDraft(draftFromSession(session, todayISO(), undefined, doc.sessions))
              navigate(session.items.some((i) => i.kind !== 'text') ? 'workout' : 'new')
            }}
          >
            Repeat today
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (!confirm(`Delete session of ${formatDay(session.date)}?`)) return
              void commit({ type: 'replaceSession', before: session, after: null })
              navigate('history')
            }}
          >
            Delete
          </button>
        </>
      )}
    </>
  )
}

function AddAsText() {
  const { doc } = useStore()
  const loc = doc.sessions.find((x) => x.location)?.location
  const [text, setText] = useState(`## ${todayISO()}${loc ? ` · ${loc}` : ''}\n- `)
  const parsed = useMemo(() => parseOne(text), [text])
  return (
    <>
      <header className="topbar">
        <a className="btn ghost" href={href('history')}>
          ← History
        </a>
      </header>
      <h1>Add session as text</h1>
      <textarea
        className="mono"
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        autoCapitalize="off"
        aria-label="Session text"
      />
      {parsed.problems.length > 0 && (
        <div className="banner small" role="alert">
          {parsed.problems.map((p) => (
            <div key={p}>{p}</div>
          ))}
        </div>
      )}
      <button
        className="btn primary big"
        disabled={!parsed.session?.items.length}
        onClick={() => {
          void commit({ type: 'addSession', session: parsed.session! })
          navigate('history')
        }}
      >
        Add
      </button>
    </>
  )
}

export function History({ index }: { index?: number | 'new' }) {
  const { doc, warnings } = useStore()
  const [filter, setFilter] = useState<SessionFilter>({})
  const [limit, setLimit] = useState(PAGE)
  const set = (patch: SessionFilter) => setFilter((f) => ({ ...f, ...patch }))
  const locations = useMemo(() => locationsOf(doc.sessions), [doc.sessions])
  const exercises = useMemo(() => exerciseNamesOf(doc.sessions).sort((a, b) => a.localeCompare(b)), [doc.sessions])

  const session = typeof index === 'number' ? doc.sessions[index] : undefined
  const filtered = useMemo(
    () => filterSessions(doc.sessions, filter, serializeSession).map((s) => ({ s, i: doc.sessions.indexOf(s) })),
    [doc.sessions, filter],
  )

  if (index === 'new') return <AddAsText />
  if (index !== undefined) {
    if (!session)
      return (
        <p>
          Session not found. <a href={href('history')}>Back</a>
        </p>
      )
    // Key by content so the editor resets if the session changes underneath.
    return <SessionDetail key={serializeSession(session)} session={session} />
  }

  return (
    <>
      <header className="topbar">
        <h1>History</h1>
        <SyncBadge />
      </header>
      {warnings.length > 0 && (
        <details className="banner small">
          <summary>{warnings.length} lines in the log file weren't recognized (kept as notes)</summary>
          {warnings.map((w, i) => (
            <div key={i} className="mono">
              {w}
            </div>
          ))}
        </details>
      )}
      <a className="btn" href={href('history', 'new')}>
        Add past session as text
      </a>
      <Heatmap
        sessions={doc.sessions}
        injuries={doc.injuries}
        selected={filter.day ?? null}
        onSelect={(day) => set({ day: day ?? undefined })}
      />
      <section className="stack" aria-label="Filters" style={{ gap: 8 }}>
        <div className="seg" role="group" aria-label="Session type">
          {(
            [
              [undefined, 'All'],
              ['gym', 'Gym'],
              ['activity', 'Activities'],
            ] as const
          ).map(([kind, label]) => (
            <button key={label} aria-pressed={filter.kind === kind} onClick={() => set({ kind })}>
              {label}
            </button>
          ))}
        </div>
        <div className="row">
          <select
            className="grow"
            aria-label="Exercise filter"
            value={filter.exercise ?? ''}
            onChange={(e) => set({ exercise: e.target.value || undefined })}
          >
            <option value="">Any exercise</option>
            {exercises.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <select
            className="grow"
            aria-label="Location filter"
            value={filter.location ?? ''}
            onChange={(e) => set({ location: e.target.value || undefined })}
          >
            <option value="">Any location</option>
            {locations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <input
          type="search"
          placeholder="Search (exercise, location, note…)"
          aria-label="Search sessions"
          value={filter.query ?? ''}
          onChange={(e) => set({ query: e.target.value })}
        />
      </section>
      <div className="row between">
        <span className="muted small" data-testid="result-count">
          {filtered.length === 1 ? '1 session' : `${filtered.length} sessions`}
        </span>
        {filter.day && (
          <button className="chip" onClick={() => set({ day: undefined })}>
            {formatDay(filter.day)} · Clear day ✕
          </button>
        )}
      </div>
      <ul className="list">
        {filtered.slice(0, limit).map(({ s, i }) => (
          <li key={i}>
            <SessionCard session={s} index={i} />
          </li>
        ))}
      </ul>
      {filtered.length > limit && (
        <button className="btn" onClick={() => setLimit(limit + PAGE)}>
          Show more
        </button>
      )}
    </>
  )
}
