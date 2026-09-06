import { expect, test } from '@playwright/test'
import { json, mockBaseApi, sse } from './support/mockAgent'

const content = {
  version: 1, surfaceId: 'legacy-sales', title: '旧销售报告', summary: '历史兼容摘要', status: 'ready', cards: [
    { id: 'text', kind: 'text', text: '历史纯文本' },
    { id: 'markdown', kind: 'markdown', text: '**历史 Markdown**' },
    { id: 'metrics', kind: 'metrics', items: [{ label: '历史订单', value: 128, detail: '同比持平' }] },
    { id: 'table', kind: 'table', columns: [{ key: 'area', label: '区域' }], rows: [{ area: '华东' }] },
    { id: 'file', kind: 'file', name: 'report.txt', url: '/dataagent/web/api/agui/workspace-file?path=report.txt', mimeType: 'text/plain', approvalInterruptId: 'legacy-approval' },
  ],
}

test('all legacy cards replay through A2UI, with local preview and AG-UI approval', async ({ page }) => {
  const runs: any[] = []
  await mockBaseApi(page, (route, url) => {
    if (url.pathname.endsWith('/session/session-a/message')) {
      void json(route, { data: [{ id: 'parent', type: 'user', text: '历史分析请求' }], cursor: {}, activities: [
        { parentMessageId: 'parent', messageId: 'legacy-message', activityType: 'dataagent.ui', content },
      ] })
      return true
    }
    if (url.pathname.endsWith('/workspace-file')) {
      void route.fulfill({ contentType: 'text/plain', body: 'historical report body' })
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
  }, [{ id: 'legacy-approval', reason: 'confirmation', message: '确认报告', metadata: { kind: 'form' }, responseSchema: { type: 'string', enum: ['同意', '拒绝'] } }])
  await page.goto('/#/chat?session=session-a')
  const renderer = page.getByTestId('a2ui-activity-renderer')
  for (const text of ['历史纯文本', '历史 Markdown', '历史订单', '128', '同比持平', '区域', '华东']) await expect(renderer.getByText(text, { exact: true })).toBeVisible()
  await expect(page.locator('.generated-card')).toHaveCount(0)
  await expect(page.locator('.a2ui-card')).toContainText('历史兼容摘要')
  await page.reload()
  const artifact = renderer.getByTestId('generated-artifact-card')
  await artifact.locator('.generated-artifact-card__main').click()
  await expect(page.getByTestId('file-preview-panel')).toContainText('historical report body')
  expect(runs).toHaveLength(0)
  await page.keyboard.press('Escape')
  await artifact.locator('.generated-artifact-card__confirm').click()
  await expect.poll(() => runs.length).toBe(1)
  expect(runs[0].resume).toEqual([{ interruptId: 'legacy-approval', status: 'resolved', payload: '同意' }])
  await expect(artifact.locator('.generated-artifact-card__confirm')).toHaveCount(0)
  await page.getByText('会话 B', { exact: true }).click()
  await expect(renderer).toHaveCount(0)
})

test('removed legacy snapshot stays removed after reload', async ({ page }) => {
  await mockBaseApi(page, (route, url) => {
    if (!url.pathname.endsWith('/message')) return false
    void json(route, { data: [{ id: 'parent', type: 'user', text: '已删除交付' }], cursor: {}, activities: [
      { parentMessageId: 'parent', messageId: 'removed-message', activityType: 'dataagent.ui', content: { ...content, status: 'removed' } },
    ] })
    return true
  })
  await page.goto('/#/chat?session=session-a')
  await expect(page.getByText('已删除交付', { exact: true })).toBeVisible()
  await expect(page.getByTestId('a2ui-activity-renderer')).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('已删除交付', { exact: true })).toBeVisible()
  await expect(page.getByTestId('generated-artifact-card')).toHaveCount(0)
})
