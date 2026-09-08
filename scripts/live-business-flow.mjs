// Isolated real-service five-stage acceptance. Never reads or changes demo-sales.
import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdir, readFile, access } from 'node:fs/promises'
import { once } from 'node:events'
import { chromium, expect } from '@playwright/test'
import { createServer as createViteServer } from 'vite'
import { OpenCodeClient } from '../adapter/src/opencode-client.mjs'
import { createServer } from '../adapter/src/server-entry.mjs'

assert.ok(process.env.OPENCODE_BASE_URL, 'Configure the real service URL and credentials')
const workspace = path.resolve('.local/live-delivery', crypto.randomUUID())
await mkdir(workspace, { recursive: true })
const client = new OpenCodeClient({ workspaceDirectory: workspace })
const stages = ['specification.json', 'design.json', 'transform.cjs', 'validation.json', 'release.json']
const expected = { total: 180, count: 2 }
const adapter = createServer({ client }).listen(0, '127.0.0.1')
await once(adapter, 'listening')
const target = `http://127.0.0.1:${adapter.address().port}`
let vite, browser, sessionId
let passed = false
try {
  vite = await createViteServer({ root: path.resolve('frontend'), server: { host: '127.0.0.1', port: 5191, strictPort: true, proxy: { '/dataagent/web/api': { target }, '/dataagent/web/api/agui': { target }, '/dataagent/web/api/agui/upload': { target } } } })
  await vite.listen()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ locale: 'zh-CN' })
  const runs = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname.endsWith('/agui') && !url.searchParams.has('mode')) runs.push(request.postDataJSON())
  })
  let model
  await expect.poll(async () => {
    model = await client.json('/api/model/default', {}, 'default model')
    return Boolean(model.id && model.providerID)
  }, { timeout: 15000 }).toBe(true)
  const session = await client.json('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Five-stage sales functional acceptance', location: { directory: workspace }, model: { providerID: model.providerID, id: model.id } }) }, 'create business acceptance session')
  sessionId = session.id
  console.log(JSON.stringify({ stage: 'created', sessionId, workspace }))
  const hydration = page.waitForResponse(response => new URL(response.url()).searchParams.get('mode') === 'hydrate')
  await page.goto(`http://127.0.0.1:5191/#/chat?session=${sessionId}`)
  await (await hydration).finished()
  await expect(page.locator('.agent-chat__loading')).toHaveCount(0)
  await expect(page.locator('.model-selector')).toContainText(model.name)
  const prompt = `执行真实五阶段功能验收，唯一工作目录 ${workspace}。不读取或修改任何项目文件，不联网，不安装依赖。仅允许此目录内 specification.json、design.json、transform.cjs、result.json、validation.json、release.json 六个文件。输入三笔订单：id=a,amount=100,status=approved；id=b,amount=80,status=approved；id=c,amount=120,status=cancelled。只统计approved订单，金额合计180，订单数2。
严格按顺序：
1. 使用write创建specification.json，JSON含phase="specification", filter="approved", expected={"total":180,"count":2}。随后调用question，选项只有“确认并继续”和“取消”，等待确认，不生成后续文件。
2. 确认后使用write创建design.json，含phase="design", inputCount=3, excludedStatus="cancelled"。再question同样选项并等待。
3. 确认后使用write创建transform.cjs。必须是实际可执行的Node CommonJS程序，内嵌上述三个订单，filter和reduce计算，使用node:fs和node:path将只含total与count的JSON写入__dirname下result.json。不得直接硬编码计算结果。然后仅使用shell执行 node "${path.join(workspace, 'transform.cjs')}"，并读取result.json验证真实执行结果。最后question同样选项等待，不提前生成validation.json。
4. 确认后读取result.json，对照需求校验，使用write创建validation.json，含phase="validation", actual={"total":180,"count":2}, passed=true, evidence="executed-transform"。再question同样选项等待，不提前生成release.json。
5. 最后确认后使用write创建release.json，含phase="release", accepted=true, result={"total":180,"count":2}, artifacts=["specification.json","design.json","transform.cjs","result.json","validation.json"]，最后回复 BUSINESS_RELEASED。不伪造性能、生产数据或外部系统验收。若任一阶段取消，停止后续步骤。`
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.evaluate(text => navigator.clipboard.writeText(text), prompt)
  await page.locator('.agent-chat__composer [contenteditable=true]').first().press('Control+V')
  await page.locator('.elx-x-sender__send-button').click()
  await expect.poll(() => runs.length, { timeout: 15000, message: 'Composer must publish the first AG-UI request' }).toBe(1)
  console.log(JSON.stringify({ stage: 'submitted', sessionId }))
  const preview = page.getByTestId('file-preview-panel')
  for (let index = 0; index < stages.length; index++) {
    const name = stages[index]
    const card = page.locator('.a2ui-card--compact').getByTestId('generated-artifact-card').filter({ hasText: name }).last()
    await expect(card).toBeVisible({ timeout: 180000 })
    if (index < 4) {
      await expect.poll(async () => (await client.listForms(sessionId)).length, { timeout: 180000, message: `${name} must reach its real approval gate` }).toBe(1)
    } else {
      await expect.poll(async () => (await client.getSession(sessionId)).outcome, { timeout: 180000 }).toBe('succeeded')
    }
    await expect(page.locator('.elx-x-sender__loading-button')).toHaveCount(0, { timeout: 180000 })
    assert.equal(runs.length, index + 1)
    for (const future of stages.slice(index + 1)) {
      assert.equal(await access(path.join(workspace, future)).then(() => true, () => false), false, `${future} must not exist before approval`)
    }
    if (index >= 2) assert.deepEqual(JSON.parse(await readFile(path.join(workspace, 'result.json'), 'utf8')), expected)
    if (index === 0) assert.deepEqual(JSON.parse(await readFile(path.join(workspace, name), 'utf8')).expected, expected)
    if (index === 1) assert.equal(JSON.parse(await readFile(path.join(workspace, name), 'utf8')).excludedStatus, 'cancelled')
    if (index === 3) {
      const validation = JSON.parse(await readFile(path.join(workspace, name), 'utf8'))
      assert.equal(validation.passed, true)
      assert.deepEqual(validation.actual, expected)
    }
    await page.reload()
    await expect(card).toBeVisible({ timeout: 20000 })
    await card.locator('.generated-artifact-card__main').click()
    await expect(preview).toContainText(name)
    await expect(preview.locator('pre')).toHaveText(await readFile(path.join(workspace, name), 'utf8'))
    const downloading = page.waitForEvent('download')
    await preview.getByRole('link', { name: '下载文件', exact: true }).click()
    const download = await downloading
    assert.deepEqual(await readFile(await download.path()), await readFile(path.join(workspace, name)))
    console.log(JSON.stringify({ stage: 'verified', name, sessionId }))
    if (index < 4) {
      assert.equal((await client.listForms(sessionId)).length, 1)
      await preview.locator('.file-preview-panel__confirm').click()
      await expect.poll(() => runs.length).toBe(index + 2)
      assert.equal(runs.at(-1).resume.length, 1)
      assert.equal(runs.at(-1).resume[0].status, 'resolved')
      await page.keyboard.press('Escape')
    }
  }
  const release = JSON.parse(await readFile(path.join(workspace, 'release.json'), 'utf8'))
  assert.equal(release.accepted, true)
  assert.deepEqual(release.result, expected)
  assert.deepEqual([...release.artifacts].sort(), ['specification.json', 'design.json', 'transform.cjs', 'result.json', 'validation.json'].sort())
  assert.deepEqual(await client.listForms(sessionId), [])
  const history = await client.json(`/api/session/${sessionId}/message?limit=100`, {}, 'verify executed development tool')
  const toolCalls = (Array.isArray(history) ? history : history.data).flatMap(message => message.content ?? []).filter(part => part.type === 'tool')
  assert.ok(toolCalls.some(tool => tool.name === 'shell' && tool.state?.status === 'completed'
    && tool.state?.metadata?.exit === 0 && /node\s+.*transform\.cjs/.test(tool.state?.input?.command ?? '')),
  'Development must contain a successful real Node execution, not only claimed evidence')
  const program = await readFile(path.join(workspace, 'transform.cjs'), 'utf8')
  assert.match(program, /\.filter\s*\(/)
  assert.match(program, /\.reduce\s*\(/)
  await expect.poll(async () => (await client.getSession(sessionId)).outcome, { timeout: 15000 }).toBe('succeeded')
  assert.equal(runs.length, 5)
  assert.deepEqual(errors, [])
  passed = true
  console.log(JSON.stringify({ check: 'isolated five-stage business flow', result: 'passed', sessionId, workspace }))
} catch (error) {
  console.error(JSON.stringify({ result: 'failed', sessionId, workspace, error: error.stack || String(error) }))
  throw error
} finally {
  if (!passed && sessionId) {
    await client.json(`/api/session/${sessionId}/interrupt`, { method: 'POST' }, 'cleanup failed acceptance').catch(() => {})
  }
  await browser?.close()
  await vite?.close()
  await new Promise(resolve => adapter.close(resolve))
}
