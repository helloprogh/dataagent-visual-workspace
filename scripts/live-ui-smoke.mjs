// Explicit opt-in browser integration check. No route interception or mock API.
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

const baseURL = process.env.LIVE_UI_URL
if (!baseURL) throw new Error('Set LIVE_UI_URL to the running real frontend')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ locale: 'zh-CN' })
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto(baseURL)
  const response = await page.request.get(new URL('/dataagent/web/api/model/default', baseURL).href)
  assert.ok(response.ok())
  const body = await response.json()
  const model = body.data?.data ?? body.data ?? body
  assert.ok(model.name, `Default model unavailable: response keys ${Object.keys(body).join(',')}; data keys ${Object.keys(body.data ?? {}).join(',')}`)
  await expect(page.locator('.model-selector')).toContainText(model.name, { timeout: 15000 })
  console.log(JSON.stringify({ check: 'real default model selectable', result: 'passed', model: model.name }))
  if (process.env.LIVE_UI_SEND === '1') {
    await page.getByRole('button', { name: '新建需求', exact: true }).click()
    await expect(page.locator('.model-selector')).toContainText(model.name)
    await page.locator('.agent-chat__composer [contenteditable=true]').first().fill('只回复 UI_LIVE_OK，不调用工具、不修改文件。')
    const streamResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/dataagent/web/api/agui' && response.request().method() === 'POST')
    await page.locator('.elx-x-sender__send-button').click()
    await expect(page).toHaveURL(/session=/, { timeout: 20000 })
    await expect(page.locator('.elx-x-sender__loading-button')).toHaveCount(0, { timeout: 90000 })
    const failure = await page.locator('.run-recovery').count() ? await page.locator('.run-recovery').textContent() : ''
    assert.ok(!failure, `Live run failed: ${failure}`)
    await expect(page.locator('.assistant-content')).toContainText('UI_LIVE_OK')
    const stream = await streamResponse
    assert.ok(stream.ok())
    const events = await stream.text()
    assert.ok(events.includes('TEXT_MESSAGE_CONTENT') && events.includes('RUN_FINISHED') && !events.includes('RUN_ERROR'), 'real SSE must include text deltas and successful completion')
    await page.reload()
    await expect(page.locator('.assistant-content')).toContainText('UI_LIVE_OK', { timeout: 15000 })
    console.log(JSON.stringify({ check: 'real browser send', result: 'passed', url: page.url() }))
    if (process.env.LIVE_UI_STOP === '1') {
      await page.locator('.agent-chat__composer [contenteditable=true]').first().fill('不调用工具、不修改文件，逐行列出从1到10000的数字。')
      await page.locator('.elx-x-sender__send-button').click()
      await expect(page.locator('.elx-x-sender__loading-button')).toBeVisible()
      const interrupted = page.waitForResponse(response => /\/session\/[^/]+\/interrupt$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST')
      await page.locator('.elx-x-sender__loading-button').click()
      assert.ok((await interrupted).ok(), 'real interrupt request must succeed')
      await expect(page.locator('.elx-x-sender__loading-button')).toHaveCount(0)
      console.log(JSON.stringify({ check: 'real browser stop', result: 'passed', url: page.url(), note: 'UI and interrupt HTTP verified; backend quiescence requires separate verification.' }))
    }
  }
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
