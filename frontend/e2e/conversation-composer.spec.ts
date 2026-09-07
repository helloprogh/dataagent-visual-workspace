import { expect, test } from '@playwright/test'
import { mockBaseApi } from './support/mockAgent'

test('composer facade fills starter, focuses with slash and clears when switching sessions', async ({ page }) => {
  await mockBaseApi(page)
  await page.goto('/')
  const input = page.locator('.agent-chat__composer [contenteditable="true"]').first()
  await page.locator('.starter-prompts button').first().click()
  await expect(input).not.toBeEmpty()
  await expect(input).toBeFocused()
  await input.fill('draft for current conversation')
  await page.locator('.agent-welcome__eyebrow').click()
  await page.keyboard.press('/')
  await expect(input).toBeFocused()
  await expect(input).toHaveText('draft for current conversation')
  await page.keyboard.type('/')
  await expect(input).toContainText('/')
  await page.getByText('会话 B', { exact: true }).click()
  await expect(input).toBeEmpty()
  await expect(page.locator('.model-selector')).toContainText('Claude B')
})

test('composer file selection remains local and removing attachment updates runtime queue', async ({ page }) => {
  let uploadCalls = 0
  await mockBaseApi(page, (_route, url) => { if (url.pathname.includes('/upload')) uploadCalls++; return false })
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles({ name: 'draft.txt', mimeType: 'text/plain', buffer: Buffer.from('draft') })
  const chip = page.locator('.attachment-chip')
  await expect(chip).toContainText('draft.txt')
  expect(uploadCalls).toBe(0)
  await chip.getByRole('button').click()
  await expect(chip).toHaveCount(0)
  await expect(page.locator('input[type=file]')).toHaveValue('')
})
