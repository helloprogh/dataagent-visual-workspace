import { expect, test } from '@playwright/test'
import { json, mockBaseApi } from './support/mockAgent'

test('a list request started before rename cannot restore the old title', async ({ page }) => {
  await mockBaseApi(page)
  await page.goto('/#/chat?session=session-a')
  await expect(page.locator('.session-item').first()).toContainText('会话 A')
  await page.evaluate(async () => {
    const path = '/src/features/conversation/composables/useSessions.ts'
    const { useSessions } = await import(/* @vite-ignore */ path)
    const state = useSessions()
    await state.refresh()
    ;(window as any).__renameState = state
  })
  let release!: () => void
  let started!: () => void
  const requested = new Promise<void>(resolve => { started = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route(/\/dataagent\/web\/api\/session\?/, async route => {
    started()
    await gate
    await json(route, { data: [{ id: 'session-a', title: '旧响应', time: { created: 1, updated: 1 } }], cursor: {} })
  })
  await page.route('**/session/session-a/rename', route => route.fulfill({ status: 204 }))
  const refresh = page.evaluate(() => (window as any).__renameState.refresh())
  await requested
  await page.evaluate(() => (window as any).__renameState.rename('session-a', '最新名称'))
  release()
  await refresh
  expect(await page.evaluate(() => (window as any).__renameState.sessions.value[0].displayName)).toBe('最新名称')
})

test('rename migrates a legacy alias after server success and survives reload without local storage', async ({ page }) => {
  let title = '服务端旧名称'
  let calls = 0
  await mockBaseApi(page, async (route, url) => {
    if (url.pathname.endsWith('/session/session-a/rename')) {
      expect(route.request().method()).toBe('POST')
      title = route.request().postDataJSON().title
      calls++
      await route.fulfill({ status: 204 })
      return true
    }
    if (url.pathname.endsWith('/session')) {
      await json(route, { data: [{ id: 'session-a', title, time: { created: 1, updated: 1 } }], cursor: {} })
      return true
    }
    return false
  })
  await page.goto('/#/chat?session=session-a')
  await page.evaluate(() => localStorage.setItem('dataagent.conversations.aliases.v1', JSON.stringify({ 'session-a': '旧本地别名' })))
  await page.reload()
  await expect(page.locator('.session-item')).toContainText('旧本地别名')
  await page.locator('.session-rename').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').fill('  服务端新名称  ')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('.session-item')).toContainText('服务端新名称')
  expect(calls).toBe(1)
  expect(title).toBe('服务端新名称')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dataagent.conversations.aliases.v1')!))).toEqual({})
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.locator('.session-item')).toContainText('服务端新名称')
})

test('rename failure retains the old title and retry succeeds; cancellation sends nothing', async ({ page }) => {
  let calls = 0
  await mockBaseApi(page, async (route, url) => {
    if (!url.pathname.endsWith('/rename')) return false
    calls++
    if (calls === 1) await json(route, { message: '服务暂不可用' }, 503)
    else await route.fulfill({ status: 204 })
    return true
  })
  await page.goto('/#/chat?session=session-a')
  const rename = page.locator('.session-rename').first()
  const dialog = page.getByRole('dialog')
  await rename.click()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  expect(calls).toBe(0)
  await rename.click()
  await dialog.getByRole('textbox').fill('重试后的名称')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('.el-message--error')).toContainText('服务暂不可用')
  await expect(page.locator('.session-item').first()).toContainText('会话 A')
  await rename.click()
  await dialog.getByRole('textbox').fill('重试后的名称')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('.session-item').first()).toContainText('重试后的名称')
  expect(calls).toBe(2)
})
