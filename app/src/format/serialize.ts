import type { Exercise, Group, Injury, Item, LogDoc, Session, SetEntry, Weight } from './types'

export function formatClock(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

function formatMeasure(s: SetEntry): string {
  if (s.meters !== undefined) return `${s.meters}m`
  if (s.secs !== undefined) return `${s.secs}s`
  return String(s.reps ?? 0)
}

export function formatWeight(w: Weight | undefined): string {
  if (!w) return '0'
  if (w.mode === 'added') return `+${w.value}`
  if (w.mode === 'each') return `${w.value}ea`
  return String(w.value)
}

export function formatSets(sets: SetEntry[]): string {
  if (!sets.length) return ''
  const measures = sets.map(formatMeasure)
  let out =
    measures.every((m) => m === measures[0]) && sets[0].meters === undefined
      ? `${sets.length}x${measures[0]}`
      : measures.join(',')
  const weights = sets.map((s) => formatWeight(s.weight))
  if (weights.some((w) => w !== '0')) {
    out += '@' + (weights.every((w) => w === weights[0]) ? weights[0] : weights.join(','))
  }
  // Distance + time is only expressible for a single set.
  if (sets.length === 1 && sets[0].meters !== undefined && sets[0].secs !== undefined) {
    out += ` ${formatClock(sets[0].secs)}`
  }
  return out
}

const withNote = (s: string, note?: string) => (note !== undefined ? `${s} (${note})` : s)

export function serializeExercise(e: Exercise): string {
  const sets = formatSets(e.sets)
  return withNote(sets ? `${e.name} ${sets}` : e.name, e.note)
}

export const groupRounds = (g: Group) => Math.max(0, ...g.exercises.map((e) => e.sets.length))

function serializeGroup(g: Group): string[] {
  const rounds = groupRounds(g)
  const header = withNote(rounds ? `${g.label} x${rounds}` : g.label, g.note)
  return [`- ${header}`, ...g.exercises.map((e) => `  - ${serializeExercise(e)}`)]
}

function serializeItem(item: Item): string[] {
  if (item.kind === 'exercise') return [`- ${serializeExercise(item)}`]
  if (item.kind === 'group') return serializeGroup(item)
  return [item.text]
}

export function sessionHeader(s: Session): string {
  return s.location ? `## ${s.date} · ${s.location}` : `## ${s.date}`
}

export function serializeSession(s: Session): string {
  return [sessionHeader(s), ...s.items.flatMap(serializeItem)].join('\n') + '\n'
}

const serializeInjury = (i: Injury) => `- ${i.start}..${i.end ?? ''} ${i.description}`

export function serializeLog(doc: LogDoc): string {
  let out = doc.head.length ? doc.head.join('\n') + '\n\n' : ''
  out += '# Injuries\n'
  for (const i of doc.injuries) out += serializeInjury(i) + '\n'
  for (const raw of doc.injuryRaw) out += raw + '\n'
  out += '\n# Log\n'
  for (const s of doc.sessions) out += '\n' + serializeSession(s)
  return out
}
