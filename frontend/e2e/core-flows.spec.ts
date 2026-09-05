import { expect, test, type Page, type Route } from '@playwright/test'
import {
  composer,
  json,
  mockBaseApi,
  seedActiveSession,
  seedModels,
  selectModel,
  sendMessage,
  sse,
} from './helpers/dataagent'

function successRun(route: Route, body: any) {
  return route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: sse([
      { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
      { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId, outcome: { type: 'success' } },
    ]),
  })
}

function isHydration(url: URL, body: any) {
  return url.searchParams.get('mode') === 'hydrate' || body?.forwardedProps?.dataagent?.mode === 'hydrate'
}

test('model selection is isolated per session, opening a session does not switch it, and a rejected switch rolls back visually', async ({ page }) => {
  await seedActiveSession(page, 'session-a')
  await seedModels(page, {
    'session-a': { providerID: 'openai', id: 'gpt-a' },
    'session-b': { providerID: 'anthropic', id: 'claude-b' },
  })

  let switchCalls = 0
  await mockBaseApi(page, async (route, url) => {
    if (route.request().method() === 'POST' && /\/session\/session-b\/model$/.test(url.pathname)) {
      switchCalls += 1
      await json(route, { message: 'model unavailable' }, 500)
      return true
    }
    return false
  })

  await page.goto('/')
  await expect(page.getByTestId('conversation-model-selector')).toContainText('GPT A')

  await page.getByText('会话 B', { exact: true }).click()
  await expect(page.getByTestId('conversation-model-selector')).toContainText('Claude B')
  expect(switchCalls).toBe(0)

  await selectModel(page, 'GPT A')
  await expect.poll(() => switchCalls).toBe(1)
  await expect(page.getByTestId('conversation-model-selector')).toContainText('Claude B')
})

test('tool catalog is runtime-backed, searchable, and exposes warning details', async ({ page }) => {
  await seedActiveSession(page, 'session-a')
  await mockBaseApi(page, (route, url) => {
    if (route.request().method() === 'GET' && url.pathname.endsWith('/tools')) {
      void json(route, { data: { items: [
        { id: 'read', name: 'read', description: 'Read files', category: 'OpenCode', kind: 'tool', status: 'registered', statusLabel: '已注册', source: 'OpenCode runtime', capabilities: ['path'] },
        { id: 'bash', name: 'bash', description: 'Run shell commands', category: 'OpenCode', kind: 'tool', status: 'registered', statusLabel: '已注册', source: 'OpenCode runtime', capabilities: ['command'] },
        { id: 'mcp:warehouse', name: 'warehouse', description: 'Warehouse MCP', category: 'MCP', kind: 'mcp-server', status: 'ready', statusLabel: '已连接', source: 'OpenCode MCP', capabilities: ['connected'] },
      ], warnings: ['warehouse metadata is partial', 'one MCP server timed out'] } })
      return true
    }
    return false
  })

  await page.goto('/')
  await page.getByRole('button', { name: '工具', exact: true }).click()
  await expect(page.locator('.tool-card')).toHaveCount(3)
  await expect(page.getByText('warehouse metadata is partial', { exact: true })).toBeVisible()
  await expect(page.getByText('one MCP server timed out', { exact: true })).toBeVisible()

  await page.locator('.tool-toolbar input').fill('warehouse')
  await expect(page.locator('.tool-card')).toHaveCount(1)
  await expect(page.locator('.tool-card')).toContainText('warehouse')
})

test('stop control interrupts the matching OpenCode session', async ({ page }) => {
  await seedActiveSession(page, 'session-a')
  let interruptCalls = 0
  let releaseRun: (() => void) | undefined
  const runReleased = new Promise<void>(resolve => { releaseRun = resolve })

  await mockBaseApi(page, async (route, url) => {
    const request = route.request()
    if (request.method() === 'POST' && url.pathname.endsWith('/agui')) {
      const body = request.postDataJSON() as any
      if (isHydration(url, body)) {
        await successRun(route, body)
        return true
      }
      await runReleased
      await successRun(route, body).catch(() => undefined)
      return true
    }
    if (request.method() === 'POST' && /\/session\/session-a\/interrupt$/.test(url.pathname)) {
      interruptCalls += 1
      await json(route, { code: 20000 })
      return true
    }
    return false
  })

  await page.goto('/')
  await sendMessage(page, '执行一个长任务')

  const runControl = composer(page).locator('button').last()
  await expect(runControl).toBeEnabled()
  await runControl.click()
  await expect.poll(() => interruptCalls).toBe(1)
  releaseRun?.()
})

test('AG-UI interrupt renders responseSchema choices and resolves through resume payload', async ({ page }) => {
  await seedActiveSession(page, 'session-a')
  let resumePayload: any
  let interactiveRuns = 0

  await mockBaseApi(page, async (route, url) => {
    if (route.request().method() !== 'POST' || !url.pathname.endsWith('/agui')) return false
    const body = route.request().postDataJSON() as any
    if (isHydration(url, body)) {
      await successRun(route, body)
      return true
    }
    if (Array.isArray(body.resume) && body.resume.length) {
      resumePayload = body.resume[0]
      await successRun(route, body)
      return true
    }
    interactiveRuns += 1
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sse([
        { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
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

  await page.goto('/')
  await sendMessage(page, '触发审批')
  await expect.poll(() => interactiveRuns).toBe(1)
  await expect(page.getByText('操作确认', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '拒绝', exact: true }).click()
  await expect.poll(() => resumePayload?.payload?.decision).toBe('reject')
  expect(resumePayload?.interruptId).toBe('approval-1')
})

test('unmatched dataagent.subagent activity remains visible with agent name and task', async ({ page }) => {
  await seedActiveSession(page, 'session-a')
  await mockBaseApi(page, async (route, url) => {
    if (route.request().method() !== 'POST' || !url.pathname.endsWith('/agui')) return false
    const body = route.request().postDataJSON() as any
    if (isHydration(url, body)) {
      await successRun(route, body)
      return true
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sse([
        { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
        {
          type: 'ACTIVITY_SNAPSHOT',
          messageId: 'subagent-sql',
          activityType: 'dataagent.subagent',
          content: { agentId: 'sql-agent', name: 'SQL Agent', task: '聚合最近 30 天订单', status: 'running' },
        },
        { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId, outcome: { type: 'success' } },
      ]),
    })
    return true
  })

  await page.goto('/')
  await sendMessage(page, '分析订单')
  await expect(page.getByText('SQL Agent', { exact: false })).toBeVisible()
  await expect(page.getByText('聚合最近 30 天订单', { exact: true })).toBeVisible()
})

test('A2UI activity renders the negotiated generic surface', async ({ page }) => {
  await seedActiveSession(page, 'session-a')
  await mockBaseApi(page, async (route, url) => {
    if (route.request().method() !== 'POST' || !url.pathname.endsWith('/agui')) return false
    const body = route.request().postDataJSON() as any
    if (isHydration(url, body)) {
      await successRun(route, body)
      return true
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sse([
        { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
        {
          type: 'ACTIVITY_SNAPSHOT',
          messageId: 'a2ui-sales-summary',
          activityType: 'a2ui-surface',
          content: {
            a2ui_operations: [
              { version: 'v0.9', createSurface: { surfaceId: 'sales-summary', catalogId: 'https://opencode-agui-app.local/a2ui/data-agent-catalog.json' } },
              { version: 'v0.9', updateComponents: { surfaceId: 'sales-summary', components: [
                { id: 'root', component: 'Column', children: ['metric-orders'] },
                { id: 'metric-orders', component: 'MetricCard', title: '订单量', value: 128 },
              ] } },
            ],
          },
        },
        { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId, outcome: { type: 'success' } },
      ]),
    })
    return true
  })

  await page.goto('/')
  await sendMessage(page, '生成指标卡')
  await expect(page.locator('.a2ui-card')).toBeVisible()
  await expect(page.getByText('订单量', { exact: true })).toBeVisible()
  await expect(page.getByText('128', { exact: true })).toBeVisible()
})
