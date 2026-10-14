// Fails if mock-mode code or local data leaked into the production bundle.
import { readdirSync, readFileSync } from 'node:fs'

const dir = new URL('../dist/assets/', import.meta.url)
const leaks = readdirSync(dir)
  .filter((f) => f.endsWith('.js'))
  .filter(
    (f) =>
      /^mock|MockPanel/i.test(f) || /actlog\.mock\.|## \d{4}-\d{2}-\d{2}/.test(readFileSync(new URL(f, dir), 'utf8')),
  )
if (leaks.length) {
  console.error('Mock code or seed data found in production build:', leaks.join(', '))
  process.exit(1)
}
console.log('build check: no mock code or data in dist')
