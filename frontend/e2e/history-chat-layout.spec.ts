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

test('opening history hides welcome content, keeps the composer at the bottom and restores the latest messages', async ({ page }) => {
  await mockApi(page)
  await page.addInitScript(({ conversationsKey, activeKey }) => {
    const now = Date.now()
    const messages = Array.from({ length: 30 }, (_, index) => ({
      id: `history-message-${index + 1}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `历史消息 ${index + 1}：这是用于验证历史会话滚动恢复位置的测试内容。`.repeat(3),
    }))
    localStorage.setItem(conversationsKey, JSON.stringify([{
      id: 'history-session',
      displayName: '历史订单分析',
      messages,
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
  const scroller = page.getByTestId('copilot-chat-view-scroll')

  await expect(panel).toBeVisible()
  await expect(page.locator('.conversation-welcome')).not.toBeVisible()
  await expect(overlay).toBeVisible()
  await expect(scroller).toBeVisible()

  const bodyBox = await body.boundingBox()
  const overlayBox = await overlay.boundingBox()
  expect(bodyBox).not.toBeNull()
  expect(overlayBox).not.toBeNull()

  const bodyBottom = bodyBox!.y + bodyBox!.height
  const overlayBottom = overlayBox!.y + overlayBox!.height
  expect(overlayBox!.y).toBeGreaterThan(bodyBox!.y + bodyBox!.height / 2)
  expect(Math.abs((bodyBottom - overlayBottom) - 14)).toBeLessThanOrEqual(3)

  await expect.poll(async () => scroller.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  await expect.poll(async () => scroller.evaluate(element => (
    element.scrollHeight - element.clientHeight - element.scrollTop
  ))).toBeLessThanOrEqual(4)
})
