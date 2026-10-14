import { useMemo, useRef, useState, type PointerEvent } from 'react'
import type { Injury } from '../format/types'
import { exerciseNamesOf, exerciseSeries, todayISO, type Metric, type Point } from '../lib/stats'
import { useStore } from '../store/store'
import { clock, formatDay } from '../lib/display'
import { href, navigate } from '../ui/router'

const W = 600
const H = 260
const M = { top: 12, right: 12, bottom: 28, left: 40 }

const METRIC_LABEL: Record<Metric, string> = {
  weight: 'Top weight (kg)',
  reps: 'Best set (reps)',
  secs: 'Time',
  meters: 'Distance (m)',
}

const toTime = (iso: string) => Date.parse(`${iso}T12:00:00Z`)

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min]
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const ticks = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100)
  return ticks
}

function xTicks(t0: number, t1: number): { t: number; label: string }[] {
  const spanDays = (t1 - t0) / 86_400_000
  const monthStep = spanDays > 900 ? 6 : spanDays > 400 ? 3 : spanDays > 120 ? 1 : 0
  const out = []
  const d = new Date(t0)
  d.setUTCDate(1)
  if (monthStep === 0) {
    // Short spans: weekly ticks are noise; label start and end.
    return [
      { t: t0, label: new Date(t0).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) },
      { t: t1, label: new Date(t1).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) },
    ]
  }
  d.setUTCMonth(d.getUTCMonth() + 1)
  while (d.getTime() <= t1) {
    if (d.getUTCMonth() % monthStep === 0) {
      const label =
        d.getUTCMonth() === 0
          ? String(d.getUTCFullYear())
          : d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })
      out.push({ t: d.getTime(), label })
    }
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return out
}

function Chart({ points, metric, injuries }: { points: Point[]; metric: Metric; injuries: Injury[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const t0 = toTime(points[0].date)
  const t1 = Math.max(toTime(points[points.length - 1].date), t0 + 86_400_000)
  const values = points.map((p) => p.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = (hi - lo) * 0.1 || Math.max(1, hi * 0.1)
  const yTicks = niceTicks(Math.max(0, lo - pad), hi + pad)
  const y0 = Math.min(yTicks[0], lo - pad)
  const y1 = Math.max(yTicks[yTicks.length - 1], hi + pad)
  const x = (t: number) => M.left + ((t - t0) / (t1 - t0)) * (W - M.left - M.right)
  const y = (v: number) => M.top + (1 - (v - y0) / (y1 - y0)) * (H - M.top - M.bottom)
  const fmt = (v: number) => (metric === 'secs' ? clock(v) : String(v))
  // Break the line over long pauses so a gap doesn't read as a trend.
  const GAP_MS = 45 * 86_400_000
  const path = points
    .map((p, i) => {
      const jump = i === 0 || toTime(p.date) - toTime(points[i - 1].date) > GAP_MS
      return `${jump ? 'M' : 'L'}${x(toTime(p.date)).toFixed(1)},${y(p.value).toFixed(1)}`
    })
    .join('')
  const today = todayISO()

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(x(toTime(points[i].date)) - px) < Math.abs(x(toTime(points[best].date)) - px)) best = i
    }
    setHover(best)
  }

  const shown = hover ?? points.length - 1
  const hp = points[shown]

  return (
    <div className="chart stack">
      <div className="tooltip" aria-live="polite">
        <strong>{fmt(hp.value)}</strong>
        {metric === 'weight' ? ' kg' : metric === 'reps' ? ' reps' : metric === 'meters' ? ' m' : ''}{' '}
        <span className="secondary">· {formatDay(hp.date)}</span>
        <div className="secondary">{hp.label}</div>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${METRIC_LABEL[metric]} over time, ${points.length} sessions`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {injuries.map((inj) => {
          const a = Math.max(toTime(inj.start), t0)
          const b = Math.min(toTime(inj.end ?? today), t1)
          if (b <= a) return null
          return (
            <g key={inj.start}>
              <rect
                x={x(a)}
                y={M.top}
                width={Math.max(2, x(b) - x(a))}
                height={H - M.top - M.bottom}
                fill="url(#injury-band)"
              />
              <title>{inj.description}</title>
            </g>
          )
        })}
        <defs>
          <pattern id="injury-band" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--injury)" strokeWidth="2" opacity="0.6" />
          </pattern>
        </defs>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={1} />
            <text x={M.left - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--text-secondary)">
              {fmt(v)}
            </text>
          </g>
        ))}
        {xTicks(t0, t1).map(({ t, label }) => (
          <text key={t} x={x(t)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--text-secondary)">
            {label}
          </text>
        ))}
        <path
          d={path}
          fill="none"
          stroke="var(--series-gym)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hover !== null && (
          <line
            x1={x(toTime(hp.date))}
            x2={x(toTime(hp.date))}
            y1={M.top}
            y2={H - M.bottom}
            stroke="var(--text-muted)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(toTime(p.date))}
            cy={y(p.value)}
            r={i === shown ? 5 : points.length > 60 ? 2 : 3.5}
            fill="var(--series-gym)"
            stroke="var(--surface-1)"
            strokeWidth={2}
          />
        ))}
      </svg>
      {injuries.length > 0 && (
        <div className="legend">
          <span>
            <svg width="14" height="10" aria-hidden="true">
              <rect width="14" height="10" fill="url(#injury-band)" />
            </svg>
            Injury / illness
          </span>
        </div>
      )}
    </div>
  )
}

export function Progress({ name }: { name?: string }) {
  const { doc } = useStore()
  const names = useMemo(() => exerciseNamesOf(doc.sessions), [doc.sessions])
  const selected = name ?? names[0]
  const series = useMemo(() => (selected ? exerciseSeries(doc.sessions, selected) : null), [doc.sessions, selected])

  return (
    <>
      <header className="topbar">
        <h1>Progress</h1>
      </header>
      {names.length === 0 ? (
        <p className="muted">Log some exercises to see progress.</p>
      ) : (
        <>
          <select aria-label="Exercise" value={selected} onChange={(e) => navigate('progress', e.target.value)}>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <div className="chips">
            {names.slice(0, 6).map((n) => (
              <a key={n} className="chip" href={href('progress', n)} aria-current={n === selected}>
                {n}
              </a>
            ))}
          </div>
          {series && series.points.length > 0 ? (
            <section className="card stack" aria-label={`${selected} progress`}>
              <h2>
                {selected} <span className="secondary small">· {METRIC_LABEL[series.metric]}</span>
              </h2>
              {series.points.length > 1 ? (
                <Chart points={series.points} metric={series.metric} injuries={doc.injuries} />
              ) : (
                <p className="muted">Only one session so far.</p>
              )}
              <details>
                <summary>Table ({series.points.length} sessions)</summary>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Work</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...series.points].reverse().map((p, i) => (
                      <tr key={i}>
                        <td>{p.date}</td>
                        <td>{p.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </section>
          ) : (
            <p className="muted">No sets logged for {selected}.</p>
          )}
        </>
      )}
    </>
  )
}
