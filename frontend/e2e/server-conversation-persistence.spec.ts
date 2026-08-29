import { expect, test, type Page, type Route } from '@playwright/test'

const ACTIVE_KEY = 'dataagent.conversations.active.v2.session-thread'
const CONVERSATIONS_KEY = 'dataagent.conversations.v3.session-thread'

const json = (route: Route, body: unknown, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

const history = (sessionId: string, label: string) => [
  {
    info: { id: `${sessionId}-user`, sessionID: sessionId, role: 'user', time: { created: 1 } },
    parts: [{ id: `${sessionId}-user-part`, type: 'text', text: `${label}历史问题` }],
  },
  {
    info: { id: `${sessionId}-assistant`, sessionID: sessionId, role: 'assistant', time: { created: 2 } },
    parts: [
      { id: `${sessionId}-reasoning`, type: 'reasoning', text: `${label}历史思考` },
      { id: `${sessionId}-text`, type: 'text', text: `${label}历史回复` },
    ],
  },
]

async function mockApis(page: Page, options: {
  sessions: unknown[]
  messages: Record<string, unknown[]>
  delays?: Record<string, number>
  onList?: () => void
  onMessages?: (sessionId: string) => void
}) {
  await page.route('**/dataagent/web/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'GET' && url.pathname === '/dataagent/web/api/session') {
      options.onList?.()
      return json(route, { data: options.sessions })
    }
    const messageMatch = url.pathname.match(/^\/dataagent\/web\/api\/session\/([^/]+)\/message$/)
    if (request.method() === 'GET' && messageMatch) {
      const sessionId = decodeURIComponent(messageMatch[1])
      options.onMessages?.(sessionId)
      const delay = options.delays?.[sessionId] ?? 0
      if (delay) await new Promise(resolve => setTimeout(resolve, delay))
      await json(route, { data: options.messages[sessionId] ?? [] }).catch(() => undefined)
      return
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/model')) {
      return json(route, { data: [{ providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true }] })
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/model/default')) {
      return json(route, { data: { providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true } })
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/tools')) {
      return json(route, { data: { items: [], warnings: [] } })
    }
    return json(route, {})
  })

}

test('loads the OpenCode session list and hydrates the active conversation from message history', async ({ page }) => {
  let listCalls = 0
  const messageCalls: string[] = []
  await page.addInitScript(activeKey => localStorage.setItem(activeKey, 'session-a'), ACTIVE_KEY)
  await mockApis(page, {
    sessions: [
      {
        id: 'session-a',
        title: '远端订单分析',
        time: { created: 1_780_000_000_000, updated: 1_780_000_100_000 },
      },
      {
        id: 'session-child',
        parentID: 'session-a',
        title: 'SQL 子 Agent',
        time: { created: 1_780_000_010_000, updated: 1_780_000_020_000 },
      },
    ],
    messages: { 'session-a': history('session-a', '订单') },
    onList: () => { listCalls += 1 },
    onMessages: id => messageCalls.push(id),
  })

  await page.goto('/')

  await expect(page.getByText('远端订单分析', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('SQL 子 Agent', { exact: true })).toHaveCount(0)
  await expect(page.getByText('订单历史问题', { exact: true })).toBeVisible()
  await expect(page.getByText('订单历史回复', { exact: true })).toBeVisible()
  await page.getByTestId('agent-reasoning-card').getByRole('button').click()
  await expect(page.getByText('订单历史思考', { exact: true })).toBeVisible()
  await expect(page.locator('.conversation-welcome')).not.toBeVisible()
  expect(listCalls).toBe(1)
  expect(messageCalls).toEqual(['session-a'])

  const cached = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), CONVERSATIONS_KEY)
  expect(cached).toHaveLength(2)
  expect(cached.find((item: any) => item.id === 'session-child')?.parentId).toBe('session-a')
  expect(cached.find((item: any) => item.id === 'session-a')?.messages.map((item: any) => item.role))
    .toEqual(['user', 'reasoning', 'assistant'])
})

test('a slow history response cannot overwrite a newer conversation selection', async ({ page }) => {
  await page.addInitScript(activeKey => localStorage.setItem(activeKey, 'session-a'), ACTIVE_KEY)
  await mockApis(page, {
    sessions: [
      { id: 'session-a', title: '远端会话 A', time: { created: 1, updated: 2 } },
      { id: 'session-b', title: '远端会话 B', time: { created: 1, updated: 1 } },
    ],
    messages: {
      'session-a': history('session-a', 'A'),
      'session-b': history('session-b', 'B'),
    },
    delays: { 'session-a': 500, 'session-b': 10 },
  })

  await page.goto('/')
  await page.getByText('远端会话 B', { exact: true }).first().click()

  await expect(page.getByText('B历史回复', { exact: true })).toBeVisible()
  await page.waitForTimeout(650)
  await expect(page.getByText('A历史回复', { exact: true })).toHaveCount(0)
  await expect(page.getByText('B历史回复', { exact: true })).toBeVisible()
})
