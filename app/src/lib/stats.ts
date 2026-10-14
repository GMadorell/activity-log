import type { Exercise, Injury, Session } from '../format/types'

export function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export const todayISO = () => isoDate(new Date())

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return isoDate(new Date(y, m - 1, d + n))
}

export const isGym = (s: Session) => s.items.some((i) => i.kind !== 'text')

export function exercisesOf(s: Session): Exercise[] {
  return s.items.flatMap((i) => (i.kind === 'exercise' ? [i] : i.kind === 'group' ? i.exercises : []))
}

/** Unique values, most recent first (sessions are newest first). */
function uniqueRecent(values: string[]): string[] {
  const seen = new Map<string, string>()
  for (const v of values) {
    const key = v.toLowerCase()
    if (!seen.has(key)) seen.set(key, v)
  }
  return [...seen.values()]
}

export const locationsOf = (sessions: Session[]) =>
  uniqueRecent(sessions.flatMap((s) => (s.location ? [s.location] : [])))

export const lastLocation = (sessions: Session[]) => sessions.find((s) => s.location)?.location

export const exerciseNamesOf = (sessions: Session[]) =>
  uniqueRecent(sessions.flatMap((s) => exercisesOf(s).map((e) => e.name)))

export type DayKind = 'gym' | 'activity'

/** date -> what was done; gym wins if both on one day. */
export function dayKinds(sessions: Session[]): Map<string, DayKind> {
  const days = new Map<string, DayKind>()
  for (const s of sessions) {
    if (isGym(s)) days.set(s.date, 'gym')
    else if (!days.has(s.date)) days.set(s.date, 'activity')
  }
  return days
}

export function injuryOn(injuries: Injury[], date: string, today = todayISO()): Injury | undefined {
  return injuries.find((i) => i.start <= date && date <= (i.end ?? today))
}

export type Metric = 'weight' | 'reps' | 'secs' | 'meters'

export interface Point {
  date: string
  value: number
  label: string
}

export function metricFor(e: Exercise): Metric {
  if (e.sets.some((s) => s.weight)) return 'weight'
  if (e.sets.some((s) => s.meters !== undefined)) return 'meters'
  if (e.sets.some((s) => s.secs !== undefined)) return 'secs'
  return 'reps'
}

function valueOf(e: Exercise, metric: Metric): number {
  const vals = e.sets.map((s) =>
    metric === 'weight'
      ? (s.weight?.value ?? 0)
      : metric === 'meters'
        ? (s.meters ?? 0)
        : metric === 'secs'
          ? (s.secs ?? 0)
          : (s.reps ?? 0),
  )
  return Math.max(0, ...vals)
}

/**
 * Per-session best for one exercise, oldest first. Metric = weight if it was
 * ever loaded, else best reps / time / distance. Rowing (distance+time) charts time.
 */
export function exerciseSeries(sessions: Session[], name: string): { metric: Metric; points: Point[] } {
  const key = name.toLowerCase()
  const hits: { date: string; e: Exercise }[] = []
  for (const s of sessions) {
    for (const e of exercisesOf(s)) if (e.name.toLowerCase() === key && e.sets.length) hits.push({ date: s.date, e })
  }
  hits.reverse()
  const metrics = new Set(hits.map((h) => metricFor(h.e)))
  let metric: Metric = metrics.has('weight')
    ? 'weight'
    : metrics.has('meters')
      ? 'meters'
      : metrics.has('secs')
        ? 'secs'
        : 'reps'
  if (metric === 'meters' && hits.every((h) => h.e.sets.length === 1 && h.e.sets[0].secs !== undefined)) metric = 'secs'
  const points = hits
    .map(({ date, e }) => ({ date, value: valueOf(e, metric), label: summarize(e) }))
    .filter((p) => p.value > 0)
  return { metric, points }
}

function summarize(e: Exercise): string {
  const sets = e.sets
  const reps = sets.map((s) => s.reps ?? s.secs ?? s.meters ?? 0)
  const same = reps.every((r) => r === reps[0])
  const unit =
    sets[0].secs !== undefined && sets[0].meters === undefined ? 's' : sets[0].meters !== undefined ? 'm' : ''
  const body = same ? `${sets.length}×${reps[0]}${unit}` : reps.map((r) => `${r}${unit}`).join(',')
  const w = Math.max(0, ...sets.map((s) => s.weight?.value ?? 0))
  const mode = sets.find((s) => s.weight)?.weight?.mode
  return w ? `${body} @ ${mode === 'added' ? '+' : ''}${w}kg${mode === 'each' ? ' each' : ''}` : body
}

export interface SessionFilter {
  kind?: 'gym' | 'activity'
  location?: string
  exercise?: string
  day?: string
  query?: string
}

/** Sessions matching every given criterion; names and locations compare case-insensitively. */
export function filterSessions(sessions: Session[], f: SessionFilter, text: (s: Session) => string): Session[] {
  const eq = (a: string | undefined, b: string) => a?.toLowerCase() === b.toLowerCase()
  const q = f.query?.trim().toLowerCase()
  return sessions.filter(
    (s) =>
      (!f.kind || (f.kind === 'gym') === isGym(s)) &&
      (!f.location || eq(s.location, f.location)) &&
      (!f.exercise || exercisesOf(s).some((e) => eq(e.name, f.exercise!))) &&
      (!f.day || s.date === f.day) &&
      (!q || text(s).toLowerCase().includes(q)),
  )
}

/** Whole days from `iso` to `today` (both local dates). */
export function daysBetween(iso: string, today = todayISO()): number {
  const [ya, ma, da] = iso.split('-').map(Number)
  const [yb, mb, db] = today.split('-').map(Number)
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000)
}
