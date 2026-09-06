import { expect, test } from '@playwright/test'
import { json, mockBaseApi } from './support/mockAgent'

for (const retryOne of [false, true]) {
test(`failed upload retains draft and successful files; ${retryOne ? 'individual retry' : 'send retry'} does not duplicate uploads`, async ({ page }) => {
  let created = 0
  let run: any
  const calls: string[] = []
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await mockBaseApi(page, async (route, url) => {
    if (url.pathname.endsWith('/session')) {
      if (route.request().method() === 'POST') {
        created++
        await json(route, { data: { id: 'session-created' } })
      } else await json(route, { data: created ? [{ id: 'session-created', title: '附件分析', time: { created: 1, updated: 1 } }] : [], cursor: {} })
      return true
    }
    if (url.pathname.endsWith('/file/upload')) {
      const body = route.request().postDataBuffer()!.toString()
      const name = /filename="([^"]+)"/.exec(body)![1]!
      expect(body).toContain('session-created')
      calls.push(name)
      await gate
      if (name === 'b.txt' && calls.filter(item => item === name).length === 1) await json(route, {}, 503)
      else await json(route, { data: { fileId: name, url: `/files/${name}`, filename: name } })
      return true
    }
    if (url.pathname.endsWith('/agui')) run = route.request().postDataJSON()
    return false
  })
  await page.goto('/')
  await expect(page.locator('.model-selector')).toContainText('GPT A')
  await page.locator('input[type=file]').setInputFiles(['a', 'b', 'c', 'd'].map(name => ({ name: `${name}.txt`, mimeType: 'text/plain', buffer: Buffer.from(name) })))
  const editor = page.locator('.agent-chat__composer [contenteditable=true]').first()
  await editor.fill('附件分析')
  await page.locator('.elx-x-sender__send-button').click()
  await expect.poll(() => calls.length).toBe(3)
  await expect(page.locator('.attachment-status').filter({ hasText: '上传中' })).toHaveCount(3)
  await expect(page.locator('.attachment-status').filter({ hasText: '待上传' })).toHaveCount(1)
  release()
  await expect(page.locator('.run-recovery')).toBeVisible()
  await expect(editor).toHaveText('附件分析')
  expect(run).toBeUndefined()
  if (retryOne) {
    await page.locator('.attachment-chip').filter({ hasText: 'b.txt' }).getByRole('button', { name: /重试/ }).click()
    await expect(page.locator('.attachment-status').filter({ hasText: '已上传' })).toHaveCount(4)
    expect(run).toBeUndefined()
    await page.locator('.elx-x-sender__send-button').click()
  } else await page.locator('.run-recovery button').click()
  await expect.poll(() => run?.threadId).toBe('session-created')
  expect(created).toBe(1)
  expect(calls.filter(name => name === 'a.txt')).toHaveLength(1)
  expect(calls.filter(name => name === 'b.txt')).toHaveLength(2)
  expect(calls).toHaveLength(5)
  await expect(page.locator('.attachment-chip')).toHaveCount(0)
  await expect(editor).toHaveText('')
  await expect(page).toHaveURL(/session=session-created/)
})
}

for (const stop of [false, true]) {
test(`${stop ? 'stopping' : 'switching sessions during'} upload aborts preparation and never publishes the old message`, async ({ page }) => {
  let uploads = 0
  let runs = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await mockBaseApi(page, async (route, url) => {
    if (url.pathname.endsWith('/file/upload')) {
      uploads++
      await gate
      await json(route, { data: { fileId: 'late', url: '/files/late' } }).catch(() => {})
      return true
    }
    if (url.pathname.endsWith('/agui')) runs++
    return false
  })
  await page.goto('/#/chat?session=session-a')
  await expect(page.locator('.model-selector')).toContainText('GPT A')
  await page.locator('input[type=file]').setInputFiles({ name: 'late.txt', mimeType: 'text/plain', buffer: Buffer.from('late') })
  await page.locator('.agent-chat__composer [contenteditable=true]').first().fill('old draft')
  await page.locator('.elx-x-sender__send-button').click()
  await expect.poll(() => uploads).toBe(1)
  if (stop) await page.locator('.elx-x-sender__loading-button').click()
  else await page.getByText('会话 B', { exact: true }).click()
  release()
  if (stop) {
    await expect(page.locator('.run-recovery')).toContainText('已停止上传')
    await expect(page.locator('.attachment-chip')).toHaveCount(1)
    await expect(page.locator('.agent-chat__composer [contenteditable=true]').first()).toHaveText('old draft')
  } else {
    await expect(page).toHaveURL(/session=session-b/)
    await expect(page.locator('.attachment-chip')).toHaveCount(0)
    await expect(page.locator('.run-recovery')).toHaveCount(0)
  }
  expect(runs).toBe(0)
})
}
