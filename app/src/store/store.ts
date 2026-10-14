/**
 * App state: cached remote log + queue of pending ops + in-progress draft.
 * Everything is persisted to localStorage so the app works offline at the gym
 * and survives reloads; pending ops are replayed onto the latest remote file.
 */
import { useSyncExternalStore } from 'react'
import { parseLog } from '../format/parse'
import { serializeLog } from '../format/serialize'
import type { LogDoc } from '../format/types'
import { AuthRequiredError, isSignedIn } from '../github/auth'
import { ConflictError, NotInstalledError, readLog, writeLog } from '../github/repo'
import type { Draft } from '../model/draft'
import { applyOps, describeOps, OpConflictError, type Op } from '../model/ops'

export type Status = 'idle' | 'loading' | 'saving' | 'offline' | 'error'

export interface State {
  signedIn: boolean
  /** Last known remote file. */
  remote: { text: string; sha?: string } | null
  pending: Op[]
  draft: Draft | null
  status: Status
  error?: string
  /** Error needs the user to drop pending changes to resolve. */
  conflict?: boolean
  needsInstall?: boolean
  /** Remote doc with pending ops applied. */
  doc: LogDoc
  warnings: string[]
}

const K = { remote: 'actlog.remote', pending: 'actlog.pending', draft: 'actlog.draft' }

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: state still lives in memory for this session.
  }
}

function derive(remote: State['remote'], pending: Op[]): Pick<State, 'doc' | 'warnings'> & { opError?: string } {
  const { doc, warnings } = parseLog(remote?.text ?? '')
  try {
    return { doc: applyOps(doc, pending), warnings }
  } catch (e) {
    return { doc, warnings, opError: (e as Error).message }
  }
}

function initial(): State {
  const remote = read<State['remote']>(K.remote, null)
  const pending = read<Op[]>(K.pending, [])
  const { opError, ...derived } = derive(remote, pending)
  return {
    signedIn: isSignedIn(),
    remote,
    pending,
    draft: read<Draft | null>(K.draft, null),
    status: opError ? 'error' : 'idle',
    error: opError,
    conflict: !!opError,
    ...derived,
  }
}

let state: State = initial()
const listeners = new Set<() => void>()

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  if ('remote' in patch || 'pending' in patch) {
    const { opError, ...derived } = derive(state.remote, state.pending)
    state = { ...state, ...derived }
    if (opError) state = { ...state, status: 'error', error: opError, conflict: true }
  }
  if ('remote' in patch) write(K.remote, state.remote)
  if ('pending' in patch) write(K.pending, state.pending)
  if ('draft' in patch) write(K.draft, state.draft)
  for (const l of listeners) l()
}

export const getState = () => state
export function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useStore = () => useSyncExternalStore(subscribe, getState)

function fail(e: unknown) {
  if (e instanceof AuthRequiredError) return set({ signedIn: false, status: 'idle', error: undefined })
  if (e instanceof NotInstalledError) return set({ status: 'error', error: e.message, needsInstall: true })
  if (e instanceof OpConflictError) return set({ status: 'error', error: e.message, conflict: true })
  if (!navigator.onLine || e instanceof TypeError) return set({ status: 'offline', error: undefined })
  set({ status: 'error', error: (e as Error).message })
}

let busy: Promise<void> | null = null

/** Single-flight: concurrent callers share the run in progress, then a fresh one runs if needed. */
function exclusive(run: () => Promise<void>): Promise<void> {
  const next = (busy ?? Promise.resolve()).then(run, run)
  busy = next.finally(() => {
    if (busy === next) busy = null
  })
  return next
}

export function refresh(): Promise<void> {
  return exclusive(async () => {
    if (!state.signedIn) return
    set({ status: 'loading', error: undefined, needsInstall: false })
    try {
      const remote = await readLog()
      set({ remote, status: 'idle' })
      if (state.pending.length) await flushNow()
    } catch (e) {
      fail(e)
    }
  })
}

const MAX_ATTEMPTS = 4

async function flushNow(): Promise<void> {
  if (!state.pending.length || !state.signedIn) return
  set({ status: 'saving', error: undefined, conflict: false })
  try {
    for (let attempt = 1; ; attempt++) {
      const ops = state.pending
      const fresh = await readLog()
      const text = serializeLog(applyOps(parseLog(fresh.text).doc, ops))
      try {
        const sha = text === fresh.text ? fresh.sha : await writeLog(text, fresh.sha, describeOps(ops))
        // Ops queued while saving stay pending.
        set({ remote: { text, sha }, pending: state.pending.slice(ops.length), status: 'idle' })
        if (state.pending.length) return flushNow()
        return
      } catch (e) {
        if (!(e instanceof ConflictError) || attempt >= MAX_ATTEMPTS) throw e
      }
    }
  } catch (e) {
    fail(e)
  }
}

export const flush = () => exclusive(flushNow)

export function commit(...ops: Op[]): Promise<void> {
  set({ pending: [...state.pending, ...ops] })
  return flush()
}

/** Drop queued changes that can no longer apply. */
export function discardPending() {
  set({ pending: [], status: 'idle', error: undefined, conflict: false })
}

export function setDraft(draft: Draft | null) {
  set({ draft })
}

export function updateDraft(fn: (d: Draft) => Draft) {
  if (state.draft) set({ draft: fn(state.draft) })
}

export function setSignedIn(signedIn: boolean) {
  set({ signedIn })
  if (signedIn) void refresh()
}

/** Test hook. */
export function resetStore() {
  state = initial()
  busy = null
  for (const l of listeners) l()
}
