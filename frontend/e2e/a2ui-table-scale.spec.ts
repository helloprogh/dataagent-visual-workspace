import { expect, test } from '@playwright/test'
import { A2uiStream } from '../../adapter/src/a2ui.mjs'
import { mockBaseApi, sse } from './support/mockAgent'

test('large A2UI table bounds DOM without losing rows or emitting agent actions', async ({ page }, testInfo) => {
  let runs = 0
  const producer = new A2uiStream('session-a', 'table-scale')
  await mockBaseApi(page, (route, url) => {
    if (url.pathname !== '/dataagent/web/api/agui') return false
    const body = route.request().postDataJSON()
    runs++
    const snapshot = producer.publish({ surfaceId: 'large-table', components: [
      { id: 'root', component: 'DataTable', title: '全量数据', columns: ['name', 'value'], rows: { path: '/rows' } },
    ], data: { rows: runs === 1 ? Array.from({ length: 5000 }, (_, index) => [index, index]) : runs === 2 ? [{ name: '更新行', value: 7 }, { name: '缺省值' }] : [] } }, 'parent')[0]
    expect(snapshot).toBeDefined()
    void route.fulfill({ contentType: 'text/event-stream', body: sse([
      { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId }, snapshot,
      { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId },
    ]) })
    return true
  })
  await page.goto('/#/chat?session=session-a')
  await expect(page.locator('.model-selector')).toContainText('GPT A')
  await page.locator('.agent-chat__composer [contenteditable=true]').first().fill('展示表格')
  const start = Date.now()
  await page.locator('.elx-x-sender__send-button').click()
  const rows = page.locator('.a2ui-card tbody tr')
  await expect(rows).toHaveCount(50)
  const metrics = { totalRows: 5000, domRows: await rows.count(), readyMs: Date.now() - start }
  console.log('A2UI_TABLE_SCALE', JSON.stringify(metrics))
  await testInfo.attach('a2ui-table-scale.json', { body: JSON.stringify(metrics), contentType: 'application/json' })
  expect(runs).toBe(1)
  const pager = page.getByRole('navigation', { name: '表格分页' })
  await pager.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(rows.first().locator('td').first()).toHaveText('50')
  await pager.getByRole('button', { name: '末页', exact: true }).click()
  await expect(rows.last().locator('td').first()).toHaveText('4999')
  await expect(rows).toHaveCount(50)
  await expect(pager.getByRole('button', { name: '下一页', exact: true })).toBeDisabled()
  expect(runs).toBe(1)
  for (const count of [2, 0]) {
    await page.locator('.agent-chat__composer [contenteditable=true]').first().fill('更新表格')
    await page.locator('.elx-x-sender__send-button').click()
    await expect(rows).toHaveCount(count)
    await expect(pager).toHaveCount(0)
    if (count) {
      await expect(rows.first()).toContainText('更新行')
      await expect(rows.last().locator('td').last()).toHaveText('')
    } else await expect(page.locator('.a2ui-data-table')).toContainText('暂无数据')
  }
})
