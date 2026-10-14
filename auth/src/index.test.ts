import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker, { type Env } from './index'

const ORIGIN = 'https://app.example'
const env: Env = {
  GITHUB_CLIENT_ID: 'Iv1.client',
  GITHUB_CLIENT_SECRET: 'shh',
  ALLOWED_ORIGINS: `${ORIGIN}, http://localhost:5173`,
}

const post = (path: string, body: unknown, origin = ORIGIN) =>
  worker.fetch(
    new Request(`https://auth.example${path}`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
  )

let upstream: ReturnType<typeof vi.fn>

beforeEach(() => {
  upstream = vi.fn(async () =>
    Response.json({
      access_token: 'ghu_a',
      expires_in: 28800,
      refresh_token: 'ghr_r',
      refresh_token_expires_in: 15897600,
      token_type: 'bearer',
      scope: '',
    }),
  )
  vi.stubGlobal('fetch', upstream)
})
afterEach(() => vi.unstubAllGlobals())

const sentBody = () => JSON.parse(upstream.mock.calls[0][1].body)

describe('auth worker', () => {
  it('rejects unknown origins', async () => {
    const res = await post('/token', {}, 'https://evil.example')
    expect(res.status).toBe(403)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('answers preflight with CORS headers', async () => {
    const res = await worker.fetch(
      new Request('https://auth.example/token', { method: 'OPTIONS', headers: { Origin: ORIGIN } }),
      env,
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
  })

  it('exchanges code with secret and PKCE verifier', async () => {
    const res = await post('/token', { code: 'c', code_verifier: 'v', redirect_uri: ORIGIN + '/' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      access_token: 'ghu_a',
      expires_in: 28800,
      refresh_token: 'ghr_r',
      refresh_token_expires_in: 15897600,
    })
    expect(sentBody()).toEqual({
      client_id: 'Iv1.client',
      client_secret: 'shh',
      code: 'c',
      code_verifier: 'v',
      redirect_uri: ORIGIN + '/',
    })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('refreshes', async () => {
    const res = await post('/refresh', { refresh_token: 'ghr_old' })
    expect(res.status).toBe(200)
    expect(sentBody()).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'ghr_old' })
  })

  it('maps GitHub error to 400', async () => {
    upstream.mockResolvedValueOnce(
      Response.json({ error: 'bad_refresh_token', error_description: 'expired' }),
    )
    const res = await post('/refresh', { refresh_token: 'x' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'bad_refresh_token', error_description: 'expired' })
  })

  it('validates params', async () => {
    expect((await post('/token', { code: 'c' })).status).toBe(400)
    expect((await post('/refresh', {})).status).toBe(400)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('revokes with basic auth', async () => {
    upstream.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const res = await post('/revoke', { access_token: 'ghu_a' })
    expect(res.status).toBe(200)
    const [url, init] = upstream.mock.calls[0]
    expect(url).toBe('https://api.github.com/applications/Iv1.client/token')
    expect(init.method).toBe('DELETE')
    expect(init.headers.Authorization).toBe(`Basic ${btoa('Iv1.client:shh')}`)
  })

  it('404 for unknown path', async () => {
    expect((await post('/nope', {})).status).toBe(404)
  })
})
