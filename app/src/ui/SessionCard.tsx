import type { Session } from '../format/types'
import { isGym } from '../lib/stats'
import { formatDay, itemLine } from '../lib/display'
import { href } from './router'

export function SessionCard({ session, index }: { session: Session; index: number }) {
  const gym = isGym(session)
  return (
    <a className="card session-item" href={href('history', index)}>
      <div className="row">
        <i
          className="dot"
          style={{ background: gym ? 'var(--series-gym)' : 'var(--series-activity)' }}
          aria-label={gym ? 'Gym' : 'Activity'}
        />
        <strong className="grow">{formatDay(session.date)}</strong>
        {session.location && <span className="secondary small">{session.location}</span>}
      </div>
      <ul className="lines">
        {session.items.map((item, i) => (
          <li key={i}>{itemLine(item)}</li>
        ))}
      </ul>
    </a>
  )
}
