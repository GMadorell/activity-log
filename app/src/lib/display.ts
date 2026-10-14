import { formatClock, formatSets, serializeExercise } from '../format/serialize'
import type { Item, Session } from '../format/types'
import { daysBetween } from './stats'

export const clock = (secs: number) => formatClock(Math.max(0, Math.round(secs)))

export function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function sessionTitle(s: Session): string {
  const names = s.items.flatMap((i) =>
    i.kind === 'exercise' ? [i.name] : i.kind === 'group' ? [i.exercises.map((e) => e.name).join(' + ')] : [],
  )
  const text = s.items.find((i) => i.kind === 'text')
  const title = names.length ? names.join(', ') : text?.kind === 'text' ? text.text : 'Session'
  return s.location ? `${title} · ${s.location}` : title
}

/** One line per item: "Squat 5x5@65", "Superset: Pull-up 3x8 + Dip 3x10", or a note. */
export function itemLine(item: Item): string {
  if (item.kind === 'exercise') return serializeExercise(item)
  if (item.kind === 'group') {
    return `${item.label}: ${item.exercises.map((e) => `${e.name} ${formatSets(e.sets)}`.trim()).join(' + ')}`
  }
  return item.text
}

/** "today", "yesterday", "5 days ago", "3 weeks ago", "4 months ago". */
export function ago(iso: string, today?: string): string {
  const n = daysBetween(iso, today)
  if (n <= 0) return 'today'
  if (n === 1) return 'yesterday'
  if (n < 14) return `${n} days ago`
  if (n < 60) return `${Math.round(n / 7)} weeks ago`
  if (n < 730) return `${Math.round(n / 30.44)} months ago`
  return `${Math.round(n / 365.25)} years ago`
}
