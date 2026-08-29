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

test('light mode applies to CopilotKit conversation surfaces and dark mode stays synchronized', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dataagent.theme', 'light'))
  await mockApis(page)
  await page.goto('/')

  const root = page.locator('html')
  await expect(root).toHaveAttribute('data-theme', 'light')
  await expect(root).not.toHaveClass(/\bdark\b/)

  const copilotSurface = page.locator('.conversation-chat [data-copilotkit]').first()
  await expect(copilotSurface).toBeVisible()

  const lightTokens = await copilotSurface.evaluate(element => {
    const style = getComputedStyle(element)
    return {
      background: style.getPropertyValue('--background').trim(),
      foreground: style.getPropertyValue('--foreground').trim(),
    }
  })
  expect(lightTokens.background.toUpperCase()).toBe('#FFFFFF')
  expect(lightTokens.foreground.toUpperCase()).toBe('#1F2937')

  const composer = page.locator('.conversation-composer')
  await expect(composer).toBeVisible()
  expect(await composer.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)')

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
