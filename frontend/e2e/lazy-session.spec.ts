import { expect, test, type Page } from '@playwright/test'
import {
  ACTIVE_SESSION_KEY,
  LEGACY_CONVERSATIONS_KEY,
  MODEL_SELECTION_KEY,
  composer,
  json,
  sendMessage,
  sse,
} from './helpers/dataagent'

async function mockLazyApi(page: Page, hooks?: {
  onCreateSession?: (body: any) => void
  onAgui?: (body: any) => void
  onModelSwitch?: () => void
  onUpload?: (body: string) => void
}) {
  await page.route('**/dataagent/web/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())

    if (request.method() === 'GET' && url.pathname === '/dataagent/web/api/session') {
      return json(route, { data: [], cursor: {} })
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/model/default')) {
      return json(route, { data: { providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true } })
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/model')) {
      return json(route, { data: [
        { providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true },
        { providerID: 'anthropic', id: 'claude-b', name: 'Claude B', enabled: true },
      ] })
    }
    if (request.method() === 'POST' && url.pathname === '/dataagent/web/api/session') {
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
  await expect(page.getByTestId('conversation-chat')).toBeVisible()
  await expect(page.getByTestId('conversation-model-selector')).toContainText('GPT A')
  expect(createCalls).toBe(0)

  // New remains a local reset and must not allocate a backend session.
  await page.getByRole('button', { name: '新建需求', exact: true }).click()
  await expect(page.getByTestId('conversation-model-selector')).toContainText('GPT A')
  expect(createCalls).toBe(0)

  await sendMessage(page, '分析本月订单')

  await expect.poll(() => createCalls).toBe(1)
  expect(createBody).toEqual({ model: { providerID: 'openai', id: 'gpt-a' } })
  await expect.poll(() => aguiBody?.threadId).toBe('session-created')
  expect(switchCalls).toBe(0)

  const stored = await page.evaluate(({ legacyConversationsKey, activeKey, modelsKey }) => ({
    legacyConversations: localStorage.getItem(legacyConversationsKey),
    active: localStorage.getItem(activeKey),
    models: JSON.parse(localStorage.getItem(modelsKey) ?? '{}'),
  }), {
    legacyConversationsKey: LEGACY_CONVERSATIONS_KEY,
    activeKey: ACTIVE_SESSION_KEY,
    modelsKey: MODEL_SELECTION_KEY,
  })

  expect(stored.legacyConversations).toBeNull()
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
  await expect(page.getByTestId('conversation-model-selector')).toContainText('GPT A')

  await composer(page).locator('input[type="file"]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('draft attachment'),
  })
  await expect(page.getByText('notes.txt', { exact: true })).toBeVisible()
  expect(createCalls).toBe(0)
  expect(uploadCalls).toBe(0)

  await sendMessage(page, '分析这个文件')

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
