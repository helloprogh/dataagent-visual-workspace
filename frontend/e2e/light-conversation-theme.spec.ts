import { expect, test } from '@playwright/test'
import { mockBaseApi, seedActiveSession, seedTheme } from './helpers/dataagent'

const historyUser = {
  id: 'theme-user-message',
  type: 'user',
  text: '检查浅色用户消息',
  time: { created: 1 },
}

test('light mode applies current design tokens and the real user bubble uses its dedicated blue-tinted token', async ({ page }) => {
  await seedTheme(page, 'light')
  await seedActiveSession(page, 'session-a')
  await mockBaseApi(page, undefined, {
    sessions: [{ id: 'session-a', title: '主题检查', time: { created: 1, updated: 2 } }],
    messages: { 'session-a': [historyUser] },
  })

  await page.goto('/')

  const root = page.locator('html')
  await expect(root).toHaveAttribute('data-theme', 'light')
  await expect(root).not.toHaveClass(/\bdark\b/)

  const tokens = await root.evaluate(element => {
    const style = getComputedStyle(element)
    return {
      surface: style.getPropertyValue('--da-surface-0').trim(),
      neutralBubble: style.getPropertyValue('--da-surface-3').trim(),
      primary: style.getPropertyValue('--da-accent-primary').trim(),
      userBubble: style.getPropertyValue('--da-bubble-user-bg').trim(),
      userBorder: style.getPropertyValue('--da-bubble-user-border').trim(),
    }
  })
  expect(tokens.surface.toUpperCase()).toBe('#F5F7FB')
  expect(tokens.neutralBubble.toUpperCase()).toBe('#EDEDEB')
  expect(tokens.primary.toUpperCase()).toBe('#0075DE')
  expect(tokens.userBubble).toContain('var(--da-accent-primary) 8%')
  expect(tokens.userBorder).toContain('var(--da-accent-primary) 16%')

  await expect(page.getByText('检查浅色用户消息', { exact: true })).toBeVisible()
  const bubble = page.locator('.message-bubble--user').first()
  await expect(bubble).toBeVisible()

  const bubbleStyle = await bubble.evaluate(element => {
    const content = element.querySelector('.elx-bubble__content') as HTMLElement | null
    const style = getComputedStyle(content ?? element)
    return { background: style.backgroundColor, border: style.borderTopColor }
  })
  expect(bubbleStyle.background).not.toBe('rgb(237, 237, 235)')
  expect(bubbleStyle.background).not.toBe('rgba(0, 0, 0, 0)')
  expect(bubbleStyle.border).not.toBe('rgba(0, 0, 0, 0)')

  await page.getByRole('button', { name: '深色模式' }).click()
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await expect(root).toHaveClass(/\bdark\b/)

  await page.getByRole('button', { name: '浅色模式' }).click()
  await expect(root).toHaveAttribute('data-theme', 'light')
  await expect(root).not.toHaveClass(/\bdark\b/)
})
