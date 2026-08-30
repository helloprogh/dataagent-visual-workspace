import { expect, test, type Page, type Route } from '@playwright/test'

const ACTIVE_KEY = 'dataagent.conversations.active.v2.session-thread'
const LEGACY_CONVERSATIONS_KEY = 'dataagent.conversations.v3.session-thread'

const json = (route: Route, body: unknown, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

// OpenCode V2 returns order=desc pages newest-first. The UI reverses each page
// before rendering so the chat itself remains oldest-to-newest.
const history = (sessionId: string, label: string) => [
  {
    id: `msg_${sessionId}_assistant`,
    time: { created: 2, completed: 3 },
    type: 'assistant',
    agent: 'build',
    model: { id: 'gpt-a', providerID: 'openai', variant: 'default' },
    content: [
      { id: `${sessionId}-reasoning`, type: 'reasoning', text: `${label}历史思考` },
      { id: `${sessionId}-text`, type: 'text', text: `${label}历史回复` },
    ],
    finish: 'stop',
  },
  {
    id: `msg_${sessionId}_user`,
    metadata: { threadId: sessionId, runId: `${sessionId}-run` },
    time: { created: 1 },
    text: `${label}历史问题`,
    type: 'user',
  },
]

function cursorPage(cursor: string | null): number {
  if (!cursor) return 0
  const page = Number(cursor.split(':').at(-1))
  return Number.isFinite(page) ? page : 0
}

function pageBody(pages: unknown[][], page: number, prefix: string) {
  return {
    data: pages[page] ?? [],
    cursor: {
      ...(page > 0 ? { previous: `${prefix}:${page - 1}` } : {}),
      ...(page + 1 < pages.length ? { next: `${prefix}:${page + 1}` } : {}),
    },
  }
}

async function mockApis(page: Page, options: {
  sessions?: unknown[]
  sessionPages?: unknown[][]
  messages?: Record<string, unknown[]>
  messagePages?: Record<string, unknown[][]>
  delays?: Record<string, number>
  onList?: (url: URL) => void
  onMessages?: (sessionId: string, url: URL) => void
}) {
  await page.route('**/dataagent/web/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'GET' && url.pathname === '/dataagent/web/api/session') {
      options.onList?.(url)
      const pages = options.sessionPages ?? [options.sessions ?? []]
      return json(route, pageBody(pages, cursorPage(url.searchParams.get('cursor')), 'session'))
    }
    const messageMatch = url.pathname.match(/^\/dataagent\/web\/api\/session\/([^/]+)\/message$/)
    if (request.method() === 'GET' && messageMatch) {
      const sessionId = decodeURIComponent(messageMatch[1])
      options.onMessages?.(sessionId, url)
      const delay = options.delays?.[sessionId] ?? 0
      if (delay) await new Promise(resolve => setTimeout(resolve, delay))
      const pages = options.messagePages?.[sessionId] ?? [options.messages?.[sessionId] ?? []]
      await json(route, pageBody(pages, cursorPage(url.searchParams.get('cursor')), `message:${sessionId}`)).catch(() => undefined)
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

test('loads OpenCode V2 sessions and hydrates the active conversation from the latest V2 message page without persisting conversations', async ({ page }) => {
  const listUrls: URL[] = []
  const messageUrls: URL[] = []
  await page.addInitScript(({ activeKey, legacyKey }) => {
    localStorage.setItem(activeKey, 'session-a')
    localStorage.setItem(legacyKey, JSON.stringify([{
      id: 'legacy-session',
      displayName: '旧缓存不应回显',
      messages: [{ id: 'legacy-message', role: 'assistant', content: '旧缓存消息' }],
      state: { large: 'legacy-state' },
      createdAt: 1,
      updatedAt: 1,
    }]))
  }, { activeKey: ACTIVE_KEY, legacyKey: LEGACY_CONVERSATIONS_KEY })
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
      {
        id: 'session-archived',
        title: '已归档需求',
        time: { created: 1_779_000_000_000, updated: 1_779_000_010_000, archived: 1_780_000_200_000 },
      },
    ],
    messages: { 'session-a': history('session-a', '订单') },
    onList: url => listUrls.push(url),
    onMessages: (_id, url) => messageUrls.push(url),
  })

  await page.goto('/')

  await expect(page.getByText('远端订单分析', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('SQL 子 Agent', { exact: true })).toHaveCount(0)
  await expect(page.getByText('已归档需求', { exact: true })).toHaveCount(0)
  await expect(page.getByText('旧缓存不应回显', { exact: true })).toHaveCount(0)
  await expect(page.getByText('订单历史问题', { exact: true })).toBeVisible()
  await expect(page.getByText('订单历史回复', { exact: true })).toBeVisible()
  await page.getByTestId('agent-reasoning-card').getByRole('button').click()
  await expect(page.getByText('订单历史思考', { exact: true })).toBeVisible()
  await expect(page.locator('.conversation-welcome')).not.toBeVisible()

  expect(listUrls).toHaveLength(1)
  expect(listUrls[0].searchParams.get('order')).toBe('desc')
  expect(listUrls[0].searchParams.get('limit')).toBe('200')
  expect(messageUrls).toHaveLength(1)
  expect(messageUrls[0].searchParams.get('order')).toBe('desc')
  expect(messageUrls[0].searchParams.get('limit')).toBe('100')
  expect(await page.evaluate(key => localStorage.getItem(key), LEGACY_CONVERSATIONS_KEY)).toBeNull()
})

test('a slow V2 history response cannot overwrite a newer conversation selection', async ({ page }) => {
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

test('loads every V2 session page before sorting conversations by remote updated time', async ({ page }) => {
  let listCalls = 0
  const firstPage = Array.from({ length: 200 }, (_, index) => ({
    id: `session-page-one-${index}`,
    title: `第一页 ${index}`,
    time: { created: 10_000 + index, updated: 20_000 + index },
  }))
  const recentlyUpdatedOldSession = {
    id: 'session-old-but-active',
    title: '最近更新的老会话',
    time: { created: 1, updated: 99_999_999 },
  }

  await mockApis(page, {
    sessionPages: [firstPage, [recentlyUpdatedOldSession]],
    messages: { 'session-old-but-active': [] },
    onList: () => { listCalls += 1 },
  })

  await page.goto('/')
  await expect(page.getByText('最近更新的老会话', { exact: true }).first()).toBeVisible()
  expect(listCalls).toBe(2)
  expect(await page.evaluate(key => localStorage.getItem(key), LEGACY_CONVERSATIONS_KEY)).toBeNull()
})

test('loads only the latest message page initially and prepends older history when scrolled to the top', async ({ page }) => {
  const messageUrls: URL[] = []
  await page.addInitScript(activeKey => localStorage.setItem(activeKey, 'session-a'), ACTIVE_KEY)

  const latestPage = Array.from({ length: 100 }, (_, index) => {
    const seq = 200 - index
    return {
      id: `msg_latest_${seq}`,
      type: 'user',
      text: `最近消息 ${seq}`,
      time: { created: seq },
    }
  })
  const olderPage = history('session-a-older', '更早')

  await mockApis(page, {
    sessions: [{ id: 'session-a', title: '分页会话', time: { created: 1, updated: 2 } }],
    messagePages: { 'session-a': [latestPage, olderPage] },
    onMessages: (_id, url) => messageUrls.push(url),
  })

  await page.goto('/')
  const scroller = page.getByTestId('copilot-chat-view-scroll')
  await expect(scroller).toBeVisible()
  await expect(page.getByText('最近消息 200', { exact: true })).toHaveCount(1)
  await expect.poll(() => messageUrls.length).toBe(1)
  expect(messageUrls[0].searchParams.get('order')).toBe('desc')
  expect(messageUrls[0].searchParams.get('limit')).toBe('100')

  await expect.poll(async () => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  await scroller.evaluate(element => {
    element.scrollTop = 0
    element.dispatchEvent(new Event('scroll'))
  })

  await expect(page.getByText('更早历史问题', { exact: true })).toHaveCount(1)
  await expect(page.getByText('更早历史回复', { exact: true })).toHaveCount(1)
  await expect.poll(() => messageUrls.length).toBe(2)
  expect(messageUrls[1].searchParams.get('cursor')).toBe('message:session-a:1')
  expect(messageUrls[1].searchParams.has('order')).toBe(false)
  expect(messageUrls[1].searchParams.get('limit')).toBe('100')
  await expect.poll(async () => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
})
