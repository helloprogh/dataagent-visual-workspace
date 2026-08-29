import { expect, test, type Route } from '@playwright/test'

const sse = (events: unknown[]) => events.map(item => `data: ${JSON.stringify(item)}\n\n`).join('')
const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

test('diagnose native HITL resolve error', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dataagent.conversations.v3.session-thread', JSON.stringify([{
      id: 'session-a', displayName: '会话 A', messages: [], state: {}, createdAt: 1, updatedAt: 1,
    }]))
    localStorage.setItem('dataagent.conversations.active.v2.session-thread', 'session-a')
  })
  const bodies: any[] = []
  const logs: string[] = []
  const pageErrors: string[] = []
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`))
  page.on('pageerror', error => pageErrors.push(error.stack ?? error.message))

  await page.route('**/dataagent/web/api/**', async route => {
    const url = new URL(route.request().url())
    if (route.request().method() === 'GET' && url.pathname.endsWith('/model')) return json(route, { data: [{ providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true }] })
    if (route.request().method() === 'GET' && url.pathname.endsWith('/model/default')) return json(route, { data: { providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true } })
    if (route.request().method() === 'GET' && url.pathname.endsWith('/tools')) return json(route, { data: { items: [], warnings: [] } })
    if (route.request().method() === 'POST' && url.pathname.endsWith('/agui')) {
      const body = route.request().postDataJSON() as any
      bodies.push(body)
      const hasResume = Array.isArray(body.resume) && body.resume.length > 0
      const userText = Array.isArray(body.messages) ? body.messages.filter((m: any) => m?.role === 'user').map((m: any) => m.content).join(' ') : ''
      const events = hasResume
        ? [
            { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
            { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId, outcome: { type: 'success' } },
          ]
        : userText.includes('诊断审批')
          ? [
              { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
              { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId, outcome: { type: 'interrupt', interrupts: [{
                id: 'diag-1', reason: 'tool_call', message: '是否继续？', toolCallId: 'tool-diag',
                responseSchema: { type: 'object', properties: { decision: { type: 'string', enum: ['once', 'reject'], 'x-enumNames': ['仅本次', '拒绝'] } }, required: ['decision'] },
              }] } },
            ]
          : [
              { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
              { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId, outcome: { type: 'success' } },
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
  await page.waitForTimeout(500)

  console.log('HITL_ERROR_DIAG_BODIES', JSON.stringify(bodies))
  console.log('HITL_ERROR_DIAG_CARD', JSON.stringify(await page.locator('.approval-request__error').allTextContents()))
  console.log('HITL_ERROR_DIAG_LOGS', JSON.stringify(logs))
  console.log('HITL_ERROR_DIAG_PAGE_ERRORS', JSON.stringify(pageErrors))
  expect(bodies.some(body => Array.isArray(body.resume) && body.resume.length)).toBe(true)
})
