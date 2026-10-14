import { useEffect, useMemo, useRef, useState } from 'react'
import type { Injury, Session } from '../format/types'
import { addDays, dayKinds, daysBetween, injuryOn, todayISO } from '../lib/stats'
import { formatDay, sessionTitle } from '../lib/display'
import { href } from './router'

const CELL = 13
const GAP = 3
const STEP = CELL + GAP
const LEFT = 22
const TOP = 16
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Monday of the week containing iso. */
function weekStart(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7
  return addDays(iso, -dow)
}

type Range = { label: string; from: string; to: string }

/**
 * Year calendar. Uncontrolled, a tapped day shows its sessions below. With
 * `onSelect`, the parent owns the selected day and renders the details.
 */
export function Heatmap({
  sessions,
  injuries,
  selected: controlled,
  onSelect,
}: {
  sessions: Session[]
  injuries: Injury[]
  selected?: string | null
  onSelect?: (date: string | null) => void
}) {
  const today = todayISO()
  const ranges = useMemo<Range[]>(() => {
    const years = [...new Set(sessions.map((s) => s.date.slice(0, 4)))].sort().reverse()
    return [
      { label: 'Last 12 months', from: addDays(today, -364), to: today },
      ...years.map((y) => ({ label: y, from: `${y}-01-01`, to: `${y}-12-31` })),
    ]
  }, [sessions, today])
  const [rangeIdx, setRangeIdx] = useState(0)
  const range = ranges[Math.min(rangeIdx, ranges.length - 1)]
  const [own, setOwn] = useState<string | null>(null)
  const selected = onSelect ? (controlled ?? null) : own
  const setSelected = onSelect ?? setOwn
  const scroller = useRef<HTMLDivElement>(null)

  const kinds = useMemo(() => dayKinds(sessions), [sessions])
  const start = weekStart(range.from)
  const weeks = Math.ceil((daysBetween(start, range.to) + 1) / 7)
  const width = LEFT + weeks * STEP
  const height = TOP + 7 * STEP

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [range])

  const cells = []
  const monthLabels = []
  let trained = 0
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d)
      if (date < range.from || date > range.to || date > today) continue
      const kind = kinds.get(date)
      if (kind) trained++
      const injured = !kind && injuryOn(injuries, date, today)
      const fill =
        kind === 'gym'
          ? 'var(--series-gym)'
          : kind === 'activity'
            ? 'var(--series-activity)'
            : injured
              ? 'url(#injury)'
              : 'var(--cell-empty)'
      cells.push(
        <rect
          key={date}
          data-date={date}
          x={LEFT + w * STEP}
          y={TOP + d * STEP}
          width={CELL}
          height={CELL}
          rx={3}
          fill={fill}
          stroke={selected === date ? 'var(--text-primary)' : 'none'}
          strokeWidth={2}
          onClick={() => setSelected(date === selected ? null : date)}
        >
          <title>{`${formatDay(date)}${kind ? ` · ${kind}` : injured ? ' · injured' : ''}`}</title>
        </rect>,
      )
      if (date.endsWith('-01') || (w === 0 && d === 0 && Number(date.slice(8)) <= 7)) {
        monthLabels.push(
          <text key={`m${date}`} x={LEFT + w * STEP} y={10} fontSize={10} fill="var(--text-secondary)">
            {MONTHS[Number(date.slice(5, 7)) - 1]}
          </text>,
        )
      }
    }
  }

  const selSessions = selected ? sessions.filter((s) => s.date === selected) : []
  const selInjury = selected ? injuryOn(injuries, selected, today) : undefined

  return (
    <section className="card stack" aria-label="Training calendar">
      <div className="row between wrap">
        <h2>
          {trained} <span className="secondary small">active days</span>
        </h2>
        <select
          aria-label="Calendar range"
          value={rangeIdx}
          onChange={(e) => setRangeIdx(Number(e.target.value))}
          style={{ width: 'auto' }}
        >
          {ranges.map((r, i) => (
            <option key={r.label} value={i}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="heatmap" ref={scroller}>
        <svg width={width} height={height} role="img" aria-label={`${trained} active days in ${range.label}`}>
          <defs>
            <pattern id="injury" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="4" height="4" fill="var(--cell-empty)" />
              <line x1="0" y1="0" x2="0" y2="4" stroke="var(--injury)" strokeWidth="2.5" />
            </pattern>
          </defs>
          {['M', '', 'W', '', 'F', '', ''].map((l, d) =>
            l ? (
              <text key={d} x={0} y={TOP + d * STEP + 10} fontSize={10} fill="var(--text-secondary)">
                {l}
              </text>
            ) : null,
          )}
          {monthLabels}
          {cells}
        </svg>
      </div>
      <div className="legend">
        <span>
          <i className="dot" style={{ background: 'var(--series-gym)' }} /> Gym
        </span>
        <span>
          <i className="dot" style={{ background: 'var(--series-activity)' }} /> Activity
        </span>
        <span>
          <svg width="10" height="10" aria-hidden="true">
            <rect width="10" height="10" rx="3" fill="url(#injury)" />
          </svg>
          Injured
        </span>
        <span>
          <i className="dot" style={{ background: 'var(--cell-empty)' }} /> Rest
        </span>
      </div>
      {selected && !onSelect && (
        <div className="small" aria-live="polite">
          <strong>{formatDay(selected)}</strong>
          {selInjury && <span className="secondary"> · {selInjury.description}</span>}
          {selSessions.length === 0 && <div className="muted">Rest day</div>}
          {selSessions.map((s) => (
            <div key={sessions.indexOf(s)}>
              <a href={href('history', sessions.indexOf(s))}>{sessionTitle(s)}</a>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
