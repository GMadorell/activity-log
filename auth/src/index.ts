/**
 * Token exchange for the activity-log GitHub App. Holds the client secret so the
 * static PWA never does. Stateless; never logs request bodies or tokens.
 */
export interface Env {
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  /** Comma-separated origins allowed to call this worker. */
  ALLOWED_ORIGINS: string
}

const TOKEN_URL = 'https://github.com/login/oauth/access_token'

type Body = Record<string, unknown>

function cors(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(status: number, body: unknown, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(origin) },
  })
}

const str = (b: Body, k: string) => (typeof b[k] === 'string' && b[k] ? (b[k] as string) : null)

async function exchange(env: Env, params: Record<string, string>): Promise<Response | Body> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      ...params,
    }),
  })
  return (await res.json()) as Body
}

/** Forward only the fields the app needs; GitHub reports errors with 200 + `error`. */
function tokenResponse(data: Body, origin: string): Response {
  if (typeof data.error === 'string') {
    return json(400, { error: data.error, error_description: data.error_description }, origin)
  }
  const { access_token, expires_in, refresh_token, refresh_token_expires_in } = data
  return json(200, { access_token, expires_in, refresh_token, refresh_token_expires_in }, origin)
}

async function revoke(env: Env, token: string): Promise<void> {
  await fetch(`https://api.github.com/applications/${env.GITHUB_CLIENT_ID}/token`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Basic ${btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`)}`,
      'User-Agent': 'activity-log-auth',
    },
    body: JSON.stringify({ access_token: token }),
  })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin') ?? ''
    const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    if (!allowed.includes(origin)) return new Response('Forbidden', { status: 403 })
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' }, origin)

    let body: Body
    try {
      body = (await req.json()) as Body
    } catch {
      return json(400, { error: 'invalid_json' }, origin)
    }

    const path = new URL(req.url).pathname
    if (path === '/token') {
      const code = str(body, 'code')
      const verifier = str(body, 'code_verifier')
      const redirect = str(body, 'redirect_uri')
      if (!code || !verifier || !redirect) return json(400, { error: 'missing_params' }, origin)
      const data = await exchange(env, { code, code_verifier: verifier, redirect_uri: redirect })
      return tokenResponse(data as Body, origin)
    }
    if (path === '/refresh') {
      const refresh = str(body, 'refresh_token')
      if (!refresh) return json(400, { error: 'missing_params' }, origin)
      const data = await exchange(env, { grant_type: 'refresh_token', refresh_token: refresh })
      return tokenResponse(data as Body, origin)
    }
    if (path === '/revoke') {
      const token = str(body, 'access_token')
      if (!token) return json(400, { error: 'missing_params' }, origin)
      await revoke(env, token)
      return json(200, { ok: true }, origin)
    }
    return json(404, { error: 'not_found' }, origin)
  },
}
