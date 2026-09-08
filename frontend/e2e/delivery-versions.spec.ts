import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { json, mockBaseApi } from './support/mockAgent'

test('same-path successful writes preview and download their original content after reload', async ({ page }) => {
  let mutableFileReads = 0
  await mockBaseApi(page, (route, url) => {
    if (url.pathname.endsWith('/message')) {
      void json(route, { data: [{ id: 'versions', type: 'assistant', content: [
        { type: 'tool', id: 'v1', name: 'write', state: { status: 'completed', input: { path: 'report.md', content: 'total: 300' }, result: 'ok' } },
        { type: 'tool', id: 'v2', name: 'write', state: { status: 'completed', input: { path: 'report.md', content: 'total: 350' }, result: 'ok' } },
      ] }], cursor: {} }); return true
    }
    if (url.pathname.endsWith('/workspace-file')) { mutableFileReads++; void json(route, 'latest only'); return true }
    return false
  })
  await page.goto('/#/chat?session=session-a')
  for (let replay = 0; replay < 2; replay++) {
    const cards = page.locator('.a2ui-card--compact').getByTestId('generated-artifact-card')
    await expect(cards).toHaveCount(2)
    for (const [index, total] of [300, 350].entries()) {
      await cards.nth(index).locator('.generated-artifact-card__main').click()
      const panel = page.getByTestId('file-preview-panel')
      await expect(panel).toContainText(`total: ${total}`)
      const downloading = page.waitForEvent('download')
      await panel.getByRole('link', { name: '下载文件', exact: true }).click()
      const download = await downloading
      expect(await readFile(await download.path(), 'utf8')).toBe(`total: ${total}`)
      await page.keyboard.press('Escape')
    }
    if (!replay) await page.reload()
  }
  expect(mutableFileReads).toBe(0)
})
