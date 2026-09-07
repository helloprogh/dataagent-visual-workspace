import { expect, test } from '@playwright/test'
import { mockBaseApi } from './support/mockAgent'

test('permission resources remain visible as inert text on narrow screens', async ({ page }) => {
  const resources = ['C:/restricted/' + 'long-directory/'.repeat(30) + 'fixture.txt', '<img src=x onerror=alert(1)>', 'javascript:alert(1)']
  await page.setViewportSize({ width: 390, height: 844 })
  await mockBaseApi(page, undefined, [{ id: 'per_resource', reason: 'tool_call', message: 'Read permission', metadata: { resources: [...resources, null, {}] }, responseSchema: { type: 'string', enum: ['once', 'reject'] } }])
  await page.goto('/#/chat?session=session-a')
  const list = page.getByRole('list', { name: '请求访问的资源' })
  await expect(list.getByRole('listitem')).toHaveCount(3)
  for (const resource of resources) await expect(list).toContainText(resource)
  await expect(list.locator('img, a, script')).toHaveCount(0)
  expect(await list.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await page.reload()
  await expect(list).toContainText(resources[0])
})
