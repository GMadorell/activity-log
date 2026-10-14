import type { Page } from '@playwright/test'
import { expect, test } from './fake'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('sign in with GitHub: PKCE redirect, exchange, data loads', async ({ page, gh }) => {
  await page.route('https://github.com/login/oauth/authorize**', async (route) => {
    const url = new URL(route.request().url())
    expect(url.searchParams.get('client_id')).toBe('Iv1.test')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    const back = new URL(url.searchParams.get('redirect_uri')!)
    back.searchParams.set('code', 'the-code')
    back.searchParams.set('state', url.searchParams.get('state')!)
    await route.fulfill({ status: 302, headers: { Location: back.href } })
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Sign in with GitHub' }).click()
  await expect(page.getByText('Pull-up, Barbell Squat · Downtown')).toBeVisible()
  expect(gh.tokenRequests[0]).toMatchObject({ code: 'the-code', redirect_uri: 'http://localhost:5174/activity-log/' })
  expect(String(gh.tokenRequests[0].code_verifier).length).toBeGreaterThan(40)
  // Callback params are cleaned from the URL.
  expect(page.url()).not.toContain('code=')
})

test('rejects a callback with a wrong state', async ({ page }) => {
  await page.goto('./?code=x&state=forged')
  await expect(page.getByRole('alert')).toContainText('Sign-in expired')
})

/** Home → Start workout → pick a recent session → repeat → plan screen. */
async function pickPast(page: Page, title: RegExp) {
  await page.getByRole('link', { name: 'Start workout' }).click()
  await expect(page.getByLabel('Location', { exact: true })).toHaveValue('Downtown')
  await page.getByRole('region', { name: 'Recent sessions' }).getByRole('button', { name: title }).click()
  await page.getByRole('button', { name: 'Repeat this session' }).click()
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible()
}

async function startBlank(page: Page) {
  await page.getByRole('link', { name: 'Start workout' }).click()
  await page.getByRole('button', { name: 'Blank session' }).click()
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible()
}

test('start from a past session, plan, then work', async ({ signedIn: page, gh }) => {
  await pickPast(page, /^Dip, Barbell Deadlift/)
  // Plan mode: loads from history, no rest timer.
  const deadlift = page.getByRole('button', { name: /^Barbell Deadlift/ })
  await expect(deadlift).toContainText('4×6@55')
  await expect(page.getByRole('timer')).toHaveCount(0)
  await page.getByRole('button', { name: 'Start workout' }).click()

  await expect(page.getByRole('heading', { name: 'Dip' })).toBeVisible()
  await expect(page.getByRole('timer')).toHaveText('0:00')
  // Counts finished sets, not the one in progress.
  await expect(page.getByLabel('Sets done')).toHaveText('0/4')
  await page.getByRole('button', { name: 'Set done' }).click()
  await expect(page.getByLabel('Sets done')).toHaveText('1/4')
  await expect(page.getByText('Rest', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Decrease Reps' }).click()
  await page.getByRole('button', { name: 'Set done' }).click()
  await expect(page.getByLabel('Sets done')).toHaveText('2/4')

  // Back to the plan mid-workout to switch exercise.
  await page.getByRole('button', { name: 'Plan', exact: true }).click()
  await expect(page.getByRole('timer')).toHaveCount(0)
  await page.getByRole('button', { name: /^Barbell Deadlift/ }).click()
  await page.getByRole('button', { name: 'Back to workout' }).click()
  await expect(page.getByRole('heading', { name: 'Barbell Deadlift' })).toBeVisible()
  await page.getByRole('button', { name: 'Increase Load' }).click()
  await page.getByRole('button', { name: 'Set done' }).click()

  await page.getByRole('button', { name: 'Finish' }).click()
  await page.getByRole('button', { name: 'Save session' }).click()

  await expect(page.getByRole('button', { name: 'Synced' })).toBeVisible()
  expect(gh.writes).toHaveLength(1)
  expect(gh.writes[0].text).toContain(
    `## ${today()} · Downtown\n- Dip 8,7\n- Barbell Deadlift 1x6@57.5\n\n## 2026-10-13`,
  )
  expect(gh.writes[0].message).toBe(`Log ${today()}`)
})

test('start screen: recent sessions and a calendar to pick from', async ({ signedIn: page }) => {
  await page.getByRole('link', { name: 'Start workout' }).click()
  const recent = page.getByRole('region', { name: 'Recent sessions' })
  await expect(recent.getByRole('button')).toHaveCount(2)
  const selected = page.getByRole('region', { name: 'Selected session' })
  await expect(selected).toHaveCount(0)
  await page.locator('rect[data-date="2026-10-08"]').click()
  await expect(selected).toContainText('Barbell Deadlift 4x6@55')
  await page.locator('rect[data-date="2026-10-10"]').click()
  await expect(selected).toContainText('No workout')
  await recent.getByRole('button', { name: /^Pull-up, Barbell Squat/ }).click()
  await expect(selected).toContainText('Barbell Squat 5x5@65')
  await selected.getByRole('button', { name: 'Close' }).click()
  await expect(selected).toHaveCount(0)
})

test('plan: nothing selected at first; tap toggles the editor', async ({ signedIn: page, gh }) => {
  await pickPast(page, /^Pull-up, Barbell Squat/)
  await expect(page.getByRole('region', { name: /^Edit / })).toHaveCount(0)
  const squat = page.getByRole('button', { name: /^Barbell Squat/ })
  await squat.click()
  await expect(page.getByRole('region', { name: 'Edit Barbell Squat' })).toBeVisible()
  await squat.click()
  await expect(page.getByRole('region', { name: /^Edit / })).toHaveCount(0)
  await squat.click()
  await page.getByRole('button', { name: 'Fewer sets' }).click()
  await page.getByRole('button', { name: 'Increase Load' }).click()
  await expect(page.getByRole('button', { name: /^Barbell Squat/ })).toContainText('4×5@67.5')
  await page.getByRole('button', { name: 'Start workout' }).click()
  await expect(page.getByRole('heading', { name: 'Barbell Squat' })).toBeVisible()
  await expect(page.getByLabel('Sets done')).toHaveText('0/4')
  await page.getByRole('button', { name: 'Set done' }).click()
  await page.getByRole('button', { name: 'Finish' }).click()
  await page.getByRole('button', { name: 'Save session' }).click()
  await expect(page.getByRole('button', { name: 'Synced' })).toBeVisible()
  expect(gh.writes[0].text).toContain(`## ${today()} · Downtown\n- Barbell Squat 1x5@67.5\n`)
})

test('weighted bodyweight: + on BW adds weight', async ({ signedIn: page, gh }) => {
  await pickPast(page, /^Dip, Barbell Deadlift/)
  await page.getByRole('button', { name: 'Start workout' }).click()
  await page.getByRole('button', { name: 'Increase Load' }).click()
  await page.getByRole('button', { name: 'Increase Load' }).click()
  await page.getByRole('button', { name: 'Set done' }).click()
  await page.getByRole('button', { name: 'Finish' }).click()
  await page.getByRole('button', { name: 'Save session' }).click()
  await expect(page.getByRole('button', { name: 'Synced' })).toBeVisible()
  expect(gh.writes[0].text).toContain('- Dip 1x8@+5\n')
})

test('blank session plans without a timer; draft survives a reload', async ({ signedIn: page }) => {
  await startBlank(page)
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeDisabled()
  await page.getByLabel('Add exercise').fill('Plank')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  // Stays in the plan, with the new exercise open for editing.
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible()
  await expect(page.getByRole('timer')).toHaveCount(0)
  await expect(page.getByLabel('Reps', { exact: true })).toHaveValue('5')
  await page.getByRole('button', { name: 'Start workout' }).click()
  await page.getByRole('button', { name: 'Set done' }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Plank' })).toBeVisible()
  await expect(page.getByLabel('Sets done')).toHaveText('1/5')
  await expect(page.getByText('Rest', { exact: true })).toBeVisible()
})

test('after the last planned set, the main button finishes the workout', async ({ signedIn: page, gh }) => {
  await startBlank(page)
  await page.getByLabel('Add exercise').fill('Plank')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Fewer sets' }).click()
  await page.getByRole('button', { name: 'Start workout' }).click()
  await page.getByRole('button', { name: 'Set done' }).click()
  await expect(page.getByLabel('Sets done')).toHaveText('1/1')
  await expect(page.getByRole('button', { name: 'Set done' })).toHaveCount(0)
  // An extra set is still possible on purpose.
  await page.getByRole('button', { name: 'Extra set' }).click()
  await expect(page.getByLabel('Sets done')).toHaveText('2/2')
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Save session' }).click()
  await expect(page.getByRole('button', { name: 'Synced' })).toBeVisible()
  expect(gh.writes[0].text).toContain(`## ${today()} · Downtown\n- Plank 2x5\n`)
})

test('superset rounds', async ({ signedIn: page, gh }) => {
  await startBlank(page)
  await page.getByRole('button', { name: 'Add superset / circuit' }).click()
  for (const name of ['Pull-up', 'Dip']) {
    await page.getByLabel('Add to superset').fill(name)
    await page.getByLabel('Add to superset').press('Enter')
  }
  await page.getByRole('button', { name: 'Start workout' }).click()
  await page.getByRole('button', { name: 'Round done' }).click()
  await expect(page.getByLabel('Rounds done')).toHaveText('1/3')
  await page.getByRole('button', { name: 'Round done' }).click()
  await page.getByRole('button', { name: 'Finish' }).click()
  await page.getByRole('button', { name: 'Save session' }).click()
  await expect(page.getByRole('button', { name: 'Synced' })).toBeVisible()
  expect(gh.writes[0].text).toContain('- Superset x2\n  - Pull-up 2x9\n  - Dip 2x8\n')
})

test('history: calendar and filters', async ({ signedIn: page }) => {
  await page.getByRole('link', { name: 'History', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Training calendar' })).toBeVisible()
  const count = page.getByTestId('result-count')
  await expect(count).toHaveText('2 sessions')
  await page.getByLabel('Exercise filter').selectOption('Dip')
  await expect(count).toHaveText('1 session')
  await page.getByLabel('Exercise filter').selectOption('')
  await page.getByRole('button', { name: 'Activities' }).click()
  await expect(count).toHaveText('0 sessions')
  await page.getByRole('button', { name: 'All' }).click()
  await page.locator('rect[data-date="2026-10-13"]').click()
  await expect(count).toHaveText('1 session')
  await expect(page.getByRole('link', { name: /Pull-up 4x9/ })).toBeVisible()
  await page.getByRole('button', { name: /Clear day/ }).click()
  await expect(count).toHaveText('2 sessions')
})

test('workout in progress is one tap away from any tab', async ({ signedIn: page }) => {
  await pickPast(page, /^Dip, Barbell Deadlift/)
  await page.getByRole('button', { name: 'Start workout' }).click()
  await page.getByRole('button', { name: 'Set done' }).click()
  await page.getByRole('link', { name: 'Minimize to home' }).click()
  await page.getByRole('link', { name: 'Progress' }).click()
  await page.getByRole('link', { name: /Resume workout/ }).click()
  await expect(page.getByRole('heading', { name: 'Dip' })).toBeVisible()
  await expect(page.getByLabel('Sets done')).toHaveText('1/4')
})

test('activity without location', async ({ signedIn: page, gh }) => {
  await page.getByRole('link', { name: 'Log activity' }).click()
  await page.getByRole('button', { name: 'Downtown' }).click() // toggle off
  await page.getByLabel('What did you do?').fill('Football 1h')
  await page.getByRole('button', { name: 'Save activity' }).click()
  await expect(page.getByRole('button', { name: 'Synced' })).toBeVisible()
  expect(gh.writes[0].text).toContain(`## ${today()}\nFootball 1h\n`)
})

test('offline save is queued and flushed when back online', async ({ signedIn: page, gh }) => {
  await expect(page.getByRole('button', { name: 'Synced' })).toBeVisible()
  gh.offline = true
  await page.getByRole('link', { name: 'Log activity' }).click()
  await page.getByLabel('What did you do?').fill('Hike')
  await page.getByRole('button', { name: 'Save activity' }).click()
  await expect(page.getByRole('button', { name: 'Offline · 1 unsaved' })).toBeVisible()
  // Shown locally right away.
  await expect(page.getByText('Hike')).toBeVisible()
  gh.offline = false
  await page.getByRole('button', { name: 'Offline · 1 unsaved' }).click()
  await expect(page.getByRole('button', { name: 'Synced' })).toBeVisible()
  expect(gh.writes[0].text).toContain('Hike')
})

test('remote edit made meanwhile is preserved', async ({ signedIn: page, gh }) => {
  await expect(page.getByRole('button', { name: 'Synced' })).toBeVisible()
  // Edited on GitHub web after the app loaded.
  gh.text = gh.text.replace('- Dip 4x8', '- Dip 4x10')
  gh.sha = 'sha-web'
  await page.getByRole('link', { name: 'Log activity' }).click()
  await page.getByLabel('What did you do?').fill('Swim')
  await page.getByRole('button', { name: 'Save activity' }).click()
  await expect(page.getByRole('button', { name: 'Synced' })).toBeVisible()
  expect(gh.writes[0].text).toContain('- Dip 4x10')
  expect(gh.writes[0].text).toContain('Swim')
})

test('edit a past session as text', async ({ signedIn: page, gh }) => {
  await page.getByRole('link', { name: 'History', exact: true }).click()
  await page.getByRole('link', { name: /Dip 4x8/ }).click()
  await page.getByRole('button', { name: 'Edit' }).click()
  const box = page.getByLabel('Edit as text')
  await box.fill((await box.inputValue()).replace('Dip 4x8', 'Dip 4x8@60,65'))
  await expect(page.getByRole('alert')).toBeVisible()
  await box.fill((await box.inputValue()).replace('Dip 4x8@60,65', 'Dip 8,8,8,7'))
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Synced' })).toBeVisible()
  expect(gh.writes[0].text).toContain('## 2026-10-08 · Downtown\n- Dip 8,8,8,7\n')
})

test('injuries: add ongoing, then recover', async ({ signedIn: page, gh }) => {
  await page.getByRole('link', { name: 'Injuries' }).click()
  await page.getByLabel('What happened').fill('Sore shoulder')
  await page.getByRole('button', { name: 'Add injury' }).click()
  await expect(page.getByRole('button', { name: 'Synced' })).toBeVisible()
  expect(gh.writes[0].text).toContain(`- ${today()}.. Sore shoulder`)
  await page.getByRole('button', { name: 'Recovered today' }).click()
  await expect(page.getByRole('button', { name: 'Synced' })).toBeVisible()
  expect(gh.writes[1].text).toContain(`- ${today()}..${today()} Sore shoulder`)
})

test('progress chart renders for an exercise', async ({ signedIn: page }) => {
  await page.getByRole('link', { name: 'Progress' }).click()
  await expect(page.getByRole('heading', { name: /Pull-up/ })).toBeVisible()
  await page.getByLabel('Exercise').selectOption('Barbell Squat')
  await expect(page.getByText('Only one session so far.')).toBeVisible()
  // Selected chip: marked current, dark ink on the lime accent (readable).
  const chip = page.locator('.chips').getByRole('link', { name: 'Barbell Squat' })
  await expect(chip).toHaveAttribute('aria-current', 'true')
  await expect(chip).toHaveCSS('color', 'rgb(12, 13, 14)')
})

test('theme can be forced to dark or light', async ({ signedIn: page }) => {
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'System' }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
})

test('expired access token is refreshed transparently', async ({ page, gh }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'actlog.auth',
      JSON.stringify({
        accessToken: 'stale',
        accessExpiresAt: Date.now() - 1000,
        refreshToken: 'ghr_old',
        refreshExpiresAt: Date.now() + 86_400_000,
      }),
    )
  })
  await page.goto('./')
  await expect(page.getByText('Pull-up, Barbell Squat · Downtown')).toBeVisible()
  expect(gh.tokenRequests).toEqual([{ refresh_token: 'ghr_old' }])
})
