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
  await expect(deliveryButton).toHaveAttribute('aria-pressed', 'false')
  await deliveryButton.click()
  await expect(deliveryButton).toHaveAttribute('aria-pressed', 'true')
  await deliveries.getByRole('button', { name: /report.txt/ }).click()
  await expect(preview).toContainText('preview content')
  await preview.locator('header button').click()
  await expect(deliveries).toBeVisible()
  await auditButton.click()
  await expect(deliveries).toHaveCount(0)
  await expect(page.locator('.audit-panel')).toBeVisible()
  await expect(auditButton).toHaveAttribute('aria-pressed', 'true')
  await expect(deliveryButton).toHaveAttribute('aria-pressed', 'false')
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

test('narrow header keeps accessible controls and inspector overlays the conversation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockBaseApi(page)
  await page.goto('/#/chat?session=session-a')
  const header = page.locator('.agent-chat__header')
  const button = header.getByRole('button', { name: /交付/ })
  await expect(button).toBeVisible()
  await expect(header).toHaveCSS('padding-left', '16px')
  await expect(button.locator('span')).toBeHidden()
  const box = await button.boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(36)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  await button.click()
  const panel = page.locator('.deliverables-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toHaveCSS('position', 'absolute')
  // Wait for the panel's entrance translation to settle before measuring.
  await expect.poll(async () => {
    const panelBox = await panel.boundingBox()
    return panelBox!.x + panelBox!.width
  }).toBeLessThanOrEqual(390)
  expect((await panel.boundingBox())!.x).toBeGreaterThanOrEqual(0)
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(button).toHaveAttribute('aria-pressed', 'false')
})
