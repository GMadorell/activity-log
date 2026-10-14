/**
 * Local mock backend (VITE_MOCK=1): the "remote" log.md lives in this
 * browser's localStorage, seeded from mock/log.local.md (gitignored, your real
 * data) or mock/seed.md. Never used in production builds.
 */
const seeds = import.meta.glob('../../mock/*.md', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>
const seed = seeds['../../mock/log.local.md'] ?? seeds['../../mock/seed.md'] ?? ''

const FILE_KEY = 'actlog.mock.file'
const OFFLINE_KEY = 'actlog.mock.offline'
const LATENCY_MS = 250

interface MockFile {
  text: string
  sha: string
  rev: number
}

function load(): MockFile {
  const raw = localStorage.getItem(FILE_KEY)
  return raw ? (JSON.parse(raw) as MockFile) : { text: seed, sha: 'mock-0', rev: 0 }
}

const delay = () => new Promise((r) => setTimeout(r, LATENCY_MS))

async function guard() {
  await delay()
  if (isMockOffline()) throw new TypeError('Failed to fetch (simulated offline)')
}

export async function readLog(): Promise<{ text: string; sha?: string }> {
  await guard()
  const f = load()
  return { text: f.text, sha: f.sha }
}

export async function writeLog(text: string, sha: string | undefined): Promise<string> {
  await guard()
  const f = load()
  if (sha !== f.sha) throw Object.assign(new Error('conflict'), { conflict: true })
  const next = { text, rev: f.rev + 1, sha: `mock-${f.rev + 1}` }
  localStorage.setItem(FILE_KEY, JSON.stringify(next))
  return next.sha
}

export const isMockOffline = () => localStorage.getItem(OFFLINE_KEY) === '1'

export function setMockOffline(offline: boolean) {
  if (offline) localStorage.setItem(OFFLINE_KEY, '1')
  else localStorage.removeItem(OFFLINE_KEY)
}

/** Back to the seed file; also drops cached copy, queue and draft. */
export function resetMock() {
  for (const k of Object.keys(localStorage)) if (k.startsWith('actlog.')) localStorage.removeItem(k)
}

export const mockSource = () => ('../../mock/log.local.md' in seeds ? 'mock/log.local.md' : 'mock/seed.md')
