import { expect, test } from '@playwright/test'
import { json, sse, seed, mockBaseApi } from './support/mockAgent'

test('model selection stays isolated per conversation and entering a thread does not switch backend model', async ({ page }) => {
  await seed(page)
  await page.addInitScript(() => {
    localStorage.setItem('dataagent.model.selection.v5.by-session', JSON.stringify({
      'session-a': { providerID: 'openai', id: 'gpt-a' },
      'session-b': { providerID: 'anthropic', id: 'claude-b' },
    }))
  })
  let switchCalls = 0
  await mockBaseApi(page, (route, url) => {
    if (route.request().method() === 'POST' && /\/session\/[^/]+\/model$/.test(url.pathname)) {
      switchCalls += 1
      json(route, { code: 20000 })
      return true
    }
    return false
  })

  await page.goto('/#/chat?session=session-a')
  await expect(page.locator('.model-selector')).toContainText('GPT A')
  await page.getByText('会话 B', { exact: true }).click()
  await expect(page.locator('.model-selector')).toContainText('Claude B')
  expect(switchCalls).toBe(0)
})

test('tool catalog is runtime-backed and searchable without category filters', async ({ page }) => {
  await seed(page)
  await mockBaseApi(page, (route, url) => {
    if (route.request().method() === 'GET' && url.pathname.endsWith('/tools')) {
      json(route, { data: { items: [
        { id: 'read', name: 'read', description: 'Read files', category: 'OpenCode', kind: 'tool', status: 'registered', statusLabel: '已注册', source: 'OpenCode runtime', capabilities: ['path'] },
        { id: 'bash', name: 'bash', description: 'Run shell commands', category: 'OpenCode', kind: 'tool', status: 'registered', statusLabel: '已注册', source: 'OpenCode runtime', capabilities: ['command'] },
        { id: 'mcp:warehouse', name: 'warehouse', description: 'Warehouse MCP', category: 'MCP', kind: 'mcp-server', status: 'ready', statusLabel: '已连接', source: 'OpenCode MCP', capabilities: ['connected'] },
      ], warnings: [] } })
      return true
    }
    return false
  })

  await page.goto('/#/chat?session=session-a')
  await page.getByRole('button', { name: '工具', exact: true }).click()
  await expect(page.locator('.tool-card')).toHaveCount(3)
  await expect(page.locator('.tool-filters')).toHaveCount(0)
  await page.getByPlaceholder('搜索工具或能力').fill('warehouse')
  await expect(page.locator('.tool-card')).toHaveCount(1)
  await expect(page.locator('.tool-card')).toContainText('warehouse')
})

test('failed model switch restores the effective selection', async ({ page }) => {
  let calls = 0
  await mockBaseApi(page, (route, url) => {
    if (route.request().method() !== 'POST' || !url.pathname.endsWith('/model')) return false
    calls += 1
    void json(route, { message: '模型切换失败' }, 500)
    return true
  })
  await page.goto('/#/chat?session=session-a')
  await expect(page.locator('.model-selector')).toContainText('GPT A')
  await page.locator('.model-selector').click()
  await page.getByRole('option', { name: 'Claude B' }).click()
  await expect.poll(() => calls).toBe(1)
  await expect(page.locator('.model-selector')).toContainText('GPT A')
  await expect(page.getByRole('combobox', { name: '选择模型' })).toBeEnabled()
})

test('switching conversation during model loading ignores the old response', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dataagent.model.selection.v5.by-session', JSON.stringify({
    'session-b': { providerID: 'anthropic', id: 'claude-b' },
  })))
  let release = () => {}
  const delayed = new Promise<void>(resolve => { release = resolve })
  let loads = 0
  await mockBaseApi(page, async (route, url) => {
    if (url.pathname !== '/dataagent/web/api/model') return false
    loads += 1
    if (loads !== 1) return false
    await delayed
    await json(route, { data: [{ providerID: 'openai', id: 'old', name: 'Stale model' }] })
    return true
  })
  await page.goto('/#/chat?session=session-a')
  await expect.poll(() => loads).toBe(1)
  await page.getByText('会话 B', { exact: true }).click()
  await expect(page.locator('.model-selector')).toContainText('Claude B')
  const response = page.waitForResponse(async response => response.url().endsWith('/model') && (await response.text()).includes('Stale model'))
  release()
  await response
  await expect(page.locator('.model-selector')).toContainText('Claude B')
})

test('stop control interrupts the matching OpenCode session', async ({ page }) => {
  await seed(page)
  let interruptCalls = 0
  let finishRun = () => {}
  await mockBaseApi(page, async (route, url) => {
    if (route.request().method() === 'POST' && url.pathname.endsWith('/agui')) {
      await new Promise<void>(resolve => { finishRun = resolve })
      if (!route.request().isNavigationRequest()) {
        await route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }).catch(() => undefined)
      }
      return true
    }
    if (route.request().method() === 'POST' && /\/session\/session-a\/interrupt$/.test(url.pathname)) {
      interruptCalls += 1
      json(route, { code: 20000 })
      return true
    }
    return false
  })

  await page.goto('/#/chat?session=session-a')
  const input = page.locator('.agent-chat__composer [contenteditable="true"]').first()
  await input.fill('执行一个长任务')
  await page.locator('.elx-x-sender__send-button').click()
  await expect(page.locator('.elx-x-sender__loading-button')).toBeVisible()
  await page.locator('.elx-x-sender__loading-button').click()
  await expect.poll(() => interruptCalls).toBe(1)
  finishRun()
})

test('AG-UI interrupt renders schema choices and resolves through resume payload', async ({ page }) => {
  await seed(page)
  let resumePayload: any
  await mockBaseApi(page, (route, url) => {
    if (route.request().method() !== 'POST' || !url.pathname.endsWith('/agui')) return false
    const body = route.request().postDataJSON() as any
    if (Array.isArray(body.resume) && body.resume.length) {
      resumePayload = body.resume[0]
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse([
          { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
          { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId, outcome: { type: 'success' } },
        ]),
      })
      return true
    }
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sse([
        { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
        { type: 'STATE_SNAPSHOT', snapshot: {} },
        {
          type: 'RUN_FINISHED',
          threadId: body.threadId,
          runId: body.runId,
          outcome: {
            type: 'interrupt',
            interrupts: [{
              id: 'approval-1',
              reason: 'tool_call',
              message: '是否执行敏感操作？',
              toolCallId: 'tool-1',
              responseSchema: {
                type: 'object',
                properties: {
                  decision: { type: 'string', title: '处理方式', enum: ['once', 'reject'] },
                },
                required: ['decision'],
              },
            }],
          },
        },
      ]),
    })
    return true
  })

  await page.goto('/#/chat?session=session-a')
  await page.locator('.agent-chat__composer [contenteditable="true"]').first().fill('触发审批')
  await page.locator('.elx-x-sender__send-button').click()
  await expect(page.locator('.interrupt-card')).toBeVisible()
  await page.getByRole('button', { name: 'reject', exact: true }).click()
  await expect.poll(() => resumePayload?.payload?.decision).toBe('reject')
  expect(resumePayload?.interruptId).toBe('approval-1')
})

test('A2UI activity renders a metric through the native surface', async ({ page }) => {
  await mockBaseApi(page, (route, url) => {
    if (route.request().method() !== 'POST' || !url.pathname.endsWith('/agui')) return false
    const body = route.request().postDataJSON()
    void route.fulfill({ contentType: 'text/event-stream', body: sse([
      { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
      { type: 'ACTIVITY_SNAPSHOT', messageId: 'metric-ui', activityType: 'a2ui-surface', content: { operations: [
        { createSurface: { surfaceId: 'sales', catalogId: 'https://opencode-agui-app.local/a2ui/data-agent-catalog.json' } },
        { updateComponents: { surfaceId: 'sales', components: [
          { id: 'root', component: 'Column', children: ['orders'] },
          { id: 'orders', component: 'MetricCard', title: '订单量', value: 128 },
        ] } },
      ] } },
      { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId },
    ]) })
    return true
  })
  await page.goto('/#/chat?session=session-a')
  await expect(page.locator('.model-selector')).toContainText('GPT A')
  await page.locator('.agent-chat__composer [contenteditable="true"]').first().fill('生成指标')
  await page.locator('.elx-x-sender__send-button').click()
  await expect(page.locator('.a2ui-card').getByText('订单量', { exact: true })).toBeVisible()
  await expect(page.locator('.a2ui-card').getByText('128', { exact: true })).toBeVisible()
})

test('pending approval survives reload and resumes the matching interrupt', async ({ page }) => {
  const pending = [{ id: 'restored-form', reason: 'confirmation', message: '确认交付', responseSchema: { type: 'string', enum: ['确认', '取消'] } }]
  let resumePayload: any
  await mockBaseApi(page, (route, url) => {
    if (url.pathname !== '/dataagent/web/api/agui') return false
    const body = route.request().postDataJSON()
    resumePayload = body.resume
    pending.splice(0)
    void route.fulfill({ contentType: 'text/event-stream', body: sse([
      { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
      { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId },
    ]) })
    return true
  }, pending)
  await page.goto('/#/chat?session=session-a')
  await expect(page.locator('.interrupt-card')).toContainText('确认交付')
  await page.reload()
  await expect(page.locator('.interrupt-card')).toContainText('确认交付')
  await page.locator('.interrupt-card').getByRole('button', { name: '确认', exact: true }).click()
  await expect.poll(() => resumePayload).toEqual([{ interruptId: 'restored-form', status: 'resolved', payload: '确认' }])
  await expect(page.locator('.interrupt-card')).toHaveCount(0)
})

test('text deltas render and retry does not duplicate the submitted user message', async ({ page }) => {
  const requests: any[] = []
  await mockBaseApi(page, (route, url) => {
    if (url.pathname !== '/dataagent/web/api/agui') return false
    const body = route.request().postDataJSON()
    requests.push(body)
    void route.fulfill({ contentType: 'text/event-stream', body: sse([
      { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
      ...(requests.length === 1 ? [
        { type: 'TEXT_MESSAGE_START', messageId: 'answer-one', role: 'assistant' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: 'answer-one', delta: '分析' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: 'answer-one', delta: '结果' },
        { type: 'TEXT_MESSAGE_END', messageId: 'answer-one' },
        { type: 'RUN_ERROR', message: '测试连接中断' },
      ] : [{ type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId }]),
    ]) })
    return true
  })
  await page.goto('/#/chat?session=session-a')
  await expect(page.locator('.model-selector')).toContainText('GPT A')
  await page.locator('.agent-chat__composer [contenteditable="true"]').first().fill('分析订单')
  await page.locator('.elx-x-sender__send-button').click()
  await expect(page.getByText('分析结果', { exact: true })).toBeVisible()
  await page.locator('.run-recovery button').click()
  await expect.poll(() => requests.length).toBe(2)
  expect(requests[1].messages.filter((message: any) => message.role === 'user')).toHaveLength(1)
  await expect(page.locator('.run-recovery')).toHaveCount(0)
})
