import { formatDay, sessionTitle } from '../lib/display'
import { injuryOn, isGym, todayISO } from '../lib/stats'
import { blockDone } from '../model/draft'
import { useStore } from '../store/store'
import { Heatmap } from '../ui/Heatmap'
import { href } from '../ui/router'
import { SyncBadge, SyncError } from '../ui/SyncBadge'

export function Home() {
  const { doc, draft } = useStore()
  const today = todayISO()
  const ongoing = doc.injuries.find((i) => !i.end) ?? injuryOn(doc.injuries, today)
  const last = doc.sessions[0]
  const lastIndex = 0

  return (
    <>
      <header className="topbar">
        <h1>Activity Log</h1>
        <SyncBadge />
      </header>
      <SyncError />

      {draft ? (
        <section className="card stack" aria-label="Session in progress">
          <span className="eyebrow">In progress · {formatDay(draft.date)}</span>
          <p className="display" style={{ fontSize: '1.6rem' }}>
            {draft.kind === 'activity'
              ? draft.text || 'Activity'
              : draft.phase === 'plan' && !draft.blocks.some(blockDone)
                ? `Planning · ${draft.blocks.length} exercises`
                : `${draft.blocks.reduce((n, b) => n + blockDone(b), 0)} sets logged`}
          </p>
          <a
            className="btn primary big"
            href={href(draft.kind === 'gym' ? 'workout' : 'new', ...(draft.kind === 'gym' ? [] : ['activity']))}
          >
            Resume
          </a>
        </section>
      ) : (
        <section className="card stack" aria-label="Start">
          <a className="btn primary big" href={href('new')}>
            Start workout
          </a>
          <a className="btn" href={href('new', 'activity')}>
            Log activity
          </a>
        </section>
      )}

      {ongoing && (
        <a className="card session-item" href={href('injuries')}>
          <span className="eyebrow">Injured</span>
          <p>
            {ongoing.description} <span className="muted small">since {formatDay(ongoing.start)}</span>
          </p>
        </a>
      )}

      <Heatmap sessions={doc.sessions} injuries={doc.injuries} />

      {last && (
        <a className="card session-item row" href={href('history', lastIndex)}>
          <span className="grow">
            <span className="eyebrow">
              Last {isGym(last) ? 'session' : 'activity'} · {formatDay(last.date)}
            </span>
            <br />
            {sessionTitle(last)}
          </span>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </a>
      )}
    </>
  )
}
