import { expect, test } from '@playwright/test'
import { mockBaseApi, sse } from './support/mockAgent'

test('pasted multiline business requirements publish once without losing lines', async ({ page, context }) => {
  const runs: any[] = []
  await mockBaseApi(page, (route, url) => {
    if (!url.pathname.endsWith('/agui')) return false
    const body = route.request().postDataJSON()
    runs.push(body)
    void route.fulfill({ contentType: 'text/event-stream', body: sse([
      { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
      { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId },
    ]) })
    return true
  })
  await page.goto('/#/chat?session=session-a')
  await expect(page.locator('.model-selector')).toContainText('GPT A')
  await expect(page.locator('.agent-chat__loading')).toHaveCount(0)
  const text = '需求：只统计已审核订单。\n设计：取消订单排除。\n开发：计算金额与订单数。\n验证：等待确认。\n发布：确认后交付。'
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.evaluate(text => navigator.clipboard.writeText(text), text)
  await page.locator('.agent-chat__composer [contenteditable=true]').first().press('Control+V')
  await page.locator('.elx-x-sender__send-button').click()
  await expect.poll(() => runs.length).toBe(1)
  const content = runs[0].messages.at(-1).content
  expect(typeof content === 'string' ? content : content.map((part: any) => part.text ?? '').join('')).toBe(text)
})

test('composer facade fills starter, focuses with slash and clears when switching sessions', async ({ page }) => {
  await mockBaseApi(page)
  await page.goto('/')
  const input = page.locator('.agent-chat__composer [contenteditable="true"]').first()
  await page.locator('.starter-prompts button').first().click()
  await expect(input).not.toBeEmpty()
  await expect(input).toBeFocused()
  await input.fill('draft for current conversation')
  await page.locator('.agent-welcome__eyebrow').click()
  await page.keyboard.press('/')
  await expect(input).toBeFocused()
  await expect(input).toHaveText('draft for current conversation')
  await page.keyboard.type('/')
  await expect(input).toContainText('/')
  await page.getByText('会话 B', { exact: true }).click()
  await expect(input).toBeEmpty()
  await expect(page.locator('.model-selector')).toContainText('Claude B')
})

test('composer file selection remains local and removing attachment updates runtime queue', async ({ page }) => {
  let uploadCalls = 0
  await mockBaseApi(page, (_route, url) => { if (url.pathname.includes('/upload')) uploadCalls++; return false })
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles({ name: 'draft.txt', mimeType: 'text/plain', buffer: Buffer.from('draft') })
  const chip = page.locator('.attachment-chip')
  await expect(chip).toContainText('draft.txt')
  expect(uploadCalls).toBe(0)
  await chip.getByRole('button').click()
  await expect(chip).toHaveCount(0)
  await expect(page.locator('input[type=file]')).toHaveValue('')
})
