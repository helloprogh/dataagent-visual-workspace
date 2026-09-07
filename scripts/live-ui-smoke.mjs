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
  if (process.env.LIVE_UI_FILE === '1') {
    await page.getByRole('button', { name: '新建需求', exact: true }).click()
    await expect(page.locator('.model-selector')).toContainText(model.name)
    const marker = `FILE_${crypto.randomUUID().replaceAll('-', '')}`
    await page.locator('input[type=file]').setInputFiles({ name: 'ui-live-marker.txt', mimeType: 'text/plain', buffer: Buffer.from(`Verification marker: ${marker}\n`) })
    await page.locator('.agent-chat__composer [contenteditable=true]').first().fill('只读取本次上传的 ui-live-marker.txt，回复其中 Verification marker 的完整值。可以使用只读工具，但不要读取其他文件、不要修改文件。')
    await page.locator('.elx-x-sender__send-button').click()
    await expect(page).toHaveURL(/session=/, { timeout: 20000 })
    await expect(page.locator('.elx-x-sender__loading-button')).toHaveCount(0, { timeout: 90000 })
    await expect(page.locator('.assistant-content').last()).toContainText(marker, { timeout: 10000 })
    const sessionUrl = page.url()
    await page.reload()
    await expect(page.locator('.assistant-content').last()).toContainText(marker, { timeout: 15000 })
    await expect(page.locator('.attachment-card').filter({ hasText: 'ui-live-marker.txt' }).first()).toBeVisible()
    await page.locator('.attachment-card').filter({ hasText: 'ui-live-marker.txt' }).first().click()
    await expect(page.getByTestId('file-preview-panel')).toContainText(marker)
    console.log(JSON.stringify({ check: 'real uploaded file read and history replay', result: 'passed', url: sessionUrl }))
  }
  if (process.env.LIVE_UI_A2UI === '1') {
    await page.getByRole('button', { name: '新建需求', exact: true }).click()
    await expect(page.locator('.model-selector')).toContainText(model.name)
    const components = [
      { id: 'root', component: 'Column', children: ['metric', 'action'] },
      { id: 'metric', component: 'MetricCard', title: '真实联调计数', value: 7 },
      { id: 'action', component: 'ActionButton', label: '确认联调', action: { event: { name: 'live_confirm' } } },
    ]
    await page.locator('.agent-chat__composer [contenteditable=true]').first().fill(`请调用 render_a2ui 工具生成界面，不要用Markdown模拟。参数：${JSON.stringify({ surfaceId: 'live-check', components })}。用户点击live_confirm后，调用同一工具同一surfaceId，仅把metric的value改为8。不要读取或修改文件。`)
    await page.locator('.elx-x-sender__send-button').click()
    const surface = page.getByTestId('a2ui-activity-renderer')
    await expect(surface).toContainText('真实联调计数', { timeout: 90000 })
    await expect(surface.getByRole('button', { name: '确认联调', exact: true })).toBeEnabled({ timeout: 90000 })
    const actionRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/dataagent/web/api/agui' && Boolean(request.postDataJSON()?.forwardedProps?.a2uiAction))
    await surface.getByRole('button', { name: '确认联调', exact: true }).click()
    const action = (await actionRequest).postDataJSON().forwardedProps.a2uiAction
    assert.ok(JSON.stringify(action).includes('live_confirm'))
    await expect(surface.getByText('8', { exact: true })).toBeVisible({ timeout: 90000 })
    await expect(page.locator('.elx-x-sender__loading-button')).toHaveCount(0, { timeout: 90000 })
    await page.reload()
    await expect(surface.getByText('8', { exact: true })).toBeVisible({ timeout: 15000 })
    console.log(JSON.stringify({ check: 'real A2UI generation action update and replay', result: 'passed', url: page.url() }))
  }
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
