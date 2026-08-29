import { expect, test, type Page, type Route } from '@playwright/test'

const ACTIVE_KEY = 'dataagent.conversations.active.v2.session-thread'

const json = (route: Route, body: unknown, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

async function mockApi(page: Page, options?: { history?: boolean }) {
  await page.route('**/dataagent/web/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())

    if (request.method() === 'GET' && url.pathname === '/dataagent/web/api/session') {
      return json(route, {
        data: options?.history
          ? [{
              id: 'history-session',
              title: '历史订单分析',
              time: { created: Date.now() - 60_000, updated: Date.now() },
            }]
          : [],
        cursor: {},
      })
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/model')) {
      return json(route, {
        data: [{ providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true }],
      })
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/model/default')) {
      return json(route, {
        data: { providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true },
      })
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/session/history-session/message')) {
      return json(route, {
        data: [
          {
            id: 'history-user-message',
            type: 'user',
            text: '分析去年各区域订单趋势',
            time: { created: 1 },
          },
          {
            id: 'history-assistant-message',
            type: 'assistant',
            agent: 'build',
            model: { id: 'gpt-a', providerID: 'openai', variant: 'default' },
            content: [{ id: 'history-assistant-text', type: 'text', text: '历史分析结果已经恢复。' }],
            time: { created: 2, completed: 3 },
            finish: 'stop',
          },
        ],
        cursor: {},
      })
    }
    return json(route, { data: {} })
  })
}

test('new conversation uses the concise welcome and has no duplicate header action', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')

  const welcome = page.locator('.conversation-welcome')
  await expect(welcome).toBeVisible()
  await expect(page.getByText('我是 Data Agent，你的 SA 数据需求开发与交付助手。', { exact: true })).toHaveCount(0)
  await expect(welcome.getByText('DATA AGENT', { exact: true })).toBeVisible()
  await expect(welcome.getByText('描述你的数据业务目标，我将与你逐步澄清需求，并自主完成Specification、数据方案、数据集成、ETL开发、治理验证与交付。', { exact: true })).toBeVisible()
  await expect(welcome.getByText('从一个清晰的数据目标开始', { exact: true })).toHaveCount(0)
  await expect(welcome.locator('.conversation-welcome__capabilities')).toHaveCount(0)
  await expect(page.locator('.assistant-header button[title="新建会话"]')).toHaveCount(0)
})

test('opening an existing history session restores its messages and keeps the composer at the bottom', async ({ page }) => {
  await mockApi(page, { history: true })
  await page.addInitScript(activeKey => {
    localStorage.setItem(activeKey, 'history-session')
  }, ACTIVE_KEY)

  await page.goto('/')
  await page.getByRole('button', { name: '查看全部会话' }).click()
  await expect(page.getByRole('heading', { name: '历史对话' })).toBeVisible()

  await page.locator('.history-table__row').filter({ hasText: '历史订单分析' }).click()

  const panel = page.locator('.assistant-panel--existing')
  const body = page.locator('.assistant-body')
  const overlay = page.getByTestId('copilot-input-overlay')

  await expect(panel).toBeVisible()
  await expect(page.getByText('分析去年各区域订单趋势', { exact: true })).toBeVisible()
  await expect(page.getByText('历史分析结果已经恢复。', { exact: true })).toBeVisible()
  await expect(page.locator('.conversation-welcome')).not.toBeVisible()
  await expect(overlay).toBeVisible()

  const bodyBox = await body.boundingBox()
  const overlayBox = await overlay.boundingBox()
  expect(bodyBox).not.toBeNull()
  expect(overlayBox).not.toBeNull()

  const bodyBottom = bodyBox!.y + bodyBox!.height
  const overlayBottom = overlayBox!.y + overlayBox!.height
  expect(overlayBox!.y).toBeGreaterThan(bodyBox!.y + bodyBox!.height / 2)
  expect(Math.abs((bodyBottom - overlayBottom) - 14)).toBeLessThanOrEqual(3)
})
