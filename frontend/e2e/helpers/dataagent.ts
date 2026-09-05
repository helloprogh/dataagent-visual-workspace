import type { Page, Route } from '@playwright/test'

export const ACTIVE_SESSION_KEY = 'dataagent.conversations.active.v3'
export const LEGACY_CONVERSATIONS_KEY = 'dataagent.conversations.v3.session-thread'
export const MODEL_SELECTION_KEY = 'dataagent.model.selection.v5.by-session'
export const THEME_KEY = 'dataagent.theme.v2'

export const DEFAULT_MODELS = [
  { providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true },
  { providerID: 'anthropic', id: 'claude-b', name: 'Claude B', enabled: true },
]

export const DEFAULT_SESSIONS = [
  { id: 'session-a', title: '会话 A', time: { created: 2, updated: 2 } },
  { id: 'session-b', title: '会话 B', time: { created: 1, updated: 1 } },
]

export const json = (route: Route, body: unknown, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

export const sse = (events: unknown[]) => events.map(item => `data: ${JSON.stringify(item)}\n\n`).join('')

export type ApiOverride = (route: Route, url: URL) => Promise<boolean> | boolean

export async function seedActiveSession(page: Page, sessionId: string) {
  await page.addInitScript(({ key, sessionId }) => localStorage.setItem(key, sessionId), {
    key: ACTIVE_SESSION_KEY,
    sessionId,
  })
}

export async function seedModels(page: Page, selections: Record<string, { providerID: string; id: string }>) {
  await page.addInitScript(({ key, selections }) => localStorage.setItem(key, JSON.stringify(selections)), {
    key: MODEL_SELECTION_KEY,
    selections,
  })
}

export async function seedTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript(({ key, theme }) => localStorage.setItem(key, theme), { key: THEME_KEY, theme })
}

export async function mockBaseApi(page: Page, override?: ApiOverride, options?: {
  sessions?: unknown[]
  messages?: Record<string, unknown[]>
}) {
  await page.route('**/dataagent/web/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (override && await override(route, url)) return

    if (request.method() === 'GET' && url.pathname === '/dataagent/web/api/session') {
      return json(route, { data: options?.sessions ?? DEFAULT_SESSIONS, cursor: {} })
    }
    const messageMatch = url.pathname.match(/^\/dataagent\/web\/api\/session\/([^/]+)\/message$/)
    if (request.method() === 'GET' && messageMatch) {
      const sessionId = decodeURIComponent(messageMatch[1])
      return json(route, { data: options?.messages?.[sessionId] ?? [], cursor: {} })
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/model/default')) {
      return json(route, { data: DEFAULT_MODELS[0] })
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/model')) {
      return json(route, { data: DEFAULT_MODELS })
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/tools')) {
      return json(route, { data: { items: [], warnings: [] } })
    }
    if (request.method() === 'POST' && /\/session\/[^/]+\/interrupt$/.test(url.pathname)) {
      return json(route, { code: 20000 })
    }
    if (request.method() === 'POST' && /\/session\/[^/]+\/model$/.test(url.pathname)) {
      return json(route, { code: 20000 })
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/agui')) {
      const body = request.postDataJSON() as any
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

export function composer(page: Page) {
  return page.getByTestId('conversation-composer')
}

export function composerTextbox(page: Page) {
  return composer(page).locator('[contenteditable="true"], textarea').first()
}

export async function sendMessage(page: Page, text: string) {
  const textbox = composerTextbox(page)
  await textbox.fill(text)
  await textbox.press('Enter')
}

export async function selectModel(page: Page, name: string) {
  const selector = page.getByTestId('conversation-model-selector')
  await selector.click()
  await page.getByRole('option', { name }).click()
}
