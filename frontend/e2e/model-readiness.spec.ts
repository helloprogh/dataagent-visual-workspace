import { expect, test } from '@playwright/test'
import { json, mockBaseApi } from './support/mockAgent'

test('temporarily empty service recovers without reload and accepts a default absent from catalog', async ({ page }) => {
  let calls = 0
  await mockBaseApi(page, async (route, url) => {
    if (url.pathname.endsWith('/model/default')) {
      calls++
      await json(route, { data: calls < 3 ? null : { providerID: 'live', id: 'ready', name: 'Recovered model', enabled: true } })
      return true
    }
    if (url.pathname.endsWith('/model')) { await json(route, { data: [] }); return true }
    return false
  })
  await page.goto('/')
  await expect(page.locator('.model-selector')).toContainText('Recovered model')
  expect(calls).toBe(3)
  await expect(page.locator('.model-load-error')).toHaveCount(0)
})

test('failed service stops automatic requests and supports manual recovery', async ({ page }) => {
  let recovered = false
  let calls = 0
  await mockBaseApi(page, async (route, url) => {
    if (!url.pathname.endsWith('/model/default') && !url.pathname.endsWith('/model')) return false
    calls++
    if (!recovered) await json(route, { message: 'service offline' }, 503)
    else await json(route, { data: url.pathname.endsWith('/default') ? { providerID: 'live', id: 'ready', name: 'Manual recovery' } : [] })
    return true
  })
  await page.goto('/')
  await expect(page.locator('.model-load-error')).toContainText('service offline')
  expect(calls).toBe(6)
  await page.locator('.agent-chat__composer [contenteditable=true]').first().fill('保留草稿')
  recovered = true
  await page.locator('.model-retry').click()
  await expect(page.locator('.model-selector')).toContainText('Manual recovery')
  await expect(page.locator('.agent-chat__composer [contenteditable=true]').first()).toHaveText('保留草稿')
  expect(calls).toBe(8)
})
