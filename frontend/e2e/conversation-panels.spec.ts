import { expect, test } from '@playwright/test'
import { json, mockBaseApi } from './support/mockAgent'

test('preview returns to deliveries, audit replaces it, and Escape/session switch close panels', async ({ page }) => {
  await mockBaseApi(page, (route, url) => {
    if (url.pathname.endsWith('/session/session-a/message')) {
      void json(route, { data: [{ id: 'file-user', type: 'user', text: '查看文件', files: [
        { uri: '/dataagent/web/api/agui/workspace-file?path=report.txt', mime: 'text/plain', name: 'report.txt' },
      ] }], cursor: {} })
      return true
    }
    if (url.pathname.endsWith('/workspace-file')) {
      void route.fulfill({ contentType: 'text/plain', body: 'preview content' })
      return true
    }
    return false
  })
  await page.goto('/#/chat?session=session-a')
  const header = page.locator('.agent-chat__header')
  const deliveryButton = header.getByRole('button', { name: /交付/ })
  const auditButton = header.getByRole('button', { name: /记录/ })
  const deliveries = page.locator('.deliverables-panel')
  const preview = page.getByTestId('file-preview-panel')
  await deliveryButton.click()
  await deliveries.getByRole('button', { name: /report.txt/ }).click()
  await expect(preview).toContainText('preview content')
  await preview.locator('header button').click()
  await expect(deliveries).toBeVisible()
  await auditButton.click()
  await expect(deliveries).toHaveCount(0)
  await expect(page.locator('.audit-panel')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.audit-panel')).toHaveCount(0)
  await page.locator('.attachment-card').filter({ hasText: 'report.txt' }).click()
  await preview.locator('header button').click()
  await expect(deliveries).toHaveCount(0)
  await deliveryButton.click()
  await page.getByText('会话 B', { exact: true }).click()
  await expect(deliveries).toHaveCount(0)
  await expect(preview).toHaveCount(0)
})
