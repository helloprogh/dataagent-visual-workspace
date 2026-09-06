import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import ts from 'typescript'
import { effectScope, nextTick, ref } from 'vue'

const require = createRequire(import.meta.url)
const source = await fs.readFile(new URL('../../frontend/src/features/conversation/composables/useConversationScroll.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
const code = outputText.replace(/from 'vue'/g, `from '${pathToFileURL(require.resolve('vue')).href}'`)
const { useConversationScroll } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

function setup(loadOlder = async () => {}) {
  const scope = effectScope()
  const state = { sessionId: ref('a'), messages: ref([{}]), hydrating: ref(false), loadingOlder: ref(false), nextCursor: ref('next'), loadOlder }
  const scroll = scope.run(() => useConversationScroll(state))
  scroll.messageScroller.value = { scrollHeight: 1000, clientHeight: 200, scrollTop: 0 }
  return { scope, state, scroll, element: scroll.messageScroller.value }
}

test('prepend preserves viewport and deduplicates concurrent manual/scroll requests', async () => {
  let release
  let calls = 0
  const fixture = setup(() => { calls++; return new Promise(resolve => { release = resolve }) })
  const { scroll, element, scope } = fixture
  const pending = scroll.loadEarlier()
  await scroll.handleScroll()
  assert.equal(calls, 1)
  element.scrollHeight = 1400
  release()
  await pending
  assert.equal(element.scrollTop, 400)
  assert.equal(scroll.showJumpToLatest.value, true)
  scope.stop()
})

test('late pagination cannot move the reused viewport after session switch', async () => {
  let release
  const { state, scroll, element, scope } = setup(() => new Promise(resolve => { release = resolve }))
  const pending = scroll.loadEarlier()
  state.sessionId.value = 'b'
  element.scrollHeight = 3000
  element.scrollTop = 700
  release()
  await pending
  assert.equal(element.scrollTop, 700)
  scope.stop()
})

test('reading older messages suspends reveal following until explicit jump', async () => {
  const { scroll, element, scope } = setup()
  element.scrollTop = 200
  await scroll.handleScroll()
  scroll.followTextReveal()
  await nextTick()
  assert.equal(element.scrollTop, 200)
  assert.equal(scroll.showJumpToLatest.value, true)
  await scroll.scrollToBottom()
  assert.equal(element.scrollTop, 1000)
  assert.equal(scroll.showJumpToLatest.value, false)
  scope.stop()
})

test('queued bottom scroll is invalidated by session change and disposal', async () => {
  const { state, scroll, element, scope } = setup()
  let pending = scroll.scrollToBottom()
  state.sessionId.value = 'b'
  await pending
  assert.equal(element.scrollTop, 0)
  pending = scroll.scrollToBottom()
  scope.stop()
  await pending
  assert.equal(element.scrollTop, 0)
})

test('pagination failure releases guard for retry', async () => {
  let calls = 0
  const { scroll, scope } = setup(async () => { if (++calls === 1) throw new Error('offline') })
  await assert.rejects(scroll.loadEarlier(), /offline/)
  await scroll.loadEarlier()
  assert.equal(calls, 2)
  scope.stop()
})
