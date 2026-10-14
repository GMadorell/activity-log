export type WeightMode = 'total' | 'each' | 'added'

export interface Weight {
  value: number
  mode: WeightMode
}

/** One performed set. At least one of reps/secs/meters is set. */
export interface SetEntry {
  reps?: number
  secs?: number
  meters?: number
  weight?: Weight
}

export interface Exercise {
  kind: 'exercise'
  name: string
  sets: SetEntry[]
  note?: string
}

/** Superset / circuit: exercises sharing rounds. Child set i = round i. */
export interface Group {
  kind: 'group'
  label: string
  exercises: Exercise[]
  note?: string
}

export interface Text {
  kind: 'text'
  text: string
}

export type Item = Exercise | Group | Text

export interface Session {
  /** YYYY-MM-DD */
  date: string
  location?: string
  items: Item[]
}

export interface Injury {
  start: string
  /** Undefined = ongoing. */
  end?: string
  description: string
}

export interface LogDoc {
  /** Lines before the first known section, kept verbatim. */
  head: string[]
  injuries: Injury[]
  /** Unparseable injury lines, kept verbatim. */
  injuryRaw: string[]
  /** Newest first. */
  sessions: Session[]
}

export interface ParseResult {
  doc: LogDoc
  warnings: string[]
}
