import { config } from '../config'
import { getAccessToken } from './auth'

const API = 'https://api.github.com'

export class NotInstalledError extends Error {
  constructor() {
    super(`No access to ${config.dataRepo}. Install the GitHub App on that repo.`)
  }
}
export class ConflictError extends Error {}

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  const call = async (token: string) =>
    fetch(`${API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
      cache: 'no-store',
    })
  let res = await call(await getAccessToken())
  if (res.status === 401) res = await call(await getAccessToken(true))
  return res
}

export function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

export interface RemoteFile {
  text: string
  /** Undefined when the file does not exist yet. */
  sha?: string
}

const contentsPath = () => `/repos/${config.dataRepo}/contents/${config.dataPath}`

export async function readLog(): Promise<RemoteFile> {
  if (import.meta.env.VITE_MOCK === '1') return (await import('./mock')).readLog()
  const res = await gh(contentsPath())
  if (res.status === 404) {
    const repo = await gh(`/repos/${config.dataRepo}`)
    if (!repo.ok) throw new NotInstalledError()
    return { text: '' }
  }
  if (res.status === 403) throw new NotInstalledError()
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`)
  const data = (await res.json()) as { content: string; sha: string }
  return { text: decodeBase64Utf8(data.content), sha: data.sha }
}

/** Returns the new sha. Throws ConflictError if the file changed since `sha`. */
export async function writeLog(text: string, sha: string | undefined, message: string): Promise<string> {
  if (import.meta.env.VITE_MOCK === '1') {
    const mock = await import('./mock')
    try {
      return await mock.writeLog(text, sha)
    } catch (e) {
      if ((e as { conflict?: boolean }).conflict) throw new ConflictError('File changed remotely')
      throw e
    }
  }
  const res = await gh(contentsPath(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: encodeBase64Utf8(text), ...(sha ? { sha } : {}) }),
  })
  if (res.status === 409 || res.status === 422) throw new ConflictError('File changed remotely')
  if (res.status === 403 || res.status === 404) throw new NotInstalledError()
  if (!res.ok) throw new Error(`GitHub write failed: ${res.status}`)
  const data = (await res.json()) as { content: { sha: string } }
  return data.content.sha
}
