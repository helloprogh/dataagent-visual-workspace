import { expect, test } from '@playwright/test'
import { json, sse, mockBaseApi } from './support/mockAgent'

test.use({ timezoneId: 'Asia/Shanghai' })

const surface = { type: 'ACTIVITY_SNAPSHOT', messageId: 'actions-ui', activityType: 'a2ui-surface', content: { operations: [
  { createSurface: { surfaceId: 'actions', catalogId: 'https://opencode-agui-app.local/a2ui/data-agent-catalog.json' } },
  { updateComponents: { surfaceId: 'actions', components: [
    { id: 'root', component: 'Column', children: ['refresh', 'standard'] },
    { id: 'refresh', component: 'ActionButton', label: '刷新分析', action: { event: { name: 'refresh_analysis' } } },
    { id: 'standard', component: 'Button', child: 'label', action: { event: { name: 'continue_analysis' } } },
    { id: 'label', component: 'Text', text: '继续分析' },
  ] } },
] } }

for (const outcome of ['success', 'error', 'interrupt'] as const) {
  test(`A2UI buttons follow actual run completion (${outcome})`, async ({ page }) => {
    await page.clock.install()
    let release = () => {}
    const pending = new Promise<void>(resolve => { release = resolve })
    const actions: any[] = []
    await mockBaseApi(page, async (route, url) => {
      if (url.pathname !== '/dataagent/web/api/agui') return false
      const body = route.request().postDataJSON()
      const action = body.forwardedProps?.a2uiAction
      if (action) { actions.push(action); await pending }
      const finished = action && outcome === 'error'
        ? { type: 'RUN_ERROR', message: '执行失败，可重试' }
        : { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId, ...(action && outcome === 'interrupt'
          ? { outcome: { type: 'interrupt', interrupts: [{ id: 'check', reason: 'confirmation', responseSchema: { type: 'string', enum: ['yes', 'no'] } }] } }
          : {}) }
      await route.fulfill({ contentType: 'text/event-stream', body: sse([
        { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
        ...(!action ? [surface] : []), finished,
      ]) })
      return true
    })
    await page.goto('/#/chat?session=session-a')
    await expect(page.locator('.model-selector')).toContainText('GPT A')
    await page.locator('.agent-chat__composer [contenteditable="true"]').fill('生成操作界面')
    await page.locator('.elx-x-sender__send-button').click()
    const refresh = page.getByRole('button', { name: '刷新分析', exact: true })
    const standard = page.getByRole('button', { name: '继续分析', exact: true })
    await refresh.click()
    await expect.poll(() => actions.length).toBe(1)
    await expect(refresh).toBeDisabled()
    await expect(standard).toBeDisabled()
    await page.clock.fastForward(7000)
    await expect(refresh).toBeDisabled()
    await refresh.evaluate((button: HTMLButtonElement) => button.click())
    expect(actions).toHaveLength(1)
    release()
    if (outcome === 'interrupt') {
      await expect(page.locator('.interrupt-card')).toBeVisible()
      await expect(refresh).toBeDisabled()
      await expect(standard).toBeDisabled()
    } else {
      await expect(refresh).toBeEnabled({ timeout: 2000 })
      await expect(standard).toBeEnabled()
      if (outcome === 'error') await expect(page.locator('.run-recovery')).toBeVisible()
    }
  })
}

test('multiple approvals collect all choices and submit one complete resume', async ({ page }) => {
  let entries: any[] = []
  const interrupts = ['first', 'second'].map(id => ({ id, reason: 'confirmation', message: id, responseSchema: { type: 'string', enum: ['同意', '拒绝'] } }))
  await mockBaseApi(page, (route, url) => {
    if (url.pathname !== '/dataagent/web/api/agui') return false
    const body = route.request().postDataJSON()
    entries = body.resume
    void route.fulfill({ contentType: 'text/event-stream', body: sse([
      { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
      { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId },
    ]) })
    return true
  }, interrupts)
  await page.goto('/#/chat?session=session-a')
  const card = page.locator('.interrupt-card')
  await expect(card.getByRole('button', { name: '继续', exact: true })).toBeDisabled()
  await card.getByText('同意', { exact: true }).nth(0).click()
  expect(entries).toHaveLength(0)
  await expect(card.getByRole('button', { name: '继续', exact: true })).toBeDisabled()
  await card.getByText('拒绝', { exact: true }).nth(1).click()
  await card.getByRole('button', { name: '继续', exact: true }).click()
  await expect.poll(() => entries).toEqual([
    { interruptId: 'first', status: 'resolved', payload: '同意' },
    { interruptId: 'second', status: 'resolved', payload: '拒绝' },
  ])
})

test('approval checks numeric bounds and preserves the selected time and timezone', async ({ page }) => {
  let payload: any
  await mockBaseApi(page, (route, url) => {
    if (url.pathname !== '/dataagent/web/api/agui') return false
    const body = route.request().postDataJSON()
    payload = body.resume?.[0]?.payload
    void route.fulfill({ contentType: 'text/event-stream', body: sse([
      { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
      { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId },
    ]) })
    return true
  }, [{ id: 'schedule', reason: 'input_required', responseSchema: { type: 'object', properties: {
    count: { type: 'integer', title: '执行次数', minimum: 1, maximum: 3, default: 9 },
    at: { type: 'string', title: '执行时间', format: 'date-time', default: '2026-09-06T13:45:30+08:00' },
  }, required: ['count', 'at'] } }])
  await page.goto('/#/chat?session=session-a')
  const card = page.locator('.interrupt-card')
  const submit = card.getByRole('button', { name: '继续', exact: true })
  await expect(submit).toBeDisabled()
  await card.getByRole('spinbutton').fill('2')
  await card.getByRole('spinbutton').press('Tab')
  const date = card.locator('.el-date-editor input').first()
  await expect(date).toHaveValue('2026-09-06 13:45:30')
  await date.fill('2026-09-07 15:22:30')
  await date.press('Tab')
  await submit.click()
  await expect.poll(() => payload).toEqual({ count: 2, at: '2026-09-07T15:22:30+08:00' })
})

test('unsupported schema cannot silently submit an empty approval', async ({ page }) => {
  await mockBaseApi(page, undefined, [{ id: 'nested', reason: 'input_required', responseSchema: {
    type: 'object', properties: { nested: { type: 'object', properties: { value: { type: 'string' } } } },
  } }])
  await page.goto('/#/chat?session=session-a')
  await expect(page.locator('.interrupt-card')).toContainText('此表单包含暂不支持的字段')
  await expect(page.locator('.interrupt-card').getByRole('button', { name: '继续', exact: true })).toBeDisabled()
})

test('archive text is capped at one MiB and the next small entry clears truncation', async ({ page }) => {
  await mockBaseApi(page, (route, url) => {
    if (url.pathname.endsWith('/message')) {
      void json(route, { data: [{ id: 'archive-user', type: 'user', text: '查看交付包', files: [
        { uri: '/dataagent/web/api/agui/workspace-file?path=report.zip', mime: 'application/zip', name: 'report.zip' },
      ] }], cursor: {} })
      return true
    }
    if (url.pathname.endsWith('/workspace-archive')) {
      const entry = url.searchParams.get('entry')
      if (entry) void route.fulfill({ contentType: 'text/plain', body: entry === 'large.txt' ? 'A'.repeat(1024 * 1024 + 100) : 'small entry' })
      else void json(route, { data: { entries: [
        { path: 'large.txt', kind: 'file', size: 1024 * 1024 + 100 }, { path: 'small.txt', kind: 'file', size: 11 },
      ] } })
      return true
    }
    return false
  })
  await page.goto('/#/chat?session=session-a')
  await page.locator('.attachment-card').filter({ hasText: 'report.zip' }).click()
  const preview = page.getByTestId('file-preview-panel')
  await preview.getByRole('button', { name: /large.txt/ }).click()
  await expect(preview.locator('.file-preview-panel__notice')).toBeVisible()
  expect(await preview.locator('.archive-preview__text').evaluate(el => el.textContent?.length)).toBe(1024 * 1024)
  await preview.getByRole('button', { name: /small.txt/ }).click()
  await expect(preview.locator('.archive-preview__text')).toHaveText('small entry')
  await expect(preview.locator('.file-preview-panel__notice')).toHaveCount(0)
})
