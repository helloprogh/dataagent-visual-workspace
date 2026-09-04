import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { HttpAgent } from '@ag-ui/client'
import { OpenCodeAguiConverter } from '../src/converter.mjs'
import { GenerativeUiStream } from '../src/generative-ui.mjs'
import { SessionRegistry } from '../src/session-registry.mjs'
import { normalizeUiContent, applyUiPatch, uiContentFromToolOutput, safeUiFileUrl } from '../../shared/generative-ui.mjs'

const content = (status = 'ready') => ({ version: 1, surfaceId: 'sales', title: '销售概览', status,
  cards: [{ id: 'total', kind: 'metrics', items: [{ label: '销售额', value: 1200 }] }] })
const scope = { threadId: 'thread-ui', runId: 'run-ui', sessionId: 'session-ui' }
const snapshot = (status = 'generating') => ({ type: 'ACTIVITY_SNAPSHOT', activityType: 'dataagent.ui',
  ...scope, parentMessageId: 'assistant-ui', content: content(status) })

test('UI snapshot/delta use one stable message, isolate scopes, and reject unsafe patches', () => {
  const stream = new GenerativeUiStream(scope.threadId, scope.runId)
  const [first] = stream.accept(snapshot(), scope.sessionId)
  assert.equal(first.replace, true)
  assert.equal(first.messageId, 'ui-run-ui-sales')
  assert.deepEqual(stream.accept(snapshot(), scope.sessionId), [])
  for (const changed of [{ threadId: 'another' }, { runId: 'old' }, { sessionID: 'another' }]) {
    assert.deepEqual(stream.accept({ ...snapshot(), ...changed }, scope.sessionId), [])
  }
  const delta = { ...scope, type: 'ACTIVITY_DELTA', activityType: 'dataagent.ui', messageId: first.messageId,
    patch: [{ op: 'replace', path: '/status', value: 'ready' }] }
  assert.equal(stream.accept(delta, scope.sessionId)[0].type, 'ACTIVITY_DELTA')
  assert.equal(stream.snapshots.get(first.messageId).content.status, 'ready')
  assert.deepEqual(stream.accept({ ...delta, messageId: 'missing' }, scope.sessionId), [])
  assert.equal(applyUiPatch(content(), [{ op: 'add', path: '/__proto__/polluted', value: true }]), null)
  assert.equal(applyUiPatch(content(), [{ op: 'replace', path: '/surfaceId', value: 'other' }]), null)
  assert.equal(applyUiPatch(content(), [{ op: 'replace', path: '/status', value: 'approved' }]), null)
  assert.equal(stream.publish(content(), 'assistant-ui')[0]?.messageId, undefined)
  assert.notEqual(new GenerativeUiStream(scope.threadId, 'next-run').publish(content(), 'a')[0].messageId, first.messageId)
})

test('structured tool results produce UI events; ordinary prose, errors and partial arguments do not', () => {
  const converter = new OpenCodeAguiConverter(scope)
  const input = { id: 'call-ui', name: 'custom_report', assistantMessageID: 'assistant-ui', sessionID: scope.sessionId }
  assert.equal(converter.convert({ type: 'session.tool.called', data: { ...input, input: { dataagentUi: content() } } }).some(e => e.activityType === 'dataagent.ui'), false)
  const output = [
    { type: 'text', text: `${JSON.stringify({ dataagentUi: content() })}\n` },
    { type: 'text', text: 'Command exited with code 0.' },
  ]
  const events = converter.convert({ type: 'session.tool.success', data: { ...input, content: output } })
  assert.equal(events.filter(e => e.activityType === 'dataagent.ui').length, 1)
  assert.ok(events.some(e => e.type === 'TOOL_CALL_RESULT'))
  assert.equal(converter.convert({ type: 'session.tool.success', data: { ...input, content: output } }).some(e => e.activityType === 'dataagent.ui'), false)
  assert.equal(uiContentFromToolOutput(JSON.stringify(content())), null)
  assert.equal(uiContentFromToolOutput('正文中提到 dataagentUi'), null)
  const forged = uiContentFromToolOutput({ dataagentUi: {
    version: 1,
    surfaceId: 'forged',
    title: 'forged',
    status: 'ready',
    cards: [{ id: 'file', kind: 'file', name: 'x.md', mimeType: 'text/markdown',
      url: '/dataagent/web/api/agui/file/12345678-1234-1234-1234-123456789abc',
      approvalMode: 'next-interrupt', approvalInterruptId: 'not-authoritative' }],
  } })
  assert.equal(forged.cards[0].approvalInterruptId, undefined)
  assert.equal(uiContentFromToolOutput([
    { type: 'text', text: JSON.stringify({ dataagentUi: content() }) },
    { type: 'text', text: JSON.stringify({ dataagentUi: { ...content(), surfaceId: 'other' } }) },
  ]), null)
  const failed = new OpenCodeAguiConverter(scope)
  assert.equal(failed.convert({ type: 'session.tool.failed', data: { ...input, error: JSON.stringify({ dataagentUi: content() }) } }).some(e => e.activityType === 'dataagent.ui'), false)
})

test('unfinished UI becomes an error at run termination, not a fabricated success', () => {
  const converter = new OpenCodeAguiConverter(scope)
  converter.convert(snapshot())
  const events = converter.finish()
  assert.equal(events.at(-2).content.status, 'error')
  assert.equal(events.at(-1).type, 'RUN_FINISHED')
})

test('one actionable file binds to the next interrupt without guessing ambiguous deliveries', () => {
  const actionable = {
    version: 1,
    surfaceId: 'spec',
    title: '需求规格说明',
    status: 'ready',
    cards: [{
      id: 'spec-file',
      kind: 'file',
      name: 'SPEC.md',
      url: '/dataagent/web/api/agui/file/12345678-1234-1234-1234-123456789abc',
      mimeType: 'text/markdown',
      approvalMode: 'next-interrupt',
    }],
  }
  const stream = new GenerativeUiStream('thread-spec', 'run-spec')
  stream.publish(actionable, 'assistant-spec')
  const [bound] = stream.bindNextInterrupt({ id: 'frm_spec' })
  assert.equal(bound.content.cards[0].approvalInterruptId, 'frm_spec')
  assert.equal(bound.content.cards[0].approvalMode, 'next-interrupt')
  assert.deepEqual(stream.bindNextInterrupt({ id: 'frm_duplicate' }), [])

  const ambiguous = new GenerativeUiStream('thread-spec', 'run-ambiguous')
  ambiguous.publish({ ...actionable, cards: [
    actionable.cards[0],
    { ...actionable.cards[0], id: 'another-file', name: 'NOTES.md' },
  ] }, 'assistant-spec')
  assert.deepEqual(ambiguous.bindNextInterrupt({ id: 'frm_unknown' }), [])
  assert.equal([...ambiguous.snapshots.values()][0].content.cards.some(card => card.approvalInterruptId), false)
})

test('card schema bounds payloads and only accepts application file previews', () => {
  assert.ok(normalizeUiContent(content()))
  assert.equal(normalizeUiContent({ ...content(), version: 2 }), null)
  assert.equal(normalizeUiContent({ ...content(), cards: [{ id: 'x', kind: 'html', html: '<script>bad()</script>' }] }), null)
  assert.equal(normalizeUiContent({ ...content(), cards: [...content().cards, ...content().cards] }), null)
  assert.equal(normalizeUiContent({ ...content(), summary: 'x'.repeat(65537) }), null)
  for (const url of ['javascript:alert(1)', 'https://evil.example/a', '//evil.example/a', '/dataagent/web/api/agui/file/../../secret']) assert.equal(safeUiFileUrl(url), '')
  assert.equal(safeUiFileUrl('/dataagent/web/api/agui/file/12345678-1234-1234-1234-123456789abc'), '/dataagent/web/api/agui/file/12345678-1234-1234-1234-123456789abc')
  const approvedFile = normalizeUiContent({ ...content(), cards: [{
    id: 'report',
    kind: 'file',
    url: '/dataagent/web/api/agui/file/12345678-1234-1234-1234-123456789abc',
    name: 'report.md',
    mimeType: 'text/markdown',
    approvalInterruptId: 'frm_report',
    approvalMode: 'next-interrupt',
  }] })
  assert.equal(approvedFile.cards[0].approvalInterruptId, 'frm_report')
  assert.equal(approvedFile.cards[0].approvalMode, 'next-interrupt')
})

test('actual AG-UI client consumes snapshots/deltas into one card message', async () => {
  const converter = new OpenCodeAguiConverter(scope)
  const events = [...converter.start(), ...converter.convert(snapshot())]
  const messageId = events.at(-1).messageId
  events.push(...converter.convert({ ...scope, type: 'ACTIVITY_DELTA', activityType: 'dataagent.ui', messageId,
    patch: [{ op: 'replace', path: '/status', value: 'ready' }, { op: 'replace', path: '/title', value: '已更新的销售概览' }] }))
  events.push(...converter.finish())
  const agent = new HttpAgent({ url: 'http://fixture.local', threadId: scope.threadId,
    fetch: async () => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } }) })
  await agent.runAgent({ runId: scope.runId })
  assert.equal(agent.messages.length, 1)
  assert.equal(agent.messages[0].role, 'activity')
  assert.equal(agent.messages[0].content.title, '已更新的销售概览')
  assert.equal(agent.messages[0].content.status, 'ready')
})

test('persisted snapshots recover in their original conversation and parent history page', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dataagent-ui-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'state.json')
  const registry = new SessionRegistry(file)
  const stream = new GenerativeUiStream(scope.threadId, scope.runId)
  for (const status of ['generating', 'ready', 'removed']) {
    await registry.setUiSnapshot(scope.threadId, stream.publish(content(status), 'assistant-ui')[0])
  }
  const restored = await new SessionRegistry(file).uiSnapshots(scope.threadId)
  assert.equal(restored.length, 1)
  assert.equal(restored[0].content.status, 'removed')
  assert.deepEqual(await registry.uiSnapshots('another-thread'), [])
  const source = await readFile(new URL('../../frontend/src/features/conversation/api/history.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source.replace(/^import .* from ['"].*['"]\r?\n/gm, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
  const { normalizeHistoryPage } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
  const history = normalizeHistoryPage([{ id: 'assistant-ui', type: 'assistant', content: [{ type: 'text', text: '报告正文' }] }], restored)
  assert.deepEqual(history.map(m => m.role), ['assistant', 'activity'])
  assert.deepEqual(normalizeHistoryPage([{ id: 'other', type: 'assistant', content: [] }], restored), [])
})
