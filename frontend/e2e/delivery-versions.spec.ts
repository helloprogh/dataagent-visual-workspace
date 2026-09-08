import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { json, mockBaseApi } from './support/mockAgent'

test('archive source entries remain inert text despite a binary content type', async ({ page }) => {
  const source = '<script>globalThis.CODE_EXECUTED=true</script>\nconsole.log("source only")'
  await mockBaseApi(page, (route, url) => {
    if (url.pathname.endsWith('/message')) {
      void json(route, { data: [{ id: 'archive-code', type: 'user', text: '查看源码', files: [
        { uri: '/dataagent/web/api/agui/workspace-file?path=source.zip', mime: 'application/zip', name: 'source.zip' },
      ] }], cursor: {} }); return true
    }
    if (url.pathname.endsWith('/workspace-archive')) {
      if (url.searchParams.has('entry')) void route.fulfill({ contentType: 'application/octet-stream', body: source })
      else void json(route, { data: { entries: [{ path: 'transform.CJS', kind: 'file', size: source.length }] } })
      return true
    }
    return false
  })
  await page.goto('/#/chat?session=session-a')
  await page.locator('.attachment-card').filter({ hasText: 'source.zip' }).click()
  const panel = page.getByTestId('file-preview-panel')
  await panel.getByRole('button', { name: /transform.CJS/ }).click()
  await expect(panel.locator('.archive-preview__text')).toHaveText(source)
  await expect(panel.locator('pre script, iframe')).toHaveCount(0)
  expect(await page.evaluate(() => (globalThis as any).CODE_EXECUTED)).toBeUndefined()
})

test('generated source code previews as inert text and downloads exact bytes after reload', async ({ page }) => {
  const source = 'globalThis.CODE_EXECUTED = true;\n// <img src=x onerror="globalThis.CODE_EXECUTED=true">\nconst result = [100,80].reduce((a,b) => a+b, 0);'
  await mockBaseApi(page, (route, url) => {
    if (!url.pathname.endsWith('/message')) return false
    void json(route, { data: [{ id: 'code', type: 'assistant', content: [
      { type: 'tool', id: 'code-write', name: 'write', state: { status: 'completed', input: { path: 'transform.cjs', content: source }, result: 'ok' } },
    ] }], cursor: {} })
    return true
  })
  await page.goto('/#/chat?session=session-a')
  for (let replay = 0; replay < 2; replay++) {
    await page.locator('.a2ui-card--compact').getByTestId('generated-artifact-card').locator('.generated-artifact-card__main').click()
    const panel = page.getByTestId('file-preview-panel')
    await expect(panel.locator('pre')).toHaveText(source)
    await expect(panel.locator('pre img, pre script, iframe')).toHaveCount(0)
    expect(await page.evaluate(() => (globalThis as any).CODE_EXECUTED)).toBeUndefined()
    const downloading = page.waitForEvent('download')
    await panel.getByRole('link', { name: '下载文件', exact: true }).click()
    expect(await readFile(await (await downloading).path(), 'utf8')).toBe(source)
    if (!replay) await page.reload()
  }
})

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
      await expect(panel.locator('.file-preview-panel__version')).toHaveText(`v${index + 1}`)
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
