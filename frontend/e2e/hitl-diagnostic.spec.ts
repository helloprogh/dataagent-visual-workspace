import { expect, test, type Route } from '@playwright/test'

const conversation = {
  id: 'session-a',
  displayName: '会话 A',
  messages: [],
  state: {},
  createdAt: 1,
  updatedAt: 1,
}

const json = (route: Route, body: unknown, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

const sse = (events: unknown[]) => events.map(item => `data: ${JSON.stringify(item)}\n\n`).join('')

test('diagnose standard interrupt resume dispatch', async ({ page }) => {
  await page.addInitScript(({ conversation }) => {
    localStorage.setItem('dataagent.conversations.v3.session-thread', JSON.stringify([conversation]))
    localStorage.setItem('dataagent.conversations.active.v2.session-thread', 'session-a')
  }, { conversation })

  const browserLogs: string[] = []
  const pageErrors: string[] = []
  const aguiBodies: unknown[] = []
  page.on('console', message => browserLogs.push(`[${message.type()}] ${message.text()}`))
  page.on('pageerror', error => pageErrors.push(error.stack ?? error.message))

  await page.route('**/dataagent/web/api/**', async route => {
    const url = new URL(route.request().url())
    if (route.request().method() === 'GET' && url.pathname.endsWith('/model')) {
      return json(route, { data: [{ providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true }] })
    }
    if (route.request().method() === 'GET' && url.pathname.endsWith('/model/default')) {
      return json(route, { data: { providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true } })
    }
    if (route.request().method() === 'GET' && url.pathname.endsWith('/tools')) {
      return json(route, { data: { items: [], warnings: [] } })
    }
    if (route.request().method() === 'POST' && url.pathname.endsWith('/agui')) {
      const body = route.request().postDataJSON() as any
      aguiBodies.push(body)
      const events = Array.isArray(body.resume) && body.resume.length
        ? [
            { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
            { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId, outcome: { type: 'success' } },
          ]
        : [
            { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
            {
              type: 'RUN_FINISHED',
              threadId: body.threadId,
              runId: body.runId,
              outcome: {
                type: 'interrupt',
                interrupts: [{
                  id: 'diag-1',
                  reason: 'tool_call',
                  message: '是否继续？',
                  toolCallId: 'tool-diag',
                  responseSchema: {
                    type: 'object',
                    properties: { decision: { type: 'string', enum: ['once', 'reject'], 'x-enumNames': ['仅本次', '拒绝'] } },
                    required: ['decision'],
                  },
                }],
              },
            },
          ]
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(events) })
    }
    return json(route, { data: {} })
  })

  await page.goto('/')
  await page.getByTestId('copilot-chat-input-textarea').fill('诊断审批')
  await page.getByTestId('copilot-chat-input-send').click()
  await expect(page.getByText('操作确认', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '拒绝', exact: true }).click()
  await page.getByRole('button', { name: '提交并继续', exact: true }).click()
  await page.waitForTimeout(750)

  const cardError = await page.locator('.approval-request__error').allTextContents()
  console.log('HITL_DIAG_AGUI_BODIES', JSON.stringify(aguiBodies))
  console.log('HITL_DIAG_CARD_ERROR', JSON.stringify(cardError))
  console.log('HITL_DIAG_BROWSER_LOGS', JSON.stringify(browserLogs))
  console.log('HITL_DIAG_PAGE_ERRORS', JSON.stringify(pageErrors))

  expect(aguiBodies.filter((body: any) => Array.isArray(body?.resume) && body.resume.length)).toHaveLength(1)
})
