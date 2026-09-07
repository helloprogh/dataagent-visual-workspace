import { expect, test } from '@playwright/test'
import { json, mockBaseApi, seed } from './support/mockAgent'

test('server model overrides stale browser cache and restores without cache', async ({ page }) => {
  await seed(page)
  let writes = 0
  await mockBaseApi(page, (route, url) => {
    if (route.request().method() === 'POST' && url.pathname.endsWith('/model')) { writes++; return false }
    if (url.pathname.endsWith('/session/session-a')) {
      json(route, { data: { model: { providerID: 'anthropic', id: 'claude-b' } } }); return true
    }
    return false
  })
  await page.goto('/#/chat?session=session-a')
  await page.evaluate(() => localStorage.setItem('dataagent.model.selection.v5.by-session', JSON.stringify({ 'session-a': { providerID: 'openai', id: 'gpt-a' } })))
  await page.reload()
  await expect(page.locator('.model-selector')).toContainText('Claude B')
  await page.evaluate(() => localStorage.removeItem('dataagent.model.selection.v5.by-session'))
  await page.reload()
  await expect(page.locator('.model-selector')).toContainText('Claude B')
  expect(writes).toBe(0)
})

test('session read failure never substitutes the default model and can retry', async ({ page }) => {
  await seed(page)
  let failed = true
  await mockBaseApi(page, (route, url) => {
    if (url.pathname.endsWith('/session/session-a')) {
      json(route, failed ? { message: 'Session unavailable' } : { data: { model: { providerID: 'custom', id: 'remote-model' } } }, failed ? 503 : 200)
      return true
    }
    return false
  })
  await page.goto('/#/chat?session=session-a')
  await expect(page.locator('.model-load-error')).toBeVisible()
  await expect(page.locator('.model-selector')).not.toContainText('GPT A')
  failed = false
  await page.locator('.model-retry').click()
  await expect(page.locator('.model-selector')).toContainText('remote-model')
})
