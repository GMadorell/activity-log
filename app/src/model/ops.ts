import { serializeSession } from '../format/serialize'
import { parseLog } from '../format/parse'
import type { Injury, LogDoc, Session } from '../format/types'

/**
 * A pending change. Ops are replayed on top of the latest remote file at save
 * time, so edits made elsewhere (other device, GitHub web) are never clobbered.
 * Existing entries are matched by content, not index.
 */
export type Op =
  | { type: 'addSession'; session: Session }
  | { type: 'replaceSession'; before: Session; after: Session | null }
  | { type: 'addInjury'; injury: Injury }
  | { type: 'replaceInjury'; before: Injury; after: Injury | null }

export class OpConflictError extends Error {}

const sameSession = (a: Session, b: Session) => serializeSession(a) === serializeSession(b)
const sameInjury = (a: Injury, b: Injury) => a.start === b.start && a.end === b.end && a.description === b.description

/** Newest first; a new session goes above existing ones on the same date. */
function insertSession(sessions: Session[], s: Session): Session[] {
  const i = sessions.findIndex((x) => x.date <= s.date)
  return i < 0 ? [...sessions, s] : [...sessions.slice(0, i), s, ...sessions.slice(i)]
}

export function applyOp(doc: LogDoc, op: Op): LogDoc {
  switch (op.type) {
    case 'addSession':
      return { ...doc, sessions: insertSession(doc.sessions, op.session) }
    case 'replaceSession': {
      const i = doc.sessions.findIndex((s) => sameSession(s, op.before))
      if (i < 0) throw new OpConflictError(`Session ${op.before.date} was changed elsewhere`)
      const rest = doc.sessions.filter((_, j) => j !== i)
      if (!op.after) return { ...doc, sessions: rest }
      // Keep position when the date is unchanged, so same-day order is stable.
      if (op.after.date === op.before.date) {
        const sessions = [...doc.sessions]
        sessions[i] = op.after
        return { ...doc, sessions }
      }
      return { ...doc, sessions: insertSession(rest, op.after) }
    }
    case 'addInjury':
      return { ...doc, injuries: sortInjuries([...doc.injuries, op.injury]) }
    case 'replaceInjury': {
      const i = doc.injuries.findIndex((x) => sameInjury(x, op.before))
      if (i < 0) throw new OpConflictError(`Injury "${op.before.description}" was changed elsewhere`)
      const rest = doc.injuries.filter((_, j) => j !== i)
      return { ...doc, injuries: sortInjuries(op.after ? [...rest, op.after] : rest) }
    }
  }
}

const sortInjuries = (xs: Injury[]) => [...xs].sort((a, b) => b.start.localeCompare(a.start))

export const applyOps = (doc: LogDoc, ops: Op[]) => ops.reduce(applyOp, doc)

export function describeOps(ops: Op[]): string {
  if (ops.length === 1) {
    const op = ops[0]
    if (op.type === 'addSession') return `Log ${op.session.date}`
    if (op.type === 'replaceSession') return op.after ? `Edit ${op.before.date}` : `Delete ${op.before.date}`
    if (op.type === 'addInjury') return `Injury: ${op.injury.description}`
    return op.after ? `Update injury: ${op.before.description}` : `Delete injury: ${op.before.description}`
  }
  return `${ops.length} changes`
}

/** Throws if the session would not survive a write/read cycle unchanged (e.g. odd exercise names). */
export function assertRoundTrips(s: Session): void {
  const text = serializeSession(s)
  const { doc, warnings } = parseLog(`# Log\n\n${text}`)
  const back = doc.sessions.length === 1 ? serializeSession(doc.sessions[0]) : ''
  if (warnings.length || back !== text) {
    throw new Error(`Session ${s.date} cannot be written safely:\n${warnings.join('\n') || text}`)
  }
}
