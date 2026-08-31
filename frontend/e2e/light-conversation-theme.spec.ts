import { expect, test, type Page, type Route } from '@playwright/test'

const json = (route: Route, body: unknown, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

async function mockApis(page: Page) {
  await page.route('**/dataagent/web/api/**', route => {
    const request = route.request()
    const url = new URL(request.url())

    if (request.method() === 'GET' && url.pathname === '/dataagent/web/api/session') {
      return json(route, { data: [], cursor: {} })
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/model')) {
      return json(route, { data: [{ providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true }] })
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/model/default')) {
      return json(route, { data: { providerID: 'openai', id: 'gpt-a', name: 'GPT A', enabled: true } })
    }
    if (request.method() === 'GET' && url.pathname.endsWith('/tools')) {
      return json(route, { data: { items: [], warnings: [] } })
    }
    return json(route, { data: {} })
  })
}

test('light mode follows the warm paper design system and keeps CopilotKit synchronized', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dataagent.theme', 'light'))
  await mockApis(page)
  await page.goto('/')

  const root = page.locator('html')
  await expect(root).toHaveAttribute('data-theme', 'light')
  await expect(root).not.toHaveClass(/\bdark\b/)

  const productTokens = await root.evaluate(element => {
    const style = getComputedStyle(element)
    return {
      paper: style.getPropertyValue('--color-paper-warmth').trim(),
      blue: style.getPropertyValue('--color-notion-blue').trim(),
      border: style.getPropertyValue('--da-border').trim(),
    }
  })
  expect(productTokens.paper.toUpperCase()).toBe('#F6F5F4')
  expect(productTokens.blue.toUpperCase()).toBe('#0075DE')
  expect(productTokens.border).toBe('rgba(0,0,0,.08)')

  const shell = page.locator('.dataagent-shell')
  expect(await shell.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(246, 245, 244)')

  const panel = page.locator('.assistant-panel').first()
  await expect(panel).toBeVisible()
  expect(await panel.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)')

  const newConversation = page.getByRole('button', { name: '新建会话', exact: true })
  expect(await newConversation.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(0, 117, 222)')

  const stageGlow = page.locator('.app-main-stage--chat').first()
  const decorativeBackground = await stageGlow.evaluate(element => getComputedStyle(element, '::before').backgroundImage)
  expect(decorativeBackground).toBe('none')

  const copilotSurface = page.locator('.conversation-chat [data-copilotkit]').first()
  await expect(copilotSurface).toBeVisible()

  const lightTokens = await copilotSurface.evaluate(element => {
    const style = getComputedStyle(element)
    return {
      background: style.getPropertyValue('--background').trim(),
      foreground: style.getPropertyValue('--foreground').trim(),
      primary: style.getPropertyValue('--primary').trim(),
      muted: style.getPropertyValue('--muted').trim(),
    }
  })
  expect(lightTokens.background.toUpperCase()).toBe('#FFFFFF')
  expect(lightTokens.foreground.toUpperCase()).toBe('#000000')
  expect(lightTokens.primary.toUpperCase()).toBe('#0075DE')
  expect(lightTokens.muted.toUpperCase()).toBe('#F6F5F4')

  const userBubbleStyle = await copilotSurface.evaluate(element => {
    const message = document.createElement('div')
    message.dataset.testid = 'copilot-user-message'
    const bubble = document.createElement('div')
    bubble.textContent = '测试用户消息'
    message.appendChild(bubble)
    element.appendChild(message)
    const style = getComputedStyle(bubble)
    const result = {
      background: style.backgroundColor,
      color: style.color,
      borderColor: style.borderColor,
    }
    message.remove()
    return result
  })
  expect(userBubbleStyle.background).toBe('rgb(230, 243, 254)')
  expect(userBubbleStyle.color).toBe('rgb(17, 17, 17)')
  expect(userBubbleStyle.borderColor).toBe('rgba(0, 117, 222, 0.14)')

  const composer = page.locator('.conversation-composer')
  await expect(composer).toBeVisible()
  expect(await composer.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)')
  expect(await composer.evaluate(element => getComputedStyle(element).backgroundImage)).toBe('none')

  await page.getByRole('button', { name: '切换到深色模式' }).click()
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await expect(root).toHaveClass(/\bdark\b/)

  await page.getByRole('button', { name: '切换到浅色模式' }).click()
  await expect(root).toHaveAttribute('data-theme', 'light')
  await expect(root).not.toHaveClass(/\bdark\b/)

  const restoredTokens = await copilotSurface.evaluate(element => {
    const style = getComputedStyle(element)
    return style.getPropertyValue('--background').trim().toUpperCase()
  })
  expect(restoredTokens).toBe('#FFFFFF')
})
