// Explicit real-service acceptance: generate -> preview -> approve -> release -> replay.
import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdir, readFile, access } from 'node:fs/promises'
import { once } from 'node:events'
import { createServer as createViteServer } from 'vite'
import { chromium, expect } from '@playwright/test'
import { OpenCodeClient } from '../adapter/src/opencode-client.mjs'
import { createServer } from '../adapter/src/server-entry.mjs'

assert.ok(process.env.OPENCODE_BASE_URL, 'Configure real OpenCode URL and credentials')
const workspace = path.resolve('.local/live-delivery', crypto.randomUUID())
await mkdir(workspace, { recursive: true })
const client = new OpenCodeClient({ workspaceDirectory: workspace })
const adapter = createServer({ client }).listen(0, '127.0.0.1')
await once(adapter, 'listening')
const target = `http://127.0.0.1:${adapter.address().port}`
const vite = await createViteServer({ root: path.resolve('frontend'), server: { host: '127.0.0.1', port: 5191, strictPort: true, proxy: { '/dataagent/web/api': { target }, '/dataagent/web/api/agui': { target }, '/dataagent/web/api/agui/upload': { target } } } })
await vite.listen()
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ locale: 'zh-CN' })
const agentRequests = []
page.on('request', request => {
  if (new URL(request.url()).pathname.endsWith('/agui') && !new URL(request.url()).searchParams.has('mode')) agentRequests.push(request.postDataJSON())
})
let sessionId
try {
  let model
  await expect.poll(async () => {
    model = await client.json('/api/model/default', {}, 'default model')
    return Boolean(model.id && model.providerID)
  }, { timeout: 15000 }).toBe(true)
  const session = await client.json('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'UI sales delivery acceptance', location: { directory: workspace }, model: { providerID: model.providerID, id: model.id } }) }, 'create acceptance session')
  sessionId = session.id
  const hydrated = page.waitForResponse(response => new URL(response.url()).searchParams.get('mode') === 'hydrate')
  await page.goto(`http://127.0.0.1:5191/#/chat?session=${sessionId}`)
  await (await hydrated).finished()
  await expect(page.locator('.model-selector')).toContainText(model.name)
  await page.locator('.agent-chat__composer [contenteditable=true]').first().fill(`这是隔离目录 ${workspace} 中的数据交付验收。只允许创建 report.md 和 release.json，不修改其他文件，不运行shell、不读取项目文件。输入三笔销售金额100、80、120。先计算订单数和总额，使用write工具生成report.md，标题为Sales acceptance，包含total: 300和count: 3。写完后调用question工具询问验收，选项“验收通过”和“退回修改”，必须等待选择，不提前生成release.json。选择验收通过后才用write工具创建release.json，内容为JSON对象accepted=true、total=300、count=3，最后回复 DELIVERY_RELEASED。`)
  const submitted = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/agui') && !new URL(request.url()).searchParams.has('mode'))
  await page.locator('.elx-x-sender__send-button').click()
  await submitted
  console.log(JSON.stringify({ stage: 'submitted', sessionId, workspace }))
  const report = page.locator('.a2ui-card--compact').getByTestId('generated-artifact-card').filter({ hasText: 'report.md' }).first()
  await expect(report).toBeVisible({ timeout: 120000 })
  await expect(page.locator('.elx-x-sender__loading-button')).toHaveCount(0, { timeout: 120000 })
  assert.equal((await client.listForms(sessionId)).length, 1)
  assert.equal(await access(path.join(workspace, 'release.json')).then(() => true, () => false), false, 'Release must not exist before approval')
  const content = await readFile(path.join(workspace, 'report.md'), 'utf8')
  assert.match(content, /total:\s*300/)
  assert.match(content, /count:\s*3/)
  await report.locator('.generated-artifact-card__main').click()
  const preview = page.getByTestId('file-preview-panel')
  await expect(preview).toContainText('Sales acceptance')
  await expect(preview).toContainText('300')
  console.log(JSON.stringify({ stage: 'report preview and approval gate passed', sessionId }))
  await page.reload()
  await expect(report).toBeVisible({ timeout: 15000 })
  await report.locator('.generated-artifact-card__main').click()
  await expect(preview).toContainText('300')
  await expect(preview.locator('.file-preview-panel__approval')).toBeVisible()
  assert.equal(agentRequests.length, 1, 'Preview and replay must not create an agent run')
  await preview.locator('.file-preview-panel__confirm').click()
  await expect(page.locator('.assistant-content').last()).toContainText('DELIVERY_RELEASED', { timeout: 120000 })
  await expect(page.locator('.elx-x-sender__loading-button')).toHaveCount(0, { timeout: 15000 })
  assert.deepEqual(JSON.parse(await readFile(path.join(workspace, 'release.json'), 'utf8')), { accepted: true, total: 300, count: 3 })
  assert.deepEqual(await client.listForms(sessionId), [])
  assert.equal(agentRequests.length, 2)
  assert.equal(agentRequests[1].resume.length, 1)
  assert.equal(agentRequests[1].resume[0].status, 'resolved')
  assert.ok(JSON.stringify(agentRequests[1].resume[0].payload).includes('验收通过'))
  await page.reload()
  const release = page.getByTestId('generated-artifact-card').filter({ hasText: 'release.json' }).first()
  await expect(release).toBeVisible({ timeout: 15000 })
  await release.locator('.generated-artifact-card__main').click()
  await expect(preview).toContainText('accepted')
  await expect(preview).toContainText('300')
  await expect(preview.locator('.file-preview-panel__confirm')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.locator('.agent-chat__header').getByRole('button', { name: /交付/ }).click()
  const deliveries = page.locator('.deliverables-panel .deliverable-item')
  await expect(deliveries).toHaveCount(2)
  const link = await deliveries.filter({ hasText: 'release.json' }).getByRole('link').getAttribute('href')
  assert.ok(link)
  const download = await page.request.get(new URL(link, page.url()).href)
  assert.ok(download.ok())
  assert.deepEqual(await download.json(), { accepted: true, total: 300, count: 3 })
  assert.equal(agentRequests.length, 2, 'Delivery browsing and downloading must remain local')
  console.log(JSON.stringify({ check: 'real delivery generation preview approval release replay', result: 'passed', sessionId, workspace }))
} catch (error) {
  console.log(JSON.stringify({ stage: 'failure', sessionId, recovery: await page.locator('.run-recovery').allTextContents() }))
  if (sessionId) await client.json(`/api/session/${sessionId}/interrupt`, { method: 'POST' }, 'cleanup').catch(() => undefined)
  throw error
} finally {
  if (sessionId) for (const form of await client.listForms(sessionId)) await client.cancelForm(sessionId, form.id)
  await browser.close()
  await vite.close()
  await new Promise(resolve => adapter.close(resolve))
}
