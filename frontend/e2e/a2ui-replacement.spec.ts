import { expect, test } from '@playwright/test'
import { A2uiStream } from '../../adapter/src/a2ui.mjs'
import { mockBaseApi, sse } from './support/mockAgent'

test('complete snapshots clear omitted data and allow deletion followed by recreation', async ({ page }) => {
  let run = 0
  const stream = new A2uiStream('session-a', 'producer')
  await mockBaseApi(page, (route, url) => {
    if (url.pathname !== '/dataagent/web/api/agui') return false
    const body = route.request().postDataJSON()
    run++
    const content = run === 3 ? { surfaceId: 'replace', components: [] } : {
      surfaceId: 'replace', components: [
        { id: 'root', component: 'Column', children: ['old', 'current'] },
        { id: 'old', component: 'Text', text: { path: '/obsolete' } },
        { id: 'current', component: 'Text', text: { path: '/current' } },
      ],
      data: run === 1 ? { obsolete: '旧字段必须清除', current: '第一版' } : { current: run === 2 ? '第二版' : '重建版' },
    }
    const snapshot = stream.publish(content, 'parent')[0]
    void route.fulfill({ contentType: 'text/event-stream', body: sse([
      { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
      snapshot,
      { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId },
    ]) })
    return true
  })
  await page.goto('/#/chat?session=session-a')
  await expect(page.locator('.model-selector')).toContainText('GPT A')
  const send = async (value: string) => {
    await page.locator('.agent-chat__composer [contenteditable="true"]').first().fill(value)
    await page.locator('.elx-x-sender__send-button').click()
  }
  const renderer = page.getByTestId('a2ui-activity-renderer')
  await send('第一版')
  await expect(renderer).toContainText('旧字段必须清除')
  await send('更新')
  await expect(renderer).toContainText('第二版')
  await expect(renderer).not.toContainText('旧字段必须清除')
  await send('删除')
  await expect(renderer).toHaveCount(0)
  await send('重建')
  await expect(renderer).toHaveCount(1)
  await expect(renderer).toContainText('重建版')
  await expect(renderer).not.toContainText('旧字段必须清除')
  await expect(page.locator('.a2ui-error')).toHaveCount(0)
})
