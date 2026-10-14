// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '../format/types'

const remote = { text: '', sha: 'sha0' as string | undefined, writes: [] as string[], conflicts: 0 }

vi.mock('../github/auth', () => ({
  isSignedIn: () => true,
  AuthRequiredError: class extends Error {},
}))
vi.mock('../github/repo', async () => {
  class ConflictError extends Error {}
  class NotInstalledError extends Error {}
  return {
    ConflictError,
    NotInstalledError,
    readLog: vi.fn(async () => ({ text: remote.text, sha: remote.sha })),
    writeLog: vi.fn(async (text: string, sha: string | undefined) => {
      if (remote.conflicts > 0) {
        remote.conflicts--
        // Someone else wrote meanwhile.
        remote.text = remote.text.replace('# Log\n', '# Log\n\n## 2026-10-01\nRemote\n')
        remote.sha = 'other'
        throw new ConflictError('conflict')
      }
      if (sha !== remote.sha) throw new ConflictError('stale')
      remote.text = text
      remote.sha = `sha${remote.writes.length + 1}`
      remote.writes.push(text)
      return remote.sha
    }),
  }
})

const store = await import('./store')
const repo = await import('../github/repo')

const run: Session = { date: '2026-10-14', items: [{ kind: 'text', text: 'Run' }] }

beforeEach(() => {
  localStorage.clear()
  Object.assign(remote, { text: '# Injuries\n\n# Log\n', sha: 'sha0', writes: [], conflicts: 0 })
  vi.mocked(repo.readLog).mockClear()
  store.resetStore()
})

describe('store', () => {
  it('refresh loads and caches remote', async () => {
    await store.refresh()
    expect(store.getState().remote?.sha).toBe('sha0')
    expect(JSON.parse(localStorage.getItem('actlog.remote')!).sha).toBe('sha0')
  })

  it('commit writes and clears pending', async () => {
    await store.commit({ type: 'addSession', session: run })
    expect(remote.writes).toEqual(['# Injuries\n\n# Log\n\n## 2026-10-14\nRun\n'])
    expect(store.getState().pending).toEqual([])
    expect(store.getState().status).toBe('idle')
  })

  it('retries on conflict and keeps the remote change', async () => {
    remote.conflicts = 1
    await store.commit({ type: 'addSession', session: run })
    expect(remote.text).toBe('# Injuries\n\n# Log\n\n## 2026-10-14\nRun\n\n## 2026-10-01\nRemote\n')
  })

  it('offline: keeps op pending and shows it in doc', async () => {
    vi.mocked(repo.readLog).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await store.commit({ type: 'addSession', session: run })
    const s = store.getState()
    expect(s.status).toBe('offline')
    expect(s.pending).toHaveLength(1)
    expect(s.doc.sessions[0].date).toBe('2026-10-14')
    // Survives reload.
    store.resetStore()
    expect(store.getState().pending).toHaveLength(1)
    await store.flush()
    expect(store.getState().pending).toHaveLength(0)
    expect(remote.writes).toHaveLength(1)
  })

  it('unappliable op surfaces conflict and can be discarded', async () => {
    await store.commit({ type: 'replaceSession', before: run, after: null })
    expect(store.getState().conflict).toBe(true)
    store.discardPending()
    expect(store.getState().pending).toEqual([])
  })

  it('draft persists', () => {
    store.setDraft({ date: '2026-10-14', kind: 'gym', phase: 'plan', text: '', blocks: [], active: 0 })
    store.resetStore()
    expect(store.getState().draft?.date).toBe('2026-10-14')
  })
})
