import { describe, expect, it } from 'vitest'
import { parseExercise, parseLog } from '../format/parse'
import { serializeLog, serializeSession } from '../format/serialize'
import type { Exercise, Session } from '../format/types'
import { draftFromSession, draftToSession, emptyDraft, planFor, planFrom, setFromTarget } from './draft'
import { applyOp, applyOps, assertRoundTrips, OpConflictError } from './ops'

const doc = (text: string) => parseLog(text).doc
const BASE = doc(`# Injuries
- 2026-06-01..2026-06-10 Knee

# Log

## 2026-10-13 · Downtown
- Pull-up 4x9
- Barbell Squat 5x5@65

## 2026-10-08 · Downtown
- Dip 4x8
- Barbell Squat 5,5,4@60,62.5,62.5
`)
const ex = (line: string) => parseExercise(line) as Exercise
const session = (date: string, ...lines: string[]): Session => ({
  date,
  items: lines.map((l) => (l.startsWith('- ') ? ex(l.slice(2)) : { kind: 'text', text: l })),
})

describe('ops', () => {
  it('adds session in date order, newest first', () => {
    const d = applyOp(BASE, { type: 'addSession', session: session('2026-10-10', 'Football') })
    expect(d.sessions.map((s) => s.date)).toEqual(['2026-10-13', '2026-10-10', '2026-10-08'])
  })

  it('second session on same day goes on top', () => {
    const d = applyOp(BASE, { type: 'addSession', session: session('2026-10-13', 'Run') })
    expect(d.sessions[0].items).toEqual([{ kind: 'text', text: 'Run' }])
    expect(d.sessions[1].location).toBe('Downtown')
  })

  it('replaces a session matched by content even after remote reorder', () => {
    const before = BASE.sessions[1]
    const after = { ...before, location: 'Park' }
    const remote = applyOp(BASE, { type: 'addSession', session: session('2026-10-20', 'Run') })
    const d = applyOp(remote, { type: 'replaceSession', before, after })
    expect(d.sessions.map((s) => s.location)).toEqual([undefined, 'Downtown', 'Park'])
  })

  it('moves a session whose date changed', () => {
    const before = BASE.sessions[0]
    const d = applyOp(BASE, { type: 'replaceSession', before, after: { ...before, date: '2026-10-01' } })
    expect(d.sessions.map((s) => s.date)).toEqual(['2026-10-08', '2026-10-01'])
  })

  it('deletes a session', () => {
    const d = applyOp(BASE, { type: 'replaceSession', before: BASE.sessions[0], after: null })
    expect(d.sessions).toHaveLength(1)
  })

  it('conflicts when the session was edited elsewhere', () => {
    const before = { ...BASE.sessions[0], location: 'Elsewhere' }
    expect(() => applyOp(BASE, { type: 'replaceSession', before, after: null })).toThrow(OpConflictError)
  })

  it('injuries: add, close, delete; sorted newest first', () => {
    let d = applyOp(BASE, { type: 'addInjury', injury: { start: '2026-10-01', description: 'Wrist' } })
    expect(d.injuries.map((i) => i.description)).toEqual(['Wrist', 'Knee'])
    d = applyOp(d, {
      type: 'replaceInjury',
      before: d.injuries[0],
      after: { ...d.injuries[0], end: '2026-10-05' },
    })
    expect(d.injuries[0].end).toBe('2026-10-05')
    d = applyOp(d, { type: 'replaceInjury', before: d.injuries[1], after: null })
    expect(d.injuries).toHaveLength(1)
  })

  it('replaying ops keeps unrelated remote text intact', () => {
    const remote = doc(serializeLog(BASE).replace('# Injuries', 'my notes\n\n# Injuries'))
    const d = applyOps(remote, [{ type: 'addSession', session: session('2026-10-14', 'Swim') }])
    expect(serializeLog(d)).toContain('my notes\n\n# Injuries')
  })

  it('round-trip guard rejects names the format cannot hold', () => {
    expect(() => assertRoundTrips(session('2026-10-14', '- Pull-up 3x5'))).not.toThrow()
    const bad: Session = {
      date: '2026-10-14',
      items: [{ kind: 'exercise', name: 'Row 500', sets: [] }],
    }
    expect(() => assertRoundTrips(bad)).toThrow()
  })
})

describe('draft', () => {
  it('plans from last time: count, typical reps, top weight', () => {
    expect(planFrom(ex('Barbell Squat 5,5,4@60,62.5,62.5'))).toEqual({
      name: 'Barbell Squat',
      plannedSets: 3,
      target: { reps: 5, weight: { value: 62.5, mode: 'total' } },
      done: [],
    })
  })

  it('plans timed and distance work', () => {
    expect(planFrom(ex('Farmer Carry Hold 4x60s@30ea')).target).toEqual({
      secs: 60,
      weight: { value: 30, mode: 'each' },
    })
    expect(planFrom(ex('Rowing Machine 1000m 3:50')).target).toEqual({ meters: 1000, secs: 230 })
  })

  it('planFor uses most recent session, case-insensitive; blank otherwise', () => {
    expect(planFor(BASE.sessions, 'barbell squat').target.weight?.value).toBe(65)
    expect(planFor(BASE.sessions, 'Lunge')).toEqual({
      name: 'Lunge',
      plannedSets: 5,
      target: { reps: 5 },
      done: [],
    })
  })

  it('repeat session -> draft -> performed session', () => {
    const d = draftFromSession(BASE.sessions[0], '2026-10-15')
    expect(d.location).toBe('Downtown')
    expect(d.phase).toBe('plan')
    expect(emptyDraft('2026-10-15').phase).toBe('plan')
    expect(d.blocks).toHaveLength(2)
    const b = d.blocks[0]
    if (b.kind !== 'exercise') throw new Error()
    b.done.push(setFromTarget(b.target), { ...setFromTarget(b.target), reps: 7 })
    expect(serializeSession(draftToSession(d))).toBe('## 2026-10-15 · Downtown\n- Pull-up 9,7\n')
  })

  it('repeat uses latest loads from history', () => {
    const old = session('2026-09-01', '- Barbell Squat 5x5@50')
    const d = draftFromSession(old, '2026-10-15', undefined, BASE.sessions)
    const b = d.blocks[0]
    expect(b.kind === 'exercise' && b.target.weight?.value).toBe(65)
  })

  it('groups record per-exercise rounds', () => {
    const s = parseLog('# Log\n\n## 2026-07-23\n- Superset x4\n  - Pull-up 4x4\n  - Dip 4x4\n').doc.sessions[0]
    const d = draftFromSession(s, '2026-10-15')
    const g = d.blocks[0]
    if (g.kind !== 'group') throw new Error()
    expect(g.plannedRounds).toBe(4)
    for (const e of g.exercises) e.done.push(setFromTarget(e.target))
    expect(serializeSession(draftToSession(d))).toBe('## 2026-10-15\n- Superset x1\n  - Pull-up 1x4\n  - Dip 1x4\n')
  })

  it('activity draft keeps text; strips markdown markers', () => {
    const d = { ...emptyDraft('2026-10-15', ' Park '), kind: 'activity' as const, text: '- Football\n\n# fun' }
    expect(draftToSession(d)).toEqual({
      date: '2026-10-15',
      location: 'Park',
      items: [
        { kind: 'text', text: 'Football' },
        { kind: 'text', text: 'fun' },
      ],
    })
  })

  it('zero weight is bodyweight', () => {
    expect(setFromTarget({ reps: 5, weight: { value: 0, mode: 'total' } })).toEqual({ reps: 5 })
  })
})
