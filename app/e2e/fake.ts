import { test as base, type Page } from '@playwright/test'

export const SEED = `# Injuries
- 2026-06-02..2026-07-09 Sprained ankle

# Log

## 2026-10-13 · Downtown
- Pull-up 4x9
- Barbell Squat 5x5@65

## 2026-10-08 · Downtown
- Dip 4x8
- Barbell Deadlift 4x6@55
`

/** In-memory GitHub contents API + auth worker. */
export class FakeGitHub {
  text = SEED
  sha = 'sha-0'
  writes: { text: string; message: string }[] = []
  offline = false
  tokenRequests: Record<string, unknown>[] = []

  async install(page: Page) {
    await page.route('https://auth.test/**', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>
      this.tokenRequests.push(body)
      await route.fulfill({
        json: {
          access_token: 'ghu_test',
          expires_in: 28800,
          refresh_token: 'ghr_test',
          refresh_token_expires_in: 15897600,
        },
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    })
    await page.route('https://api.github.com/**', async (route) => {
      if (this.offline) return route.abort('internetdisconnected')
      const req = route.request()
      const cors = { 'Access-Control-Allow-Origin': '*' }
      if (req.headers()['authorization'] !== 'Bearer ghu_test') {
        return route.fulfill({ status: 401, json: {}, headers: cors })
      }
      const url = new URL(req.url())
      if (url.pathname === '/repos/me/data') return route.fulfill({ json: {}, headers: cors })
      if (url.pathname !== '/repos/me/data/contents/log.md')
        return route.fulfill({ status: 404, json: {}, headers: cors })
      if (req.method() === 'GET') {
        return route.fulfill({
          json: { content: Buffer.from(this.text).toString('base64'), sha: this.sha },
          headers: cors,
        })
      }
      if (req.method() === 'PUT') {
        const body = req.postDataJSON() as { content: string; sha?: string; message: string }
        if (body.sha !== this.sha) return route.fulfill({ status: 409, json: {}, headers: cors })
        this.text = Buffer.from(body.content, 'base64').toString('utf8')
        this.sha = `sha-${this.writes.length + 1}`
        this.writes.push({ text: this.text, message: body.message })
        return route.fulfill({ json: { content: { sha: this.sha } }, headers: cors })
      }
      return route.fallback()
    })
  }
}

export const signedInTokens = () => ({
  accessToken: 'ghu_test',
  accessExpiresAt: Date.now() + 3_600_000,
  refreshToken: 'ghr_test',
  refreshExpiresAt: Date.now() + 100 * 86_400_000,
})

export const test = base.extend<{ gh: FakeGitHub; signedIn: Page }>({
  gh: async ({ page }, provide) => {
    const gh = new FakeGitHub()
    await gh.install(page)
    await provide(gh)
  },
  signedIn: async ({ page, gh }, provide) => {
    void gh
    const tokens = signedInTokens()
    await page.addInitScript((t) => {
      if (!localStorage.getItem('actlog.auth')) localStorage.setItem('actlog.auth', JSON.stringify(t))
    }, tokens)
    page.on('dialog', (d) => void d.accept())
    await page.goto('./')
    await provide(page)
  },
})

export { expect } from '@playwright/test'
