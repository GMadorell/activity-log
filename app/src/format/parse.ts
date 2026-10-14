import type { Exercise, Group, Injury, Item, LogDoc, ParseResult, Session, SetEntry, Weight } from './types'

const EXERCISE_RE = /^(?<name>.+?)(?:\s+(?<spec>\d[^\s(]*)(?:\s+(?<time>\d+:\d{2}))?)?(?:\s+\((?<note>[^)]*)\))?$/
const GROUP_HEADER_RE = /^(?<label>.+?)(?:\s+x\d+)?(?:\s+\((?<note>[^)]*)\))?$/
const SESSION_RE = /^##\s+(?<date>\d{4}-\d{2}-\d{2})(?:\s*[·|@-]\s*(?<location>.+?))?\s*$/
const INJURY_RE = /^-\s+(?<start>\d{4}-\d{2}-\d{2})\.\.(?<end>\d{4}-\d{2}-\d{2})?\s+(?<desc>.+)$/
const MEASURE_RE = /^(?:(?<count>\d+)x)?(?<measure>.+)$/
const WEIGHT_RE = /^(?<added>\+)?(?<value>\d+(?:\.\d+)?)(?<each>ea)?$/

export function parseClock(s: string): number | undefined {
  const m = /^(\d+):(\d{2})$/.exec(s)
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined
}

function parseMeasure(s: string): SetEntry | null {
  if (/^\d+$/.test(s)) return { reps: Number(s) }
  const secs = /^(\d+)s$/.exec(s)
  if (secs) return { secs: Number(secs[1]) }
  const clock = parseClock(s)
  if (clock !== undefined) return { secs: clock }
  const dist = /^(\d+(?:\.\d+)?)(m|km)$/.exec(s)
  if (dist) return { meters: Math.round(Number(dist[1]) * (dist[2] === 'km' ? 1000 : 1)) }
  return null
}

function parseWeight(s: string): Weight | undefined | null {
  const m = WEIGHT_RE.exec(s)
  if (!m?.groups) return null
  const value = Number(m.groups.value)
  if (m.groups.added) return { value, mode: 'added' }
  if (m.groups.each) return { value, mode: 'each' }
  // "@0" = bodyweight, the old log used it.
  return value === 0 ? undefined : { value, mode: 'total' }
}

function parseSets(spec: string, time: string | undefined): SetEntry[] | null {
  const [setsPart, weightPart, ...rest] = spec.split('@')
  if (rest.length) return null
  const sets: SetEntry[] = []
  for (const group of setsPart.split(',')) {
    const m = MEASURE_RE.exec(group)
    const measure = m?.groups && parseMeasure(m.groups.measure)
    if (!measure) return null
    const count = m.groups?.count ? Number(m.groups.count) : 1
    for (let i = 0; i < count; i++) sets.push({ ...measure })
  }
  if (time !== undefined) {
    if (sets.length !== 1 || sets[0].meters === undefined) return null
    sets[0].secs = parseClock(time)
  }
  if (weightPart === undefined) return sets
  const weights = weightPart.split(',').map(parseWeight)
  if (weights.some((w) => w === null)) return null
  if (weights.length !== 1 && weights.length !== sets.length) return null
  return sets.map((s, i) => {
    const w = weights.length === 1 ? weights[0] : weights[i]
    return w ? { ...s, weight: { ...w } } : s
  })
}

/** Parses an exercise line without the leading "- ". Null if malformed. */
export function parseExercise(line: string): Exercise | null {
  const m = EXERCISE_RE.exec(line.trim())
  if (!m?.groups) return null
  const { name, spec, time, note } = m.groups
  const sets = spec ? parseSets(spec, time) : []
  if (!sets) return null
  const ex: Exercise = { kind: 'exercise', name, sets }
  if (note !== undefined) ex.note = note
  return ex
}

function parseGroupHeader(line: string, children: Exercise[]): Group {
  const m = GROUP_HEADER_RE.exec(line.trim())
  const group: Group = { kind: 'group', label: m?.groups?.label ?? line.trim(), exercises: children }
  if (m?.groups?.note !== undefined) group.note = m.groups.note
  return group
}

const isIndentedItem = (l: string) => /^\s+-\s/.test(l)
const isItem = (l: string) => l.startsWith('- ')

export function parseItems(lines: string[], warnings: string[], ctx: string): Item[] {
  const items: Item[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    if (isItem(line) && i + 1 < lines.length && isIndentedItem(lines[i + 1])) {
      const children: Exercise[] = []
      while (i + 1 < lines.length && isIndentedItem(lines[i + 1])) {
        const raw = lines[++i].trim().slice(2)
        const child = parseExercise(raw)
        if (!child) warnings.push(`${ctx}: could not parse "${raw}"`)
        children.push(child ?? { kind: 'exercise', name: raw, sets: [] })
      }
      items.push(parseGroupHeader(line.slice(2), children))
    } else if (isItem(line)) {
      const ex = parseExercise(line.slice(2))
      if (!ex) warnings.push(`${ctx}: could not parse "${line}"`)
      items.push(ex ?? { kind: 'text', text: line })
    } else {
      items.push({ kind: 'text', text: line.trim() })
    }
  }
  return items
}

type Section = 'head' | 'injuries' | 'log'

export function parseLog(text: string): ParseResult {
  const warnings: string[] = []
  const doc: LogDoc = { head: [], injuries: [], injuryRaw: [], sessions: [] }
  let section: Section = 'head'
  let current: { session: Session; lines: string[] } | null = null

  const flush = () => {
    if (!current) return
    current.session.items = parseItems(current.lines, warnings, current.session.date)
    doc.sessions.push(current.session)
    current = null
  }

  for (const line of text.split(/\r?\n/)) {
    const heading = /^#\s+(.+?)\s*$/.exec(line)?.[1]?.toLowerCase()
    if (heading === 'injuries' || heading === 'log') {
      flush()
      section = heading
      continue
    }
    if (section === 'head') {
      doc.head.push(line)
    } else if (section === 'injuries') {
      if (!line.trim()) continue
      const m = INJURY_RE.exec(line.trim())
      if (m?.groups) {
        const injury: Injury = { start: m.groups.start, description: m.groups.desc }
        if (m.groups.end) injury.end = m.groups.end
        doc.injuries.push(injury)
      } else {
        warnings.push(`Injuries: could not parse "${line}"`)
        doc.injuryRaw.push(line)
      }
    } else {
      const m = SESSION_RE.exec(line)
      if (m?.groups) {
        flush()
        const session: Session = { date: m.groups.date, items: [] }
        if (m.groups.location) session.location = m.groups.location
        current = { session, lines: [] }
      } else if (current) {
        current.lines.push(line)
      } else if (line.trim()) {
        warnings.push(`Log: line outside a session moved to top: "${line}"`)
        doc.head.push(line)
      }
    }
  }
  flush()
  while (doc.head.length && !doc.head[doc.head.length - 1].trim()) doc.head.pop()
  return { doc, warnings }
}
