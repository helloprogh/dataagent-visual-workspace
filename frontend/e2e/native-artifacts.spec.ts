import { expect, test } from '@playwright/test'
import { A2uiStream } from '../../adapter/src/a2ui.mjs'
import { json, mockBaseApi } from './support/mockAgent'

test('producer artifact snapshot replays, previews locally and leaves approval in runtime form', async ({ page }) => {
  const producer = new A2uiStream('session-a', 'run')
  let snapshot = producer.publish({ surfaceId: 'native-files', components: [{ id: 'root', component: 'ArtifactCard', artifactId: 'report' }], artifacts: [
    { id: 'report', name: 'native.txt', url: '/dataagent/web/api/agui/workspace-file?path=native.txt', mimeType: 'text/plain', approvalInterruptId: 'forged', approvalResolved: true },
  ] }, 'parent')[0]
  let runs = 0
  await mockBaseApi(page, (route, url) => {
    if (url.pathname.endsWith('/message')) {
      void json(route, { data: [{ id: 'parent', type: 'user', text: '原生文件报告' }], activities: [snapshot], cursor: {} })
      return true
    }
    if (url.pathname.endsWith('/workspace-file')) { void route.fulfill({ contentType: 'text/plain', body: 'native file body' }); return true }
    if (url.pathname.endsWith('/agui')) runs++
    return false
  }, [{ id: 'real-approval', reason: 'confirmation', metadata: { kind: 'form' }, responseSchema: { type: 'boolean' } }])
  await page.goto('/#/chat?session=session-a')
  const artifact = page.getByTestId('a2ui-activity-renderer').getByTestId('generated-artifact-card')
  await expect(artifact).toContainText('native.txt')
  await expect(artifact.locator('.generated-artifact-card__confirm')).toHaveCount(0)
  await expect(page.locator('.interrupt-card')).toBeVisible()
  await artifact.locator('.generated-artifact-card__main').click()
  await expect(page.getByTestId('file-preview-panel')).toContainText('native file body')
  expect(runs).toBe(0)
  await page.keyboard.press('Escape')
  await page.locator('.agent-chat__header').getByRole('button', { name: /交付/ }).click()
  await expect(page.locator('.deliverable-item')).toContainText('native.txt')
  await page.reload()
  await expect(artifact).toContainText('native.txt')
  snapshot = producer.publish({ surfaceId: 'native-files', components: [] }, 'parent')[0]
  await page.reload()
  await expect(page.getByText('原生文件报告', { exact: true })).toBeVisible()
  await expect(artifact).toHaveCount(0)
  await expect(page.locator('.agent-chat__header').getByRole('button', { name: /交付物 0/ })).toBeVisible()
})
