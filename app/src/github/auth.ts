/**
 * "Sign in with GitHub" via a GitHub App user token (authorization code + PKCE).
 * The Cloudflare Worker at config.authUrl holds the client secret and does the
 * code/refresh exchange. Tokens live only in this browser's localStorage.
 */
import { config } from '../config'

const TOKENS_KEY = 'actlog.auth'
const PENDING_KEY = 'actlog.auth.pending'
/** Refresh this long before the access token actually expires. */
const SKEW_MS = 5 * 60_000

export interface Tokens {
  accessToken: string
  accessExpiresAt: number
  refreshToken: string
  refreshExpiresAt: number
}

export class AuthRequiredError extends Error {
  constructor(message = 'Sign in required') {
    super(message)
  }
}

interface TokenResponse {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  refresh_token_expires_in?: number
  error?: string
  error_description?: string
}

export function loadTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem(TOKENS_KEY)
    return raw ? (JSON.parse(raw) as Tokens) : null
  } catch {
    return null
  }
}

function saveTokens(t: Tokens | null) {
  if (t) localStorage.setItem(TOKENS_KEY, JSON.stringify(t))
  else localStorage.removeItem(TOKENS_KEY)
  window.dispatchEvent(new Event('actlog-auth'))
}

export const isSignedIn = () => {
  if (import.meta.env.VITE_MOCK === '1') return true
  const t = loadTokens()
  return !!t && t.refreshExpiresAt > Date.now()
}

/** Days until the refresh token dies (renewed on every refresh). */
export function refreshDaysLeft(): number | null {
  if (import.meta.env.VITE_MOCK === '1') return null
  const t = loadTokens()
  return t ? Math.floor((t.refreshExpiresAt - Date.now()) / 86_400_000) : null
}

const redirectUri = () => new URL(import.meta.env.BASE_URL, location.origin).href

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

const randomString = () => base64url(crypto.getRandomValues(new Uint8Array(32)))

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

export async function startLogin(): Promise<void> {
  const verifier = randomString()
  const state = randomString()
  // localStorage, not sessionStorage: on Android the OAuth page may open in a
  // separate browsing context and come back to a fresh one.
  localStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state, returnTo: location.hash }))
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', redirectUri())
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', await challengeFor(verifier))
  url.searchParams.set('code_challenge_method', 'S256')
  location.assign(url.href)
}

function tokensFrom(r: TokenResponse): Tokens {
  if (!r.access_token || !r.refresh_token || !r.expires_in || !r.refresh_token_expires_in) {
    throw new Error('GitHub did not return expiring tokens. Enable token expiration on the GitHub App.')
  }
  const now = Date.now()
  return {
    accessToken: r.access_token,
    accessExpiresAt: now + r.expires_in * 1000,
    refreshToken: r.refresh_token,
    refreshExpiresAt: now + r.refresh_token_expires_in * 1000,
  }
}

async function callWorker(path: string, body: object): Promise<TokenResponse> {
  const res = await fetch(`${config.authUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as TokenResponse
  if (!res.ok) {
    const err = new Error(data.error_description ?? data.error ?? `Auth server error ${res.status}`)
    if (res.status === 400) throw Object.assign(err, { rejected: true })
    throw err
  }
  return data
}

/**
 * Finishes the OAuth redirect if the URL carries ?code=&state=.
 * Returns the hash to restore, or null when this load is not a callback.
 */
export async function completeLoginFromUrl(): Promise<string | null> {
  const params = new URLSearchParams(location.search)
  const code = params.get('code')
  const state = params.get('state')
  const error = params.get('error')
  if (!code && !error) return null

  const pending = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as {
    verifier: string
    state: string
    returnTo: string
  } | null
  localStorage.removeItem(PENDING_KEY)
  history.replaceState(null, '', redirectUri() + (pending?.returnTo ?? ''))

  if (error) throw new Error(params.get('error_description') ?? error)
  if (!pending || pending.state !== state) throw new Error('Sign-in expired or was tampered with. Try again.')
  const r = await callWorker('/token', {
    code,
    code_verifier: pending.verifier,
    redirect_uri: redirectUri(),
  })
  saveTokens(tokensFrom(r))
  return pending.returnTo
}

let inflight: Promise<string> | null = null

async function refresh(stale: Tokens): Promise<string> {
  const run = async () => {
    // Another tab may have refreshed while we waited for the lock.
    const current = loadTokens()
    if (!current) throw new AuthRequiredError()
    if (current.refreshToken !== stale.refreshToken) return current.accessToken
    try {
      const t = tokensFrom(await callWorker('/refresh', { refresh_token: current.refreshToken }))
      saveTokens(t)
      return t.accessToken
    } catch (e) {
      if ((e as { rejected?: boolean }).rejected) {
        saveTokens(null)
        throw new AuthRequiredError('Session expired, sign in again')
      }
      throw e
    }
  }
  // Refresh tokens rotate: two tabs refreshing at once would sign one out.
  const locks = (navigator as Navigator & { locks?: LockManager }).locks
  return locks ? locks.request('actlog-refresh', run) : run()
}

/** Valid access token, refreshing if needed. `force` after a 401. */
export async function getAccessToken(force = false): Promise<string> {
  if (import.meta.env.VITE_MOCK === '1') return 'mock'
  const t = loadTokens()
  if (!t || t.refreshExpiresAt <= Date.now()) throw new AuthRequiredError()
  if (!force && t.accessExpiresAt - SKEW_MS > Date.now()) return t.accessToken
  inflight ??= refresh(t).finally(() => (inflight = null))
  return inflight
}

export async function signOut(): Promise<void> {
  const t = loadTokens()
  saveTokens(null)
  if (t) await callWorker('/revoke', { access_token: t.accessToken }).catch(() => {})
}
