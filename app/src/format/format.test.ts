import { describe, expect, it } from 'vitest'
import { parseExercise, parseLog } from './parse'
import { serializeExercise, serializeLog } from './serialize'
import type { Exercise } from './types'

const ex = (line: string) => {
  const r = parseExercise(line)
  if (!r) throw new Error(`unparsed: ${line}`)
  return r
}

describe('parseExercise', () => {
  it('uniform reps with total weight', () => {
    expect(ex('Barbell Squat 5x5@65')).toEqual({
      kind: 'exercise',
      name: 'Barbell Squat',
      sets: Array(5).fill({ reps: 5, weight: { value: 65, mode: 'total' } }),
    })
  })

  it('bodyweight reps', () => {
    expect(ex('Pull-up 4x9').sets).toEqual(Array(4).fill({ reps: 9 }))
  })

  it('per-hand and decimal weight', () => {
    expect(ex('Dumbbell Bench Press 5x5@22.5ea').sets[0]).toEqual({
      reps: 5,
      weight: { value: 22.5, mode: 'each' },
    })
  })

  it('added weight', () => {
    expect(ex('Weighted Pull-up 3x5@+10').sets[2]).toEqual({
      reps: 5,
      weight: { value: 10, mode: 'added' },
    })
  })

  it('per-set reps list', () => {
    expect(ex('Pull-up 8,8,8,7,6').sets.map((s) => s.reps)).toEqual([8, 8, 8, 7, 6])
  })

  it('mixed run syntax', () => {
    expect(ex('Pull-up 4x8,6').sets.map((s) => s.reps)).toEqual([8, 8, 8, 8, 6])
  })

  it('per-set weights', () => {
    expect(ex('Barbell Deadlift 3x5@60,65,70').sets.map((s) => s.weight?.value)).toEqual([60, 65, 70])
  })

  it('timed sets in seconds and m:ss', () => {
    expect(ex('Farmer Carry Hold 4x60s@30ea').sets[0]).toEqual({
      secs: 60,
      weight: { value: 30, mode: 'each' },
    })
    expect(ex('Plank 2x1:30').sets).toEqual([{ secs: 90 }, { secs: 90 }])
  })

  it('distance with time', () => {
    expect(ex('Row 1000m 3:50').sets).toEqual([{ meters: 1000, secs: 230 }])
    expect(ex('Run 5km 25:00').sets).toEqual([{ meters: 5000, secs: 1500 }])
  })

  it('trailing note', () => {
    const e = ex('Chin-up 5x5 (tempo)')
    expect(e.note).toBe('tempo')
    expect(e.sets).toHaveLength(5)
  })

  it('exercise without sets', () => {
    expect(ex('Tabata')).toEqual({ kind: 'exercise', name: 'Tabata', sets: [] })
  })

  it('weight count mismatch is unparseable', () => {
    expect(parseExercise('Squat 3x5@60,65')).toBeNull()
  })
})

describe('serializeExercise', () => {
  const cases = [
    'Barbell Squat 5x5@65',
    'Pull-up 4x9',
    'Dumbbell Bench Press 5x5@22.5ea',
    'Weighted Pull-up 3x5@+10',
    'Pull-up 8,8,8,7,6',
    'Barbell Deadlift 3x5@60,65,70',
    'Farmer Carry Hold 4x60s@30ea',
    'Row 1000m 3:50',
    'Chin-up 5x5 (tempo)',
    'Tabata',
    'Pull-up 1x10',
  ]
  it.each(cases)('round-trips %s', (line) => {
    expect(serializeExercise(ex(line))).toBe(line)
  })

  it('canonicalizes mixed run syntax', () => {
    expect(serializeExercise(ex('Pull-up 4x8,6'))).toBe('Pull-up 8,8,8,8,6')
  })

  it('mixed reps with constant weight', () => {
    const e: Exercise = {
      kind: 'exercise',
      name: 'Squat',
      sets: [
        { reps: 5, weight: { value: 60, mode: 'total' } },
        { reps: 4, weight: { value: 60, mode: 'total' } },
      ],
    }
    expect(serializeExercise(e)).toBe('Squat 5,4@60')
  })
})

const SAMPLE = `# Injuries
- 2026-06-02..2026-07-09 Sprained ankle
- 2026-10-01.. Knee pain

# Log

## 2026-10-13 · Downtown
- Pull-up 4x9
- Barbell Squat 5x5@65
- Farmer Carry Hold 4x60s@30ea

## 2026-09-14
Football with friends

## 2026-09-07 · Uptown
- Pull-up 8,8,8,7,6
- Superset x4
  - Pull-up 4x4
  - Dip 4x4
- Row 1000m 3:50
Back felt off
`

describe('parseLog', () => {
  const { doc, warnings } = parseLog(SAMPLE)

  it('no warnings for valid file', () => {
    expect(warnings).toEqual([])
  })

  it('parses injuries incl. open-ended', () => {
    expect(doc.injuries).toEqual([
      { start: '2026-06-02', end: '2026-07-09', description: 'Sprained ankle' },
      { start: '2026-10-01', description: 'Knee pain' },
    ])
  })

  it('parses sessions with location', () => {
    expect(doc.sessions.map((s) => [s.date, s.location])).toEqual([
      ['2026-10-13', 'Downtown'],
      ['2026-09-14', undefined],
      ['2026-09-07', 'Uptown'],
    ])
  })

  it('activity session is text', () => {
    expect(doc.sessions[1].items).toEqual([{ kind: 'text', text: 'Football with friends' }])
  })

  it('parses groups', () => {
    const g = doc.sessions[2].items[1]
    expect(g.kind).toBe('group')
    if (g.kind !== 'group') return
    expect(g.label).toBe('Superset')
    expect(g.exercises.map((e) => [e.name, e.sets.length])).toEqual([
      ['Pull-up', 4],
      ['Dip', 4],
    ])
  })

  it('round-trips canonical file', () => {
    expect(serializeLog(doc)).toBe(SAMPLE)
  })

  it('keeps unparseable lines as text with a warning', () => {
    const r = parseLog('# Log\n\n## 2026-01-01\n- Squat 3x5@60,65\n')
    expect(r.doc.sessions[0].items).toEqual([{ kind: 'text', text: '- Squat 3x5@60,65' }])
    expect(r.warnings).toHaveLength(1)
  })

  it('preserves head and bad injury lines', () => {
    const text = 'Some intro\n\n# Injuries\n- sometime Broken toe\n\n# Log\n'
    const r = parseLog(text)
    expect(r.doc.head).toEqual(['Some intro'])
    expect(r.doc.injuryRaw).toEqual(['- sometime Broken toe'])
    expect(serializeLog(r.doc)).toBe(text)
  })

  it('same date sessions both kept', () => {
    const r = parseLog('# Log\n\n## 2026-01-01\nRun\n\n## 2026-01-01 · Gym\n- Dip 3x5\n')
    expect(r.doc.sessions).toHaveLength(2)
  })

  it('empty file', () => {
    const r = parseLog('')
    expect(r.doc.sessions).toEqual([])
    expect(serializeLog(r.doc)).toBe('# Injuries\n\n# Log\n')
  })
})
