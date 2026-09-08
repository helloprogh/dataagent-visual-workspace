// Read-only UI acceptance of the five-stage session, including source-code bodies.
import assert from 'node:assert/strict'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { once } from 'node:events'
import { chromium, expect } from '@playwright/test'
import { createServer as createViteServer } from 'vite'
import { OpenCodeClient } from '../adapter/src/opencode-client.mjs'
import { createServer } from '../adapter/src/server-entry.mjs'

assert.ok(process.env.OPENCODE_BASE_URL, 'Configure real service credentials')
const sessionId = process.env.LIVE_BUSINESS_REPLAY_SESSION
assert.ok(sessionId, 'Set a completed isolated five-stage session')
const session = await new OpenCodeClient().getSession(sessionId)
const workspace = path.resolve(session.location.directory)
const relative = path.relative(path.resolve('.local/live-delivery'), workspace)
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Only isolated acceptance directories are in scope')
assert.equal(session.outcome, 'succeeded')
const client = new OpenCodeClient({ workspaceDirectory: workspace })
assert.deepEqual(await client.listForms(sessionId), [])
const names = ['specification.json', 'design.json', 'transform.cjs', 'validation.json', 'release.json']
const contents = new Map(await Promise.all(names.map(async name => [name, await readFile(path.join(workspace, name), 'utf8')])))
assert.deepEqual(JSON.parse(contents.get('release.json')).result, { total: 180, count: 2 })
const adapter = createServer({ client }).listen(0, '127.0.0.1')
await once(adapter, 'listening')
const target = `http://127.0.0.1:${adapter.address().port}`
let vite, browser
try {
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
  await page.goto(`http://127.0.0.1:5191/#/chat?session=${sessionId}`)
  for (let replay = 0; replay < 2; replay++) {
    for (const name of names) {
      const card = page.locator('.a2ui-card--compact').getByTestId('generated-artifact-card').filter({ hasText: name }).last()
      await expect(card).toBeVisible({ timeout: 20000 })
      await card.locator('.generated-artifact-card__main').click()
      const panel = page.getByTestId('file-preview-panel')
      await expect(panel.locator('pre')).toHaveText(contents.get(name))
      await expect(panel.locator('iframe, pre script')).toHaveCount(0)
      await expect(panel.locator('.file-preview-panel__confirm')).toHaveCount(0)
      const downloading = page.waitForEvent('download')
      await panel.getByRole('link', { name: '下载文件', exact: true }).click()
      const download = await downloading
      assert.equal(download.suggestedFilename(), name)
      assert.equal(await readFile(await download.path(), 'utf8'), contents.get(name))
      await page.keyboard.press('Escape')
    }
    console.log(JSON.stringify({ stage: 'all five bodies and downloads verified', replay, sessionId }))
    if (!replay) await page.reload()
  }
  assert.equal(runs, 0)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ check: 'five-stage content replay', result: 'passed', sessionId }))
} finally {
  await browser?.close()
  await vite?.close()
  await new Promise(resolve => adapter.close(resolve))
}
