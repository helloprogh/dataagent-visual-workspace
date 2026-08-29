import { expect, test, type Page, type Route } from '@playwright/test'

const CONVERSATIONS_KEY = 'dataagent.conversations.v3.session-thread'
const ACTIVE_KEY = 'dataagent.conversations.active.v2.session-thread'

const json = (route: Route, body: unknown, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

async function mockApi(page: Page) {
  await page.route('**/dataagent/web/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())

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
  await mockApi(page)
  await page.addInitScript(({ conversationsKey, activeKey }) => {
    const now = Date.now()
    localStorage.setItem(conversationsKey, JSON.stringify([{
      id: 'history-session',
      displayName: '历史订单分析',
      messages: [
        { id: 'history-user-message', role: 'user', content: '分析去年各区域订单趋势' },
        { id: 'history-assistant-message', role: 'assistant', content: '历史分析结果已经恢复。' },
      ],
      state: {},
      createdAt: now - 60_000,
      updatedAt: now,
    }]))
    localStorage.setItem(activeKey, 'history-session')
  }, { conversationsKey: CONVERSATIONS_KEY, activeKey: ACTIVE_KEY })

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
