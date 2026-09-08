// Read-only acceptance of an existing isolated revision + ZIP delivery session.
import assert from 'node:assert/strict'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { once } from 'node:events'
import { createServer as createViteServer } from 'vite'
import { chromium, expect } from '@playwright/test'
import { OpenCodeClient } from '../adapter/src/opencode-client.mjs'
import { createServer } from '../adapter/src/server-entry.mjs'
import { readZipEntries, readZipEntry } from '../adapter/src/archive-preview.mjs'

assert.ok(process.env.OPENCODE_BASE_URL, 'Configure real service URL and credentials')
const sessionId = process.env.LIVE_DELIVERY_REPLAY_SESSION
assert.ok(sessionId, 'Set an existing isolated revision + ZIP test session')
const session = await new OpenCodeClient().getSession(sessionId)
const workspace = path.resolve(session.location.directory)
const relative = path.relative(path.resolve('.local/live-delivery'), workspace)
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Only isolated live-delivery test directories are in scope')
assert.equal(session.outcome, 'succeeded')
const client = new OpenCodeClient({ workspaceDirectory: workspace })
assert.deepEqual(await client.listForms(sessionId), [])
const expected = { accepted: true, total: 350, count: 4 }
assert.deepEqual(JSON.parse(await readFile(path.join(workspace, 'release.json'), 'utf8')), expected)
const zip = await readFile(path.join(workspace, 'delivery.zip'))
const entries = readZipEntries(zip)
assert.deepEqual(entries.map(entry => entry.path).sort(), ['release.json', 'report.md'])
assert.deepEqual(JSON.parse(readZipEntry(zip, entries.find(entry => entry.path === 'release.json')).toString('utf8')), expected)
assert.match(readZipEntry(zip, entries.find(entry => entry.path === 'report.md')).toString('utf8'), /total:\s*350/)
const adapter = createServer({ client }).listen(0, '127.0.0.1')
await once(adapter, 'listening')
const target = `http://127.0.0.1:${adapter.address().port}`
const vite = await createViteServer({ root: path.resolve('frontend'), server: { host: '127.0.0.1', port: 5191, strictPort: true, proxy: { '/dataagent/web/api': { target }, '/dataagent/web/api/agui': { target }, '/dataagent/web/api/agui/upload': { target } } } })
await vite.listen()
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ locale: 'zh-CN' })
const errors = []
let runs = 0
page.on('pageerror', error => errors.push(error.message))
page.on('crash', () => console.error('Browser page crashed'))
page.on('request', request => {
  const url = new URL(request.url())
  if (url.pathname.endsWith('/agui') && !url.searchParams.has('mode')) runs++
})
try {
  await page.goto(`http://127.0.0.1:5191/#/chat?session=${sessionId}`)
  for (let replay = 0; replay < 2; replay++) {
    const cards = page.locator('.a2ui-card--compact').getByTestId('generated-artifact-card')
    const reports = cards.filter({ hasText: 'report.md' })
    await expect(reports).toHaveCount(2, { timeout: 20000 })
    const preview = page.getByTestId('file-preview-panel')
    for (const [index, total] of [300, 350].entries()) {
      await reports.nth(index).locator('.generated-artifact-card__main').click()
      await expect(preview).toContainText(`total: ${total}`)
      await expect(preview.locator('.file-preview-panel__confirm')).toHaveCount(0)
      await page.keyboard.press('Escape')
    }
    await cards.filter({ hasText: 'delivery.zip' }).first().locator('.generated-artifact-card__main').click()
    await expect(preview.locator('.archive-preview__entry')).toHaveCount(2)
    await expect(preview.locator('.file-preview-panel__version')).toHaveText('当前文件')
    await preview.locator('.archive-preview__entry').filter({ hasText: 'report.md' }).click()
    await expect(preview.locator('.archive-preview__content')).toContainText('total: 350')
    await preview.locator('.archive-preview__entry').filter({ hasText: 'release.json' }).click()
    await expect(preview.locator('.archive-preview__content')).toContainText('accepted')
    const downloading = page.waitForEvent('download')
    await preview.getByRole('link', { name: '下载文件', exact: true }).click()
    const download = await downloading
    assert.equal(download.suggestedFilename(), 'delivery.zip')
    assert.deepEqual(await readFile(await download.path()), zip)
    await page.keyboard.press('Escape')
    await page.locator('.agent-chat__header').getByRole('button', { name: /交付/ }).click()
    await expect(page.locator('.deliverables-panel .deliverable-item')).toHaveCount(4)
    await expect(page.locator('.deliverables-panel .approval-summary')).toHaveCount(0)
    console.log(JSON.stringify({ stage: 'replay verified', replay, sessionId }))
    if (!replay) await page.reload()
  }
  assert.equal(runs, 0, 'Read-only acceptance must never generate or submit approval')
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ check: 'existing combined revision and ZIP delivery acceptance', result: 'passed', sessionId }))
} finally {
  await browser.close()
  await vite.close()
  await new Promise(resolve => adapter.close(resolve))
}
