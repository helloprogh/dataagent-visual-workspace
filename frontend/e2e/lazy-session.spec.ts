import { expect, test, type Page, type Route } from '@playwright/test'

const CONVERSATIONS_KEY = 'dataagent.conversations.v3.session-thread'
const ACTIVE_KEY = 'dataagent.conversations.active.v2.session-thread'
const MODELS_KEY = 'dataagent.model.selection.v4.by-session'

const json = (route: Route, body: unknown, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

const sse = (events: unknown[]) => events.map(item => `data: ${JSON.stringify(item)}\n\n`).join('')

async function mockLazyApi(page: Page, hooks?: {
  onCreateSession?: (body: any) => void
  onAgui?: (body: any) => void
  onModelSwitch?: () => void
  onUpload?: (body: string) => void
}) {
  await page.route('**/dataagent/web/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())

    if (request.method() === 'GET' && url.pathname.endsWith('/model')) {
      return json(route, { data: [
        { providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true },
        { providerID: 'anthropic', id: 'claude-b', name: 'Claude B', enabled: true },
      ] })
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/model/default')) {
      return json(route, { data: { providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true } })
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/session')) {
      hooks?.onCreateSession?.(request.postDataJSON())
      return json(route, { data: { id: 'session-created' } })
    }
    if (request.method() === 'POST' && /\/session\/[^/]+\/model$/.test(url.pathname)) {
      hooks?.onModelSwitch?.()
      return json(route, { code: 20000 })
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/agui/file/upload')) {
      hooks?.onUpload?.(request.postDataBuffer()?.toString('utf8') ?? '')
      return json(route, {
        data: {
          fileId: 'file-1',
          url: '/files/file-1',
          filename: 'notes.txt',
          mimeType: 'text/plain',
        },
      })
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/agui')) {
      const body = request.postDataJSON() as any
      hooks?.onAgui?.(body)
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse([
          { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
          { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId, outcome: { type: 'success' } },
        ]),
      })
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/tools')) {
      return json(route, { data: { items: [], warnings: [] } })
    }
    return json(route, { data: {} })
  })
}

test('new conversation stays local until first send, then creates one session with the selected model', async ({ page }) => {
  let createCalls = 0
  let switchCalls = 0
  let createBody: any
  let aguiBody: any

  await mockLazyApi(page, {
    onCreateSession: body => {
      createCalls += 1
      createBody = body
    },
    onModelSwitch: () => { switchCalls += 1 },
    onAgui: body => { aguiBody = body },
  })

  await page.goto('/')
  await expect(page.locator('.draft-model-selector__select')).toContainText('GPT A')
  await expect(page.getByText('首次发送后创建', { exact: true })).toBeVisible()
  expect(createCalls).toBe(0)

  // Clicking New is still a local UI reset and must not allocate a backend session.
  await page.getByTitle('新建会话').click()
  await expect(page.locator('.draft-model-selector__select')).toContainText('GPT A')
  expect(createCalls).toBe(0)

  await page.getByTestId('copilot-chat-input-textarea').fill('分析本月订单')
  await page.getByTestId('copilot-chat-input-send').click()

  await expect.poll(() => createCalls).toBe(1)
  expect(createBody).toEqual({ model: { providerID: 'openai', id: 'gpt-a' } })
  await expect.poll(() => aguiBody?.threadId).toBe('session-created')
  expect(switchCalls).toBe(0)

  const stored = await page.evaluate(({ conversationsKey, activeKey, modelsKey }) => ({
    conversations: JSON.parse(localStorage.getItem(conversationsKey) ?? '[]'),
    active: localStorage.getItem(activeKey),
    models: JSON.parse(localStorage.getItem(modelsKey) ?? '{}'),
  }), { conversationsKey: CONVERSATIONS_KEY, activeKey: ACTIVE_KEY, modelsKey: MODELS_KEY })

  expect(stored.conversations).toHaveLength(1)
  expect(stored.conversations[0].id).toBe('session-created')
  expect(stored.active).toBe('session-created')
  expect(stored.models['session-created']).toEqual({ providerID: 'openai', id: 'gpt-a' })
})

test('draft attachment is not uploaded until send and then uses the real session id', async ({ page }) => {
  let createCalls = 0
  let uploadCalls = 0
  let uploadBody = ''
  let aguiBody: any

  await mockLazyApi(page, {
    onCreateSession: () => { createCalls += 1 },
    onUpload: body => {
      uploadCalls += 1
      uploadBody = body
    },
    onAgui: body => { aguiBody = body },
  })

  await page.goto('/')
  await expect(page.locator('.draft-model-selector__select')).toContainText('GPT A')

  await page.locator('input[type="file"]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('draft attachment'),
  })
  await expect(page.getByText('notes.txt', { exact: true })).toBeVisible()
  expect(createCalls).toBe(0)
  expect(uploadCalls).toBe(0)

  await page.getByTestId('copilot-chat-input-textarea').fill('分析这个文件')
  await page.getByTestId('copilot-chat-input-send').click()

  await expect.poll(() => createCalls).toBe(1)
  await expect.poll(() => uploadCalls).toBe(1)
  expect(uploadBody).toContain('name="threadId"')
  expect(uploadBody).toContain('session-created')
  await expect.poll(() => aguiBody?.threadId).toBe('session-created')

  const latestUser = [...(aguiBody?.messages ?? [])].reverse().find((message: any) => message.role === 'user')
  const attachment = Array.isArray(latestUser?.content)
    ? latestUser.content.find((part: any) => part?.metadata?.fileId === 'file-1')
    : undefined
  expect(attachment?.source?.value).toBe('/files/file-1')
  expect(attachment?.metadata?.draftUploadToken).toBeUndefined()
})
