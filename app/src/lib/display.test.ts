import { describe, expect, it } from 'vitest'
import { parseLog } from '../format/parse'
import { ago, itemLine } from './display'

describe('ago', () => {
  it.each([
    ['2026-10-14', 'today'],
    ['2026-10-13', 'yesterday'],
    ['2026-10-08', '6 days ago'],
    ['2026-09-23', '3 weeks ago'],
    ['2026-06-14', '4 months ago'],
    ['2023-10-14', '3 years ago'],
  ])('%s -> %s', (iso, text) => expect(ago(iso, '2026-10-14')).toBe(text))
})

describe('itemLine', () => {
  it('renders exercises, groups and notes', () => {
    const [s] = parseLog(
      '# Log\n\n## 2026-10-14\n- Squat 5x5@65\n- Superset x3\n  - Pull-up 3x8\n  - Dip 3x10\nGood day\n',
    ).doc.sessions
    expect(s.items.map(itemLine)).toEqual(['Squat 5x5@65', 'Superset: Pull-up 3x8 + Dip 3x10', 'Good day'])
  })
})
