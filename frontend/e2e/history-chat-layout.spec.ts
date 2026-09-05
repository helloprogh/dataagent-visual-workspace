import { expect, test, type Page } from '@playwright/test'
import { ACTIVE_SESSION_KEY, json } from './helpers/dataagent'

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
    if (request.method() === 'GET' && url.pathname.endsWith('/model/default')) {
      return json(route, { data: { providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true } })
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/model')) {
      return json(route, { data: [{ providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true }] })
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/session/history-session/message')) {
      return json(route, {
        data: [
          {
            id: 'history-assistant-message',
            type: 'assistant',
            agent: 'build',
            model: { id: 'gpt-a', providerID: 'openai', variant: 'default' },
            content: [{ id: 'history-assistant-text', type: 'text', text: '历史分析结果已经恢复。' }],
            time: { created: 2, completed: 3 },
            finish: 'stop',
          },
          {
            id: 'history-user-message',
            type: 'user',
            text: '分析去年各区域订单趋势',
            time: { created: 1 },
          },
        ],
        cursor: {},
      })
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/tools')) {
      return json(route, { data: { items: [], warnings: [] } })
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/agui')) {
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' })
    }
    return json(route, { data: {} })
  })
}

test('new conversation exposes one sidebar create action and the current conversation-first welcome/composer', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')

  await expect(page.getByTestId('conversation-chat')).toBeVisible()
  await expect(page.getByText('描述你的业务目标，让 Agent 规划、构建并验证。关键节点，由你确认。', { exact: true })).toBeVisible()
  await expect(page.getByText('分析数据', { exact: true })).toBeVisible()
  await expect(page.getByTestId('conversation-composer')).toBeVisible()
  await expect(page.getByRole('button', { name: '新建需求', exact: true })).toHaveCount(1)
  await expect(page.locator('.agent-chat__header')).toHaveCount(0)
})

test('opening an existing history session restores messages and keeps the composer below the scrollable conversation', async ({ page }) => {
  await mockApi(page, { history: true })
  await page.addInitScript(activeKey => localStorage.setItem(activeKey, 'history-session'), ACTIVE_SESSION_KEY)

  await page.goto('/')
  await page.getByRole('button', { name: '查看全部', exact: true }).click()
  await expect(page.getByRole('heading', { name: '历史需求' })).toBeVisible()

  await page.locator('.history-item').filter({ hasText: '历史订单分析' }).getByRole('button').first().click()

  await expect(page.getByTestId('conversation-chat')).toBeVisible()
  await expect(page.getByText('分析去年各区域订单趋势', { exact: true })).toBeVisible()
  await expect(page.getByText('历史分析结果已经恢复。', { exact: true })).toBeVisible()

  const scroller = page.getByTestId('conversation-messages')
  const composer = page.getByTestId('conversation-composer')
  await expect(scroller).toBeVisible()
  await expect(composer).toBeVisible()

  const scrollerBox = await scroller.boundingBox()
  const composerBox = await composer.boundingBox()
  expect(scrollerBox).not.toBeNull()
  expect(composerBox).not.toBeNull()
  expect(composerBox!.y).toBeGreaterThan(scrollerBox!.y)
  expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual((await page.viewportSize())!.height + 1)
})
