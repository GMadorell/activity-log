import type { Exercise, Group, Item, Session, SetEntry, Weight } from '../format/types'

/** What one set should look like. Exactly one of reps/secs/meters drives it. */
export interface Target {
  reps?: number
  secs?: number
  meters?: number
  weight?: Weight
}

export interface DraftExercise {
  name: string
  plannedSets: number
  target: Target
  done: SetEntry[]
  note?: string
}

export type DraftBlock =
  | ({ kind: 'exercise' } & DraftExercise)
  | { kind: 'group'; label: string; plannedRounds: number; exercises: DraftExercise[] }

export interface Draft {
  date: string
  location?: string
  kind: 'gym' | 'activity'
  /** Gym only: 'plan' edits exercises and targets; 'work' runs sets and the stopwatch. */
  phase: 'plan' | 'work'
  /** Activity description, or extra session notes for gym. */
  text: string
  blocks: DraftBlock[]
  active: number
  /** Epoch ms of the last completed set; drives the stopwatch. */
  lastSetAt?: number
}

export function emptyDraft(date: string, location?: string): Draft {
  return { date, location, kind: 'gym', phase: 'plan', text: '', blocks: [], active: 0 }
}

/** Most common value; ties go to the earliest. */
function mode<T>(xs: T[]): T | undefined {
  const counts = new Map<T, number>()
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1)
  let best: T | undefined
  let n = 0
  for (const [x, c] of counts) if (c > n) [best, n] = [x, c]
  return best
}

function maxWeight(sets: SetEntry[]): Weight | undefined {
  return sets.reduce<Weight | undefined>(
    (best, s) => (s.weight && (!best || s.weight.value > best.value) ? s.weight : best),
    undefined,
  )
}

/** Plan derived from a past exercise: same set count, typical reps, top weight. */
export function planFrom(e: Exercise): DraftExercise {
  const sets = e.sets
  const target: Target = {}
  const s0 = sets[0]
  if (s0?.meters !== undefined) {
    target.meters = s0.meters
    if (s0.secs !== undefined) target.secs = s0.secs
  } else if (s0?.secs !== undefined) target.secs = mode(sets.map((s) => s.secs!))
  else target.reps = mode(sets.map((s) => s.reps ?? 0)) ?? 5
  const w = maxWeight(sets)
  if (w) target.weight = { ...w }
  return { name: e.name, plannedSets: sets.length || 3, target, done: [] }
}

export function blankExercise(name: string): DraftExercise {
  return { name, plannedSets: 5, target: { reps: 5 }, done: [] }
}

/** Latest occurrence of an exercise, searching groups too. Sessions newest first. */
export function lastExercise(sessions: Session[], name: string): Exercise | undefined {
  const key = name.trim().toLowerCase()
  for (const s of sessions) {
    for (const item of s.items) {
      const candidates = item.kind === 'exercise' ? [item] : item.kind === 'group' ? item.exercises : []
      const hit = candidates.find((e) => e.name.toLowerCase() === key && e.sets.length)
      if (hit) return hit
    }
  }
  return undefined
}

export const planFor = (sessions: Session[], name: string): DraftExercise => {
  const last = lastExercise(sessions, name)
  return last ? { ...planFrom(last), name: name.trim() } : blankExercise(name.trim())
}

/**
 * Draft that repeats a past session's structure. Loads come from the most
 * recent time each exercise was done (`history`, newest first) when given.
 */
export function draftFromSession(s: Session, date: string, location?: string, history?: Session[]): Draft {
  const plan = (e: Exercise) =>
    history ? { ...planFrom(lastExercise(history, e.name) ?? e), name: e.name } : planFrom(e)
  const blocks: DraftBlock[] = []
  const notes: string[] = []
  for (const item of s.items) {
    if (item.kind === 'exercise') blocks.push({ kind: 'exercise', ...plan(item) })
    else if (item.kind === 'group') {
      const exercises = item.exercises.map(plan)
      blocks.push({
        kind: 'group',
        label: item.label,
        plannedRounds: Math.max(1, ...exercises.map((e) => e.plannedSets)),
        exercises,
      })
    } else notes.push(item.text)
  }
  const kind = blocks.length ? 'gym' : 'activity'
  return {
    date,
    location: location ?? s.location,
    kind,
    phase: 'plan',
    text: kind === 'activity' ? notes.join('\n') : '',
    blocks,
    active: 0,
  }
}

/** A set as performed from the target; reps/secs/meters/weight are what the user confirmed. */
export function setFromTarget(t: Target): SetEntry {
  const s: SetEntry = {}
  if (t.reps !== undefined) s.reps = t.reps
  if (t.secs !== undefined) s.secs = t.secs
  if (t.meters !== undefined) s.meters = t.meters
  if (t.weight && t.weight.value > 0) s.weight = { ...t.weight }
  return s
}

export const blockDone = (b: DraftBlock) =>
  b.kind === 'exercise' ? b.done.length : Math.max(0, ...b.exercises.map((e) => e.done.length))

export const blockPlanned = (b: DraftBlock) => (b.kind === 'exercise' ? b.plannedSets : b.plannedRounds)

export const blockName = (b: DraftBlock) =>
  b.kind === 'exercise' ? b.name : `${b.label}: ${b.exercises.map((e) => e.name).join(' + ')}`

const toExercise = (e: DraftExercise): Exercise => {
  const ex: Exercise = { kind: 'exercise', name: e.name, sets: e.done }
  if (e.note) ex.note = e.note
  return ex
}

/** Only performed work is logged; untouched exercises are dropped. */
export function draftToSession(d: Draft): Session {
  const items: Item[] = []
  if (d.kind === 'gym') {
    for (const b of d.blocks) {
      if (b.kind === 'exercise') {
        if (b.done.length) items.push(toExercise(b))
      } else {
        const exercises = b.exercises.filter((e) => e.done.length).map(toExercise)
        if (exercises.length) items.push({ kind: 'group', label: b.label, exercises } satisfies Group)
      }
    }
  }
  for (const line of d.text.split('\n')) {
    // Leading "-" or "#" would turn a note into an exercise or heading.
    const text = line.trim().replace(/^[-#\s]+/, '')
    if (text) items.push({ kind: 'text', text })
  }
  const s: Session = { date: d.date, items }
  if (d.location?.trim()) s.location = d.location.trim()
  return s
}

export const draftIsEmpty = (d: Draft) => draftToSession(d).items.length === 0

export type Measure = 'reps' | 'secs' | 'meters'

export const measureOf = (t: Target): Measure =>
  t.meters !== undefined ? 'meters' : t.secs !== undefined ? 'secs' : 'reps'

export function withMeasure(t: Target, m: Measure): Target {
  if (m === 'reps') return { reps: t.reps ?? 5, weight: t.weight }
  if (m === 'secs') return { secs: t.secs ?? 60, weight: t.weight }
  return { meters: t.meters ?? 1000, secs: t.secs ?? 240 }
}
