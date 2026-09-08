import { expect, test } from '@playwright/test'
import { json, mockBaseApi, sse } from './support/mockAgent'

test('tool artifacts use A2UI, preserve delivery versions and retire after successful deletion', async ({ page }) => {
  let deleted = false
  const runs: any[] = []
  const tool = (id: string, name: string, input: unknown, status = 'completed') => ({
    type: 'tool', id, name, state: { input, status, result: 'ok', ...(status === 'error' ? { error: 'failed' } : {}) },
  })
  await mockBaseApi(page, (route, url) => {
    if (url.pathname.endsWith('/message')) {
      void json(route, { data: [
        { id: 'writes', type: 'assistant', content: [
          tool('write1', 'write', { path: 'report.txt' }),
          tool('write2', 'write', { path: 'report.txt' }),
          tool('failed', 'write', { path: 'failed.txt' }, 'error'),
          ...(deleted ? [tool('delete', 'bash', { command: 'Remove-Item "report.txt"' })] : []),
        ] },
        { id: 'request', type: 'user', text: '生成交付文件' },
      ], cursor: {} })
      return true
    }
    if (url.pathname.endsWith('/workspace-file')) {
      void route.fulfill({ contentType: 'text/plain', body: 'tool report preview' })
      return true
    }
    if (url.pathname.endsWith('/agui')) {
      const body = route.request().postDataJSON()
      runs.push(body)
      void route.fulfill({ contentType: 'text/event-stream', body: sse([
        { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
        { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId },
      ]) })
      return true
    }
    return false
  }, [{ id: 'tool-approval', reason: 'confirmation', metadata: { kind: 'form' }, responseSchema: { type: 'boolean' } }])
  await page.goto('/#/chat?session=session-a')
  const surfaces = page.locator('.a2ui-card--compact').getByTestId('a2ui-activity-renderer')
  await expect(surfaces).toHaveCount(2)
  await expect(surfaces.getByText('failed.txt', { exact: true })).toHaveCount(0)
  await expect(surfaces.locator('.generated-artifact-card__confirm')).toHaveCount(1)
  await surfaces.last().locator('.generated-artifact-card__main').click()
  await expect(page.getByTestId('file-preview-panel')).toContainText('tool report preview')
  await expect(page.locator('.file-preview-panel__version')).toHaveText('当前文件')
  expect(runs).toHaveLength(0)
  await page.keyboard.press('Escape')
  await page.locator('.agent-chat__header').getByRole('button', { name: /交付/ }).click()
  await expect(page.locator('.deliverable-item__actions em')).toHaveText(['当前文件', '当前文件'])
  await page.keyboard.press('Escape')
  await surfaces.last().locator('.generated-artifact-card__confirm').click()
  await expect.poll(() => runs.length).toBe(1)
  expect(runs[0].resume).toEqual([{ interruptId: 'tool-approval', status: 'resolved', payload: true }])
  deleted = true
  await page.reload()
  await expect(page.getByText('生成交付文件', { exact: true })).toBeVisible()
  await expect(surfaces).toHaveCount(0)
  await expect(page.getByTestId('generated-artifact-card')).toHaveCount(0)
})
