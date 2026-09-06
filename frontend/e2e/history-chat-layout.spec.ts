import { expect, test, type Page, type Route } from '@playwright/test'

const ACTIVE_KEY = 'dataagent.conversations.active.v3'

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

test('new conversation exposes welcome, composer and one create action', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await expect(page.locator('.agent-chat--empty')).toBeVisible()
  await expect(page.locator('.starter-prompts button')).toHaveCount(3)
  await expect(page.locator('.agent-chat__composer [contenteditable="true"]')).toBeVisible()
  await expect(page.getByRole('button', { name: '新建需求', exact: true })).toHaveCount(1)
})

test('history navigation restores messages and keeps composer below viewport', async ({ page }) => {
  await mockApi(page, { history: true })
  await page.goto('/#/history')
  await expect(page.getByRole('heading', { name: '历史需求' })).toBeVisible()
  await page.locator('.history-item__main').click()
  await expect(page.getByText('分析去年各区域订单趋势', { exact: true })).toBeVisible()
  await expect(page.getByText('历史分析结果已经恢复。', { exact: true })).toBeVisible()
  const viewport = await page.locator('.agent-chat__messages').boundingBox()
  const composer = await page.locator('.agent-chat__composer-wrap').boundingBox()
  expect(viewport).not.toBeNull()
  expect(composer).not.toBeNull()
  expect(composer!.y).toBeGreaterThanOrEqual(viewport!.y + viewport!.height - 1)
  expect(composer!.y + composer!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1)
})
