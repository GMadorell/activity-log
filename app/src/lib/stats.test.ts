import { describe, expect, it } from 'vitest'
import { parseLog } from '../format/parse'
import {
  addDays,
  dayKinds,
  daysBetween,
  filterSessions,
  exerciseNamesOf,
  exerciseSeries,
  injuryOn,
  lastLocation,
  locationsOf,
} from './stats'

const { doc } = parseLog(`# Injuries
- 2026-06-01..2026-06-10 Knee
- 2026-10-01.. Wrist

# Log

## 2026-10-13 · Downtown
- Pull-up 4x9
- Barbell Squat 5x5@65

## 2026-10-13
Football

## 2026-10-10
Hike

## 2026-10-08 · park
- pull-up 8,8,7
- Rowing Machine 1000m 3:50

## 2026-10-01 · Park
- Barbell Squat 5x5@60
- Rowing Machine 1000m 3:57
`)

describe('stats', () => {
  it('addDays crosses months', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('no data -> no locations and no default', () => {
    expect(locationsOf([])).toEqual([])
    expect(lastLocation([])).toBeUndefined()
  })
  it('locations unique, recent first, case-insensitive', () => {
    expect(locationsOf(doc.sessions)).toEqual(['Downtown', 'park'])
    expect(lastLocation(doc.sessions)).toBe('Downtown')
  })

  it('exercise names unique by recency', () => {
    expect(exerciseNamesOf(doc.sessions)).toEqual(['Pull-up', 'Barbell Squat', 'Rowing Machine'])
  })

  it('day kinds: gym wins on mixed days', () => {
    const k = dayKinds(doc.sessions)
    expect(k.get('2026-10-13')).toBe('gym')
    expect(k.get('2026-10-10')).toBe('activity')
    expect(k.get('2026-10-11')).toBeUndefined()
  })

  it('injury lookup incl. open-ended', () => {
    expect(injuryOn(doc.injuries, '2026-06-05')?.description).toBe('Knee')
    expect(injuryOn(doc.injuries, '2026-06-11')).toBeUndefined()
    expect(injuryOn(doc.injuries, '2026-10-12', '2026-10-14')?.description).toBe('Wrist')
  })

  it('series: weight, oldest first', () => {
    const s = exerciseSeries(doc.sessions, 'barbell squat')
    expect(s.metric).toBe('weight')
    expect(s.points.map((p) => [p.date, p.value, p.label])).toEqual([
      ['2026-10-01', 60, '5×5 @ 60kg'],
      ['2026-10-13', 65, '5×5 @ 65kg'],
    ])
  })

  it('series: bodyweight uses best reps', () => {
    const s = exerciseSeries(doc.sessions, 'Pull-up')
    expect(s.metric).toBe('reps')
    expect(s.points.map((p) => p.value)).toEqual([8, 9])
  })

  it('series: rowing charts time', () => {
    const s = exerciseSeries(doc.sessions, 'Rowing Machine')
    expect(s.metric).toBe('secs')
    expect(s.points.map((p) => p.value)).toEqual([237, 230])
  })
})

describe('filterSessions', () => {
  const titles = (f: Parameters<typeof filterSessions>[1]) =>
    filterSessions(doc.sessions, f, (s) => s.items.map((i) => (i.kind === 'text' ? i.text : '')).join(' ')).map(
      (s) => s.date,
    )
  it('no criteria keeps all', () => expect(titles({})).toHaveLength(doc.sessions.length))
  it('by kind', () => {
    expect(titles({ kind: 'activity' })).toEqual(['2026-10-13', '2026-10-10'])
    expect(titles({ kind: 'gym' })).not.toContain('2026-10-10')
  })
  it('by location, exercise and day, case-insensitive', () => {
    expect(titles({ location: 'downtown', exercise: 'pull-up' })).toEqual(['2026-10-13'])
    expect(titles({ day: '2026-10-10' })).toEqual(['2026-10-10'])
  })
  it('by text query', () => expect(titles({ query: 'FOOT' })).toEqual(['2026-10-13']))
})

describe('daysBetween', () => {
  it('counts calendar days across months', () => {
    expect(daysBetween('2026-10-14', '2026-10-14')).toBe(0)
    expect(daysBetween('2026-09-30', '2026-10-02')).toBe(2)
  })
})
