import { expect, test } from '@playwright/test'
import { mockBaseApi } from './support/mockAgent'

test('actual Vue catalog registration matches server contract and advertised capabilities', async ({ page }) => {
  await mockBaseApi(page)
  await page.goto('/')
  const catalog = await page.evaluate(async () => {
    // Load the real application modules through Vite, including Vue renderers.
    const catalogPath = '/src/a2ui/catalog.ts'
    const capabilityPath = '/src/a2ui/capability.ts'
    const { dataAgentCatalog } = await import(/* @vite-ignore */ catalogPath)
    const capability = await import(/* @vite-ignore */ capabilityPath)
    return {
      registered: [...dataAgentCatalog.components.keys()].sort(),
      allowed: [...capability.A2UI_ALLOWED_COMPONENTS].sort(),
      advertised: JSON.parse(capability.A2UI_RUN_CAPABILITY.context[0].value),
      catalogId: capability.DATA_AGENT_CATALOG_ID,
    }
  })
  expect(catalog.registered).toEqual(catalog.allowed)
  expect([...catalog.advertised.components].sort()).toEqual(catalog.allowed)
  expect(catalog.advertised.catalogId).toBe(catalog.catalogId)
})
