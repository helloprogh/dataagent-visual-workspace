// Opt-in real tool permission browser test. Only reads the dedicated fixture.
import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { once } from 'node:events'
import { createServer as createViteServer } from 'vite'
import { chromium, expect } from '@playwright/test'
import { OpenCodeClient } from '../adapter/src/opencode-client.mjs'
import { createServer } from '../adapter/src/server-entry.mjs'

assert.ok(process.env.OPENCODE_BASE_URL, 'Configure a real OpenCode service')
assert.ok(process.env.LIVE_PERMISSION_FIXTURE, 'Set the absolute path to a dedicated permission-marker fixture outside the session project')
const fixture = path.resolve(process.env.LIVE_PERMISSION_FIXTURE)
const decision = process.env.LIVE_PERMISSION_DECISION ?? 'reject'
assert.ok(['once', 'reject'].includes(decision), 'Only once/reject are allowed; never persist global permission')
const workspace = path.resolve('.local/permission-tool-workspace')
await mkdir(workspace, { recursive: true })
const client = new OpenCodeClient({ workspaceDirectory: workspace })
const adapter = createServer({ client }).listen(0, '127.0.0.1')
await once(adapter, 'listening')
const target = `http://127.0.0.1:${adapter.address().port}`
const vite = await createViteServer({ root: path.resolve('frontend'), server: { host: '127.0.0.1', port: 5190, strictPort: true, proxy: { '/dataagent/web/api': { target }, '/dataagent/web/api/agui': { target }, '/dataagent/web/api/agui/upload': { target } } } })
await vite.listen()
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ locale: 'zh-CN' })
let sessionId
try {
  let model
  await expect.poll(async () => {
    model = await client.json('/api/model/default', {}, 'default model')
    return Boolean(model.id && model.providerID)
  }, { timeout: 15000 }).toBe(true)
  const session = await client.json('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `UI tool permission ${decision}`, agent: 'explore', location: { directory: workspace }, model: { providerID: model.providerID, id: model.id } }) }, 'create isolated session')
  sessionId = session.id
  const hydrated = page.waitForResponse(response => new URL(response.url()).searchParams.get('mode') === 'hydrate')
  await page.goto(`http://127.0.0.1:5190/#/chat?session=${sessionId}`)
  assert.ok((await hydrated).ok())
  await (await hydrated).finished()
  await expect(page.locator('.model-selector')).toContainText(model.name, { timeout: 20000 })
  await page.locator('.agent-chat__composer [contenteditable=true]').first().fill(`只使用 read 工具读取此专用测试文件 ${fixture}，如需授权请等待。允许后仅回复文件内容；若拒绝则回复 PERMISSION_REJECTED，不重试、不读取其他文件、不使用shell、不修改文件。`)
  const submitted = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/agui') && !new URL(request.url()).searchParams.has('mode'))
  await page.locator('.elx-x-sender__send-button').click()
  await submitted
  console.log(JSON.stringify({ stage: 'submitted', sessionId }))
  const card = page.locator('.interrupt-card')
  await expect(card).toBeVisible({ timeout: 90000 })
  const pending = await client.listPermissions(sessionId)
  assert.equal(pending.length, 1)
  assert.equal(pending[0].action, 'external_directory')
  await page.reload()
  await expect(card).toBeVisible({ timeout: 15000 })
  await card.getByRole('button', { name: decision === 'once' ? '仅本次允许' : '拒绝', exact: true }).click()
  if (decision === 'once') {
    await expect(page.locator('.assistant-content').last()).toContainText('PERMISSION_FIXTURE_8c2ab3d9', { timeout: 90000 })
  } else {
    // Native permission refusal interrupts the execution; it need not produce an explanation.
    await expect(page.locator('.run-recovery')).toContainText('Step interrupted', { timeout: 20000 })
    const history = await client.json(`/api/session/${sessionId}/message?limit=20`, {}, 'verify rejected tool')
    const tools = (Array.isArray(history) ? history : history.data).flatMap(item => item.content ?? []).filter(item => item.type === 'tool')
    assert.ok(tools.some(tool => tool.name === 'read' && tool.state?.status === 'error' && tool.state?.error?.message === 'The user declined this tool call'))
    if (process.env.LIVE_PERMISSION_UI_ONLY !== '1') {
      await expect.poll(async () => (await client.getSession(sessionId)).outcome, { timeout: 20000, message: 'Rejected tool must reach native interrupted terminal state' }).toBe('interrupted')
    }
  }
  await expect(page.locator('.elx-x-sender__loading-button')).toHaveCount(0, { timeout: 15000 })
  assert.deepEqual(await client.listPermissions(sessionId), [])
  await page.reload()
  await expect(page.locator('.model-selector')).toContainText(model.name, { timeout: 15000 })
  if (decision === 'once') await expect(page.locator('.assistant-content').last()).toContainText('PERMISSION_FIXTURE_8c2ab3d9', { timeout: 15000 })
  await expect(card).toHaveCount(0)
  console.log(JSON.stringify({ check: 'real tool permission', decision, sessionId, result: 'passed', scope: process.env.LIVE_PERMISSION_UI_ONLY === '1' ? 'UI and tool response only; durable native outcome excluded' : 'including durable native outcome for rejection' }))
} catch (error) {
  console.log(JSON.stringify({ check: 'failure diagnostics', sessionId,
    loadingControls: await page.locator('.elx-x-sender__loading-button').count(),
    pendingCards: await page.locator('.interrupt-card').count(),
    recovery: await page.locator('.run-recovery').allTextContents(),
  }))
  // Cleanup is not success evidence: retain the original failed assertion.
  if (sessionId) await client.json(`/api/session/${sessionId}/interrupt`, { method: 'POST' }, 'Cleanup failed test run').catch(() => undefined)
  throw error
} finally {
  if (sessionId) for (const permission of await client.listPermissions(sessionId)) await client.replyPermission(sessionId, permission.id, 'reject')
  await browser.close()
  await vite.close()
  await new Promise(resolve => adapter.close(resolve))
}
