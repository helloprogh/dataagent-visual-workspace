import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import { OpenCodeAguiConverter } from '../src/converter.mjs'

async function loadModule(path) {
  const source = await fs.readFile(new URL(`../../frontend/src/features/conversation/${path}.ts`, import.meta.url), 'utf8')
  // History's API imports are unused by its pure normalizer under test.
  const pure = source.replace(/^import .* from ['"].*['"]\r?\n/gm, '')
  const { outputText } = ts.transpileModule(pure, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}
const { buildPresentation, toolOutputText } = await loadModule('processPresentation')
const { normalizeAssistant } = await loadModule('api/history')
const { nextRevealLength } = await loadModule('textReveal')
const user = { id: 'u', role: 'user', content: '测试' }
const thought = (id = 'r') => ({ id, role: 'reasoning', content: '正在分析' })
const text = (id = 'a', content = '正文') => ({ id, role: 'assistant', content })
const call = (id = 'c', content = '') => ({ id: `a-${id}`, role: 'assistant', content, toolCalls: [{ id, type: 'function', function: { name: 'read', arguments: '{"path":"README.md"}' } }] })
const result = (id = 'c', error) => ({ id: `result-${id}`, role: 'tool', toolCallId: id, content: error || '文件内容', ...(error ? { error } : {}) })
const children = (messages, running = true, reasoningId) => buildPresentation([user, ...messages], running, reasoningId)[0].children

test('mixed assistant text and calls render body once and bind the result inside the call', () => {
  const source = [thought(), call('c', '先读取文件'), result(), text()]
  const snapshot = JSON.stringify(source)
  const items = children(source)
  assert.deepEqual(items.map(item => item.kind), ['process', 'message', 'process', 'message'])
  assert.deepEqual(items[1].message.toolCalls, [])
  assert.equal(items[2].steps.length, 1)
  assert.equal(items[2].steps[0].call.id, 'c')
  assert.equal(items[2].steps[0].result.content, '文件内容')
  assert.equal(items[2].settled, true)
  assert.equal(items[2].running, false)
  assert.equal(JSON.stringify(source), snapshot)
})

test('text arrival settles prior group; new reasoning and tools activate only the new group', () => {
  const first = children([thought()])[0]
  assert.equal(first.running, true)
  assert.equal(first.activeReasoningId, 'r')
  const items = children([thought(), text(), thought('r2'), call()])
  assert.equal(items[0].key, first.key)
  assert.equal(items[0].settled, true)
  assert.equal(items[0].activeReasoningId, '')
  assert.equal(items[2].running, true)
  assert.equal(items[2].activeReasoningId, '')
  assert.equal(children([thought()], true, '')[0].activeReasoningId, '')
})

test('empty text stream placeholders do not prematurely collapse thinking', () => {
  const items = children([thought(), text('a', '')])
  assert.equal(items.length, 1)
  assert.equal(items[0].running, true)
  assert.equal(items[0].settled, false)
})

test('parallel results remain in call order and late results do not create a new group', () => {
  const items = children([call('c1'), call('c2'), result('c2'), text(), result('c1')])
  assert.equal(items.length, 2)
  assert.deepEqual(items[0].steps.map(step => step.call.id), ['c1', 'c2'])
  assert.deepEqual(items[0].steps.map(step => step.result.toolCallId), ['c1', 'c2'])
  assert.equal(items[0].settled, true)
})

test('tool progress is deduplicated and permission waits and failures are preserved', () => {
  const progress = { id: 'progress', role: 'activity', activityType: 'dataagent.tool', content: { toolCallId: 'c', status: 'running' } }
  const waiting = { id: 'waiting', role: 'activity', activityType: 'dataagent.task', content: { status: 'waiting_permission' } }
  const items = children([call(), progress, result('c', '读取失败'), waiting], false)
  assert.equal(items[0].steps.length, 2)
  assert.equal(items[0].steps[0].result.error, '读取失败')
  assert.equal(items[0].steps[1].message.id, 'waiting')
  assert.equal(items[0].running, false)
})

test('pagination orphans stay visible and reused IDs never join across user turns', () => {
  const items = buildPresentation([user, call(), text(), { ...user, id: 'u2' }, result()], true)
  assert.equal(items[0].children[0].steps[0].result, undefined)
  assert.equal(items[0].children[0].running, false)
  assert.equal(items[1].children[0].steps[0].message.role, 'tool')
})

test('history preserves interleaved reasoning, calls, body, and later reasoning', () => {
  const messages = normalizeAssistant({ content: [
    { type: 'reasoning', text: '先想' },
    { type: 'tool', id: 'c1', name: 'read', state: { status: 'completed', result: 'ok' } },
    { type: 'text', text: '中间说明' },
    { type: 'reasoning', text: '再想' },
    { type: 'tool', id: 'c2', name: 'read', state: { status: 'completed', result: 'ok2' } },
    { type: 'text', text: '结论' },
  ] }, 'assistant')
  assert.deepEqual(messages.map(m => m.role), ['reasoning', 'assistant', 'tool', 'assistant', 'reasoning', 'assistant', 'tool', 'assistant'])
  assert.equal(new Set(messages.map(m => m.id)).size, messages.length)
  const items = children(messages, false)
  assert.deepEqual(items.map(item => item.kind), ['process', 'message', 'process', 'message'])
  assert.equal(items[0].steps[1].call.id, 'c1')
  assert.equal(items[2].steps[1].call.id, 'c2')
})

test('streaming tool calls never append themselves to the earlier text parent', () => {
  const converter = new OpenCodeAguiConverter({ threadId: 't', runId: 'r', sessionId: 's' })
  const events = ['c1', 'c2'].flatMap(id => converter.convert({ type: 'session.tool.input.started', data: { sessionID: 's', assistantMessageID: 'a', id, name: 'read' } }))
  const starts = events.filter(e => e.type === 'TOOL_CALL_START')
  assert.equal(starts.length, 2)
  assert.deepEqual(starts.map(e => e.parentMessageId), ['a-tool-c1', 'a-tool-c2'])
})

test('process disclosure collapses on body/finish and stays inert while folded', async () => {
  const source = await fs.readFile(new URL('../../frontend/src/features/conversation/components/ConversationProcessGroup.vue', import.meta.url), 'utf8')
  assert.match(source, /watch\(\(\) => \[props.running, props.settled\]/)
  assert.match(source, /expanded.value = Boolean\(running && !settled\)/)
  assert.match(source, /:inert="!expanded"/)
  assert.match(source, /@click="expanded = !expanded"/)
})

test('only finished thinking and tool details receive height limits', async () => {
  const group = await fs.readFile(new URL('../../frontend/src/features/conversation/components/ConversationProcessGroup.vue', import.meta.url), 'utf8')
  const styles = await fs.readFile(new URL('../../frontend/src/shared/styles/base.css', import.meta.url), 'utf8')
  assert.match(group, /'process-tool--running': running && !step.result/)
  assert.match(group, /:running="running && step.message.id === activeReasoningId"/)
  assert.match(group, /\.process-tool:not\(\.process-tool--running\) \.process-tool__details pre\s*\{[^}]*max-height: 12rem;[^}]*overflow: auto;/)
  assert.doesNotMatch(group.match(/^\.process-tool__details pre\s*\{[^}]*\}/m)?.[0] ?? '', /max-height|overflow:\s*auto/)
  assert.match(styles, /\.reasoning-card:not\(\.reasoning-card--running\) \.reasoning-content\s*\{[^}]*max-height: 10rem;[^}]*overflow: auto;/)
  assert.doesNotMatch(styles.match(/^\.dataagent-app \.process-step__content \.reasoning-content\s*\{[^}]*\}/m)?.[0] ?? '', /max-height|overflow:\s*auto/)
})

test('tool text envelopes are readable without losing structured or partial results', () => {
  assert.equal(toolOutputText({ ...result(), content: '[{"type":"text","text":"第一行\\n第二行"}]' }), '第一行\n第二行')
  assert.equal(toolOutputText({ ...result(), content: '{"count":3}' }), '{"count":3}')
  assert.equal(toolOutputText({ ...result(), content: '[{"type":' }), '[{"type":')
})

test('empty private reasoning keeps its duration but never copies encrypted data', () => {
  const messages = normalizeAssistant({ content: [
    { type: 'reasoning', text: '', state: { reasoningEncryptedContent: 'private-test-value' }, time: { created: 100, completed: 2100 } },
    { type: 'text', text: '你好' },
  ] }, 'a')
  assert.equal(messages.length, 2)
  assert.equal(messages[0].role, 'reasoning')
  assert.equal(messages[0].reasoningDurationMs, 2000)
  assert.equal(JSON.stringify(messages).includes('private-test-value'), false)
  const items = children(messages, false)
  assert.equal(items[0].steps[0].message.content, '')
  assert.equal(items[0].settled, true)
})

test('visual text catch-up is progressive, monotonic and bounded to 240ms', () => {
  for (const total of [1, 37, 10000]) {
    let revealed = 0
    const samples = []
    for (let elapsed = 24; elapsed <= 240; elapsed += 24) {
      const next = nextRevealLength(revealed, total, 24, 240 - elapsed + 24)
      assert.ok(next >= revealed && next <= total)
      revealed = next
      samples.push(next)
    }
    assert.equal(revealed, total)
    if (total > 1) assert.ok(samples[0] < total)
  }
  assert.equal(nextRevealLength(3, 50, 300, -20), 50)
})

test('waiting feedback covers initial send and text placeholders without replaying history', async () => {
  const chat = await fs.readFile(new URL('../../frontend/src/features/conversation/components/AgentChat.vue', import.meta.url), 'utf8')
  const message = await fs.readFile(new URL('../../frontend/src/features/conversation/components/ConversationMessage.vue', import.meta.url), 'utf8')
  assert.match(chat, /!messages.length && !running/)
  assert.match(chat, /v-if="showResponsePending"[^>]*role="status"/)
  assert.match(chat, /animatedMessageIds.has\(child.message.id\)/)
  assert.match(chat, /responsePhase.value === 'responding'\) return Boolean\(activeTextId.value\) &&/)
  assert.match(message, /if \(!animate \|\| role.value !== 'assistant'/)
  assert.match(message, /reducedMotion.matches \|\| document.hidden/)
  assert.match(message, /onBeforeUnmount/)
})
