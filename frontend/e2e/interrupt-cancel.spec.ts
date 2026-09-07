import { expect, test } from '@playwright/test'
import { mockBaseApi, sse } from './support/mockAgent'

for (const ids of [['single'], ['first', 'second']]) {
  test(`cancel covers ${ids.length} pending interrupts without requiring answers`, async ({ page }) => {
    let entries: unknown[] = []
    await mockBaseApi(page, (route, url) => {
      if (!url.pathname.endsWith('/agui')) return false
      const body = route.request().postDataJSON()
      entries = body.resume
      void route.fulfill({ contentType: 'text/event-stream', body: sse([
        { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
        { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId },
      ]) })
      return true
    }, ids.map(id => ({ id, reason: 'confirmation', responseSchema: { type: 'string', enum: ['yes', 'no'] } })))
    await page.goto('/#/chat?session=session-a')
    await page.locator('.interrupt-card').getByRole('button', { name: '取消', exact: true }).click()
    await expect.poll(() => entries).toEqual(ids.map(interruptId => ({ interruptId, status: 'cancelled' })))
    await expect(page.locator('.interrupt-card')).toHaveCount(0)
  })
}
