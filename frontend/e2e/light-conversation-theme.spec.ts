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

test('theme switches Element Plus and survives reload', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('dataagent.theme.v2')) localStorage.setItem('dataagent.theme.v2', 'light')
  })
  await mockApis(page)
  await page.goto('/')
  const root = page.locator('html')
  await expect(root).toHaveAttribute('data-theme', 'light')
  await expect(root).not.toHaveClass(/\bdark\b/)
  const light = await page.locator('.dataagent-app').evaluate(el => getComputedStyle(el).backgroundColor)
  await page.getByRole('button', { name: '深色模式', exact: true }).click()
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await expect(root).toHaveClass(/\bdark\b/)
  await expect.poll(() => page.locator('.dataagent-app').evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(light)
  await page.reload()
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: '浅色模式', exact: true }).click()
  await expect(root).toHaveAttribute('data-theme', 'light')
})
