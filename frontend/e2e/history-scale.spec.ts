import { expect, test } from '@playwright/test'
import { json, mockBaseApi } from './support/mockAgent'

test('large history renders a bounded page and searches across all sessions', async ({ page }, testInfo) => {
  const sessions = Array.from({ length: 1000 }, (_, index) => ({
    id: `history-${index}`, title: `需求 ${index.toString().padStart(4, '0')}`,
    time: { created: Date.UTC(2026, 0, 1) + index * 86400000, updated: Date.UTC(2026, 0, 1) + index * 86400000 },
  })).reverse()
  let requests = 0
  await mockBaseApi(page, async (route, url) => {
    if (!url.pathname.endsWith('/session')) return false
    requests++
    const start = Number(url.searchParams.get('cursor') ?? 0)
    const data = sessions.slice(start, start + 200)
    await json(route, { data, cursor: start + 200 < sessions.length ? { next: String(start + 200) } : {} })
    return true
  })
  const start = Date.now()
  await page.goto('/#/history')
  await expect(page.locator('.history-item')).toHaveCount(50)
  const metrics = { sessionCount: sessions.length, renderedRows: await page.locator('.history-item').count(), readyMs: Date.now() - start, requests }
  console.log('HISTORY_SCALE', JSON.stringify(metrics))
  await testInfo.attach('history-scale.json', { body: JSON.stringify(metrics), contentType: 'application/json' })
  expect(requests).toBe(5)
  await expect(page.locator('.history-item').first()).toContainText('需求 0999')
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.locator('.history-item').first()).toContainText('需求 0949')
  const search = page.getByRole('searchbox', { name: '搜索历史需求', exact: true })
  await search.fill('需求 0000')
  await expect(page.locator('.history-item')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '上一页', exact: true })).toBeDisabled()
  await search.fill('不存在')
  await expect(page.locator('.empty-state')).toContainText('没有匹配')
  await search.fill('')
  await page.getByLabel('更新开始日期', { exact: true }).fill('2026-01-01')
  await page.getByLabel('更新结束日期', { exact: true }).fill('2026-01-01')
  await expect(page.locator('.history-item')).toHaveCount(1)
  await expect(page.locator('.history-day')).toHaveText('2026-01-01')
  await page.locator('.history-item__main').click()
  await expect(page).toHaveURL(/session=history-0/)
})
