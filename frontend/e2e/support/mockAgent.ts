import type { Page, Route } from '@playwright/test'


export const json = (route: Route, body: unknown, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

export const sse = (events: unknown[]) => events.map(item => `data: ${JSON.stringify(item)}\n\n`).join('')

export async function seed(page: Page, options?: { active?: string }) {
  const active = options?.active ?? 'session-a'
  await page.addInitScript(({ active }) => {
    localStorage.setItem('dataagent.conversations.active.v3', active)
  }, { active })
}

export async function mockBaseApi(page: Page, handler?: (route: Route, url: URL) => Promise<boolean> | boolean, interrupts: unknown[] = []) {
  await page.route('**/dataagent/web/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('mode') === 'hydrate') {
      const body = route.request().postDataJSON()
      return route.fulfill({ contentType: 'text/event-stream', body: sse([{ type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId }, { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId, ...(interrupts.length ? { outcome: { type: 'interrupt', interrupts } } : {}) }]) })
    }
    if (handler && await handler(route, url)) return
    if (route.request().method() === 'GET' && url.pathname === '/dataagent/web/api/session') {
      return json(route, {
        data: [
          { id: 'session-a', title: '会话 A', time: { created: 2, updated: 2 } },
          { id: 'session-b', title: '会话 B', time: { created: 1, updated: 1 } },
        ],
        cursor: {},
      })
    }
    if (route.request().method() === 'GET' && /\/session\/[^/]+\/message$/.test(url.pathname)) {
      return json(route, { data: [], cursor: {} })
    }
    if (route.request().method() === 'GET' && url.pathname.endsWith('/model')) {
      return json(route, { data: [
        { providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true },
        { providerID: 'anthropic', id: 'claude-b', name: 'Claude B', enabled: true },
      ] })
    }
    if (route.request().method() === 'GET' && url.pathname.endsWith('/model/default')) {
      return json(route, { data: { providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true } })
    }
    if (route.request().method() === 'GET' && url.pathname.endsWith('/tools')) {
      return json(route, { data: { items: [], warnings: [] } })
    }
    if (route.request().method() === 'POST' && /\/session\/[^/]+\/interrupt$/.test(url.pathname)) return json(route, { code: 20000 })
    if (route.request().method() === 'POST' && /\/session\/[^/]+\/model$/.test(url.pathname)) return json(route, { code: 20000 })
    if (route.request().method() === 'POST' && url.pathname.endsWith('/agui')) {
      const body = route.request().postDataJSON() as any
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse([
          { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
          { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId, outcome: { type: 'success' } },
        ]),
      })
    }
    return json(route, { data: {} })
  })
}
