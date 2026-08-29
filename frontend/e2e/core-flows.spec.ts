import { expect, test, type Page, type Route } from '@playwright/test'

const CONVERSATIONS_KEY = 'dataagent.conversations.v3.session-thread'
const ACTIVE_KEY = 'dataagent.conversations.active.v2.session-thread'
const MODELS_KEY = 'dataagent.model.selection.v4.by-session'

const conversation = (id: string, name: string, updatedAt: number) => ({
  id,
  displayName: name,
  messages: [],
  state: {},
  createdAt: updatedAt,
  updatedAt,
})

const json = (route: Route, body: unknown, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

const sse = (events: unknown[]) => events.map(item => `data: ${JSON.stringify(item)}\n\n`).join('')

async function seed(page: Page, options?: { active?: string; twoConversations?: boolean }) {
  const active = options?.active ?? 'session-a'
  const records = options?.twoConversations
    ? [conversation('session-a', '会话 A', 2), conversation('session-b', '会话 B', 1)]
    : [conversation('session-a', '会话 A', 1)]
  await page.addInitScript(({ records, active }) => {
    localStorage.setItem('dataagent.conversations.v3.session-thread', JSON.stringify(records))
    localStorage.setItem('dataagent.conversations.active.v2.session-thread', active)
  }, { records, active })
}

async function mockBaseApi(page: Page, handler?: (route: Route, url: URL) => Promise<boolean> | boolean) {
  await page.route('**/dataagent/web/api/**', async route => {
    const url = new URL(route.request().url())

    // Existing explicit threads perform a CopilotChat connect/bootstrap run on
    // mount. That is not the user run under test. Keep bootstrap successful so
    // HITL cases only interrupt the request that actually carries a user
    // message; resume requests are still delegated to the test handler.
    if (route.request().method() === 'POST' && url.pathname.endsWith('/agui')) {
      const body = route.request().postDataJSON() as any
      const hasResume = Array.isArray(body.resume) && body.resume.length > 0
      const hasUserMessage = Array.isArray(body.messages)
        && body.messages.some((message: any) => message?.role === 'user')
      if (!hasResume && !hasUserMessage) {
        return route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sse([
            { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
            { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId, outcome: { type: 'success' } },
          ]),
        })
      }
    }

    if (handler && await handler(route, url)) return
    if (route.request().method() === 'GET' && url.pathname.endsWith('/model')) {
      return json(route, { data: [
        { providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true },
        { providerID: 'anthropic', id: 'claude-b', name: 'Claude B', enabled: true },
      ] })
    }
    if (route.request().method() === 'GET' && url.pathname.endsWith('/model/default')) {
      return json(route, { data: { providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true } })
    }
    if (route.request().method() === 'GET' && url.pathname.endsWith('/tools')) {
      return json(route, { data: { items: [], warnings: [] } })
    }
    if (route.request().method() === 'POST' && /\/session\/[^/]+\/interrupt$/.test(url.pathname)) return json(route, { code: 20000 })
    if (route.request().method() === 'POST' && /\/session\/[^/]+\/model$/.test(url.pathname)) return json(route, { code: 20000 })
    if (route.request().method() === 'POST' && url.pathname.endsWith('/agui')) {
      const body = route.request().postDataJSON() as any
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse([
          { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
          { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId, outcome: { type: 'success' } },
        ]),
      })
    }
    return json(route, { data: {} })
  })
}

test('model selection stays isolated per conversation and entering a thread does not switch backend model', async ({ page }) => {
  await seed(page, { twoConversations: true })
  await page.addInitScript(() => {
    localStorage.setItem('dataagent.model.selection.v4.by-session', JSON.stringify({
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

  await page.goto('/')
  await expect(page.locator('.model-selector__select')).toContainText('GPT A')
  await page.getByText('会话 B', { exact: true }).click()
  await expect(page.locator('.model-selector__select')).toContainText('Claude B')
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

  await page.goto('/')
  await page.getByRole('button', { name: '工具', exact: true }).click()
  await expect(page.locator('.tool-card')).toHaveCount(3)
  await expect(page.locator('.tool-filters')).toHaveCount(0)
  await page.getByRole('searchbox', { name: '搜索工具或能力' }).fill('warehouse')
  await expect(page.locator('.tool-card')).toHaveCount(1)
  await expect(page.locator('.tool-card')).toContainText('warehouse')
})

test('stop control interrupts the matching OpenCode session', async ({ page }) => {
  await seed(page)
  let interruptCalls = 0
  await mockBaseApi(page, async (route, url) => {
    if (route.request().method() === 'POST' && url.pathname.endsWith('/agui')) {
      await new Promise(resolve => setTimeout(resolve, 10_000))
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

  await page.goto('/')
  const input = page.getByTestId('copilot-chat-input-textarea')
  await input.fill('执行一个长任务')
  await page.getByTestId('copilot-chat-input-send').click()
  await expect(page.getByTestId('copilot-chat-input-send')).toHaveAttribute('aria-label', '停止生成')
  await page.getByTestId('copilot-chat-input-send').click()
  await expect.poll(() => interruptCalls).toBe(1)
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

  await page.goto('/')
  await page.getByTestId('copilot-chat-input-textarea').fill('触发审批')
  await page.getByTestId('copilot-chat-input-send').click()
  await expect(page.getByText('操作确认', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '拒绝', exact: true }).click()
  expect(resumePayload).toBeUndefined()
  await page.getByRole('button', { name: '提交并继续', exact: true }).click()
  await expect.poll(() => resumePayload?.payload?.decision).toBe('reject')
  expect(resumePayload?.interruptId).toBe('approval-1')
  expect(resumePayload?.status).toBe('resolved')
})

test('AG-UI parallel interrupts support multiselect forms and one atomic complete resume array', async ({ page }) => {
  await seed(page)
  let resumeRequests = 0
  let resumeBody: any

  await mockBaseApi(page, (route, url) => {
    if (route.request().method() !== 'POST' || !url.pathname.endsWith('/agui')) return false
    const body = route.request().postDataJSON() as any
    if (Array.isArray(body.resume) && body.resume.length) {
      resumeRequests += 1
      resumeBody = body
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
            interrupts: [
              {
                id: 'form-1',
                reason: 'input_required',
                message: '请选择授权范围并补充说明。',
                responseSchema: {
                  type: 'object',
                  properties: {
                    scopes: {
                      type: 'array',
                      title: '授权范围',
                      minItems: 2,
                      uniqueItems: true,
                      items: {
                        type: 'string',
                        enum: ['read', 'write', 'export'],
                        'x-enumNames': ['读取', '写入', '导出'],
                      },
                    },
                    approved: { type: 'boolean', title: '确认授权' },
                    note: { type: 'string', title: '说明', minLength: 2 },
                  },
                  required: ['scopes', 'approved', 'note'],
                },
              },
              {
                id: 'cancel-2',
                reason: 'tool_call',
                toolCallId: 'tool-2',
                message: '是否同时执行第二项操作？',
              },
            ],
          },
        },
      ]),
    })
    return true
  })

  await page.goto('/')
  await page.getByTestId('copilot-chat-input-textarea').fill('触发并行审批')
  await page.getByTestId('copilot-chat-input-send').click()

  await expect(page.getByText('2 项待处理', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '读取', exact: true }).click()
  await page.getByRole('button', { name: '写入', exact: true }).click()
  await page.getByRole('button', { name: '是', exact: true }).click()
  await page.getByRole('textbox', { name: '说明' }).fill('允许本次分析')

  const secondItem = page.locator('.approval-request__item').nth(1)
  await secondItem.getByRole('button', { name: '取消此项', exact: true }).click()

  expect(resumeRequests).toBe(0)
  await page.getByRole('button', { name: '提交并继续', exact: true }).click()
  await expect.poll(() => resumeRequests).toBe(1)

  expect(resumeBody.threadId).toBe('session-a')
  expect(resumeBody.resume).toHaveLength(2)
  expect(resumeBody.resume).toEqual(expect.arrayContaining([
    {
      interruptId: 'form-1',
      status: 'resolved',
      payload: {
        scopes: ['read', 'write'],
        approved: true,
        note: '允许本次分析',
      },
    },
    {
      interruptId: 'cancel-2',
      status: 'cancelled',
    },
  ]))
})

test('workspace render tool reveals the generated workspace', async ({ page }) => {
  await seed(page)
  let runCount = 0
  await mockBaseApi(page, (route, url) => {
    if (route.request().method() !== 'POST' || !url.pathname.endsWith('/agui')) return false
    runCount += 1
    const body = route.request().postDataJSON() as any
    const events = runCount === 1
      ? [
          { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
          { type: 'TOOL_CALL_START', toolCallId: 'workspace-1', toolCallName: 'workspace.render' },
          { type: 'TOOL_CALL_ARGS', toolCallId: 'workspace-1', delta: JSON.stringify({
            title: 'E2E 分析结果',
            widgets: [{ id: 'metric-1', component: 'ui.metric', colSpan: 12, props: { title: '订单量', value: 128 } }],
          }) },
          { type: 'TOOL_CALL_END', toolCallId: 'workspace-1' },
          { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId, outcome: { type: 'success' } },
        ]
      : [
          { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
          { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId, outcome: { type: 'success' } },
        ]
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(events) })
    return true
  })

  await page.goto('/')
  await page.getByTestId('copilot-chat-input-textarea').fill('生成一个指标工作区')
  await page.getByTestId('copilot-chat-input-send').click()
  await expect(page.locator('.dynamic-workspace-shell')).toBeVisible()
  await expect(page.getByText('E2E 分析结果', { exact: true })).toBeVisible()
  await expect(page.getByText('128', { exact: true })).toBeVisible()
})