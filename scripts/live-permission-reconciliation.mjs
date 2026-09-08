// Real two-client permission restoration. Creates only permission probes; no
// protected operation or model generation is performed.
import assert from 'node:assert/strict'
import path from 'node:path'
import { once } from 'node:events'
import { chromium, expect } from '@playwright/test'
import { createServer as createViteServer } from 'vite'
import { OpenCodeClient } from '../adapter/src/opencode-client.mjs'
import { createServer } from '../adapter/src/server-entry.mjs'
import { SessionRegistry } from '../adapter/src/session-registry.mjs'

assert.ok(process.env.OPENCODE_BASE_URL, 'Configure real service credentials')
const client = new OpenCodeClient()
const session = await client.createSession('UI external permission reconciliation')
const probes = new Set()
const resources = [1, 2].map(index => `D:/ui-permission-probe-nonexistent/${session.id}/${index}`)
const server = createServer({ client }).listen(0, '127.0.0.1')
await once(server, 'listening')
const target = `http://127.0.0.1:${server.address().port}`
let browser, vite
try {
  // The service may still be assembling its agent catalog after an idle period.
  // Observe readiness before creating probes; never retry a denied request or
  // alter the service's permission rules to make an acceptance test pass.
  await expect.poll(async () => {
    const agents = await client.json('/api/agent', {}, 'read permission agent readiness')
    const rules = agents.find(agent => agent.id === 'explore')?.permissions ?? []
    return rules.filter(rule => ['*', 'external_directory'].includes(rule.action) && rule.resource === '*').at(-1)?.effect
  }, { timeout: 15000, message: 'Explore external-directory policy must be ready and ask' }).toBe('ask')
  const createProbe = async resource => {
    const request = await client.json(`/api/session/${session.id}/permission`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'external_directory', resources: [resource], agent: 'explore' }),
    }, 'create isolated permission probe')
    if (request.effect === 'ask' && request.id) probes.add(request.id)
    assert.equal(request.effect, 'ask', 'A non-pending permission is not acceptance evidence')
    assert.ok(request.id)
    return request.id
  }
  const first = await createProbe(resources[0])
  vite = await createViteServer({ root: path.resolve('frontend'), server: { host: '127.0.0.1', port: 5191, strictPort: true, proxy: { '/dataagent/web/api': { target }, '/dataagent/web/api/agui': { target }, '/dataagent/web/api/agui/upload': { target } } } })
  await vite.listen()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ locale: 'zh-CN' })
  const errors = []
  let runs = 0
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname.endsWith('/agui') && !url.searchParams.has('mode')) runs++
  })
  const items = page.locator('.interrupt-card__item')
  const restore = async expectedIds => {
    const hydrated = page.waitForResponse(response => new URL(response.url()).searchParams.get('mode') === 'hydrate')
    if (page.url() === 'about:blank') await page.goto(`http://127.0.0.1:5191/#/chat?session=${session.id}`)
    else await page.reload()
    await (await hydrated).finished()
    await expect(page.locator('.agent-chat__loading')).toHaveCount(0)
    await expect(items).toHaveCount(expectedIds.length, { timeout: 15000 })
    const cached = await new SessionRegistry().pendingInterrupts(session.id)
    assert.deepEqual(cached.map(item => item.id).sort(), [...expectedIds].sort())
    assert.equal(runs, 0, 'Restoration must not publish model or approval runs')
  }
  await restore([first])
  await expect(items).toContainText(resources[0])
  await expect(page.locator('.agent-chat__composer [contenteditable=true]')).toHaveCount(0)
  console.log(JSON.stringify({ stage: 'first approval restored', sessionId: session.id }))

  const second = await createProbe(resources[1])
  await restore([first, second])
  await expect(items.filter({ hasText: resources[0] })).toHaveCount(1)
  await expect(items.filter({ hasText: resources[1] })).toHaveCount(1)
  console.log(JSON.stringify({ stage: 'additional approval discovered despite nonempty cache', sessionId: session.id }))

  await client.replyPermission(session.id, first, 'reject')
  // Native reject rejects every pending permission in this session, including
  // siblings. Do not submit a second reject against an already removed item.
  assert.deepEqual(await client.listPermissions(session.id), [])
  probes.clear()
  await restore([])
  await expect(page.locator('.interrupt-card')).toHaveCount(0)
  await expect(page.locator('.agent-chat__header [role=status]')).toHaveText('已就绪')
  const input = page.locator('.agent-chat__composer [contenteditable=true]').first()
  await expect(input).toBeEditable()
  await input.fill('本地草稿，不发送')
  await expect(page.locator('.elx-x-sender__send-button')).toBeEnabled()
  assert.equal(runs, 0)
  assert.deepEqual(errors, [])
  assert.deepEqual(await client.listPermissions(session.id), [])
  console.log(JSON.stringify({ check: 'real browser external permission reconciliation', result: 'passed', sessionId: session.id }))
} catch (error) {
  console.error(JSON.stringify({ result: 'failed', sessionId: session.id, error: String(error) }))
  throw error
} finally {
  try {
    const request = (await client.listPermissions(session.id)).find(item => probes.has(item.id))
    if (request) await client.replyPermission(session.id, request.id, 'reject')
    const registry = new SessionRegistry()
    await registry.get(session.id)
    await registry.setPendingInterrupts(session.id, [])
  } finally {
    await browser?.close()
    await vite?.close()
    await new Promise(resolve => server.close(resolve))
  }
}
