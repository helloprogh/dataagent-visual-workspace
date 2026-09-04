import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { HttpAgent } from '@ag-ui/client'
import { OpenCodeAguiConverter } from '../src/converter.mjs'
import { GenerativeUiStream } from '../src/generative-ui.mjs'
import { A2uiStream } from '../src/a2ui.mjs'
import { SessionRegistry } from '../src/session-registry.mjs'
import { normalizeUiContent, applyUiPatch, uiContentFromToolOutput, safeUiFileUrl } from '../../shared/generative-ui.mjs'
import { A2UI_CATALOG_ID, normalizeA2uiAction, normalizeRenderA2uiArgs } from '../../shared/a2ui.mjs'
import { artifactPathKey, generatedArtifactsFromTool, removedArtifactPathsFromTool } from '../../shared/generated-artifacts.mjs'

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
  assert.equal(safeUiFileUrl('/dataagent/web/api/agui/workspace-file?path=data-applications%2Fdemo-sales%2F01-specification%2Fanalysis-spec.json'), '/dataagent/web/api/agui/workspace-file?path=data-applications%2Fdemo-sales%2F01-specification%2Fanalysis-spec.json')
  assert.equal(safeUiFileUrl('/dataagent/web/api/agui/workspace-archive?path=data-development-delivery.zip'), '/dataagent/web/api/agui/workspace-archive?path=data-development-delivery.zip')
  for (const url of [
    '/dataagent/web/api/agui/workspace-file?path=..%2Fsecret',
    '/dataagent/web/api/agui/workspace-file?path=%2Fabsolute',
    '/dataagent/web/api/agui/workspace-file?path=report.md&entry=secret',
  ]) assert.equal(safeUiFileUrl(url), '')
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
  const workspaceArchive = normalizeUiContent({ ...content(), cards: [{
    id: 'archive',
    kind: 'file',
    url: '/dataagent/web/api/agui/workspace-archive?path=data-development-delivery.zip',
    name: 'data-development-delivery.zip',
    mimeType: 'application/zip',
  }] })
  assert.equal(workspaceArchive.cards[0].url, '/dataagent/web/api/agui/workspace-archive?path=data-development-delivery.zip')
})

test('successful native writes and shell-created archives become previewable artifacts', () => {
  const completed = new Set(['write-1', 'shell-1'])
  assert.deepEqual(generatedArtifactsFromTool({ id: 'write-1', function: { name: 'write', arguments: JSON.stringify({ path: 'data-applications/demo/analysis.json' }) } }, completed), [{
    id: 'generated-write-1', sourcePath: 'data-applications/demo/analysis.json', name: 'analysis.json', mimeType: 'application/json', archive: false,
  }])
  const archives = generatedArtifactsFromTool({ id: 'shell-1', function: { name: 'shell', arguments: JSON.stringify({ command: 'Get-Item "D:\\ProjectSpace\\dataagent\\delivery.zip"; [System.IO.Compression.ZipFile]::OpenRead("D:\\ProjectSpace\\dataagent\\delivery.zip")' }) } }, completed)
  assert.equal(archives.length, 1)
  assert.equal(archives[0].name, 'delivery.zip')
  assert.equal(archives[0].archive, true)
  assert.deepEqual(generatedArtifactsFromTool({ id: 'failed', function: { name: 'shell', arguments: JSON.stringify({ command: 'Compress-Archive input "failed.zip"' }) } }, completed), [])
  assert.deepEqual(removedArtifactPathsFromTool({ id: 'shell-1', function: { name: 'shell', arguments: JSON.stringify({ command: 'Remove-Item "D:\\workspace\\PENDING.md" -Force; Get-ChildItem .' }) } }, completed), ['D:\\workspace\\PENDING.md'])
  assert.equal(artifactPathKey('D:\\WORKSPACE\\PENDING.md'), 'd:/workspace/pending.md')
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

test('dataagent-master render_a2ui calls become validated A2UI v0.9 activities', () => {
  const converter = new OpenCodeAguiConverter({ ...scope, a2uiAvailable: true })
  const input = {
    surfaceId: 'sales-dashboard',
    components: [
      { component: 'Column', id: 'root', children: [{ component: 'Text', id: 'title', value: '销售概览' }, 'chart'] },
      { component: 'BarChart', id: 'chart', title: '区域销售', xField: 'region', yField: 'sales', data: { path: '/regions' } },
    ],
    data: { regions: [{ region: '华东', sales: 78 }] },
  }
  converter.convert({ type: 'session.tool.input.started', data: {
    sessionID: scope.sessionId, assistantMessageID: 'assistant-a2ui', id: 'a2ui-1', name: 'agui_a2ui_render_a2ui',
  } })
  converter.convert({ type: 'session.tool.input.ended', data: {
    sessionID: scope.sessionId, assistantMessageID: 'assistant-a2ui', id: 'a2ui-1', name: 'agui_a2ui_render_a2ui', text: JSON.stringify(input),
  } })
  const events = converter.convert({ type: 'session.tool.success', data: {
    sessionID: scope.sessionId, assistantMessageID: 'assistant-a2ui', id: 'a2ui-1', name: 'agui_a2ui_render_a2ui', content: 'rendered',
  } })
  const activity = events.find(event => event.activityType === 'a2ui-surface')
  assert.ok(activity)
  assert.equal(activity.replace, true)
  assert.equal(activity.messageId, 'a2ui-sales-dashboard')
  assert.equal(activity.content.a2ui_operations[0].createSurface.catalogId, A2UI_CATALOG_ID)
  assert.equal(activity.content.a2ui_operations[1].updateComponents.components[1].text, '销售概览')
  assert.equal(activity.content.a2ui_operations[2].updateDataModel.path, '/')
})

test('A2UI validation rejects executable components, bad graphs, and retired approvals', () => {
  assert.equal(normalizeRenderA2uiArgs({ surfaceId: 'unsafe', components: [{ component: 'Script', id: 'root' }] }), null)
  assert.equal(normalizeRenderA2uiArgs({ surfaceId: 'cycle', components: [
    { component: 'Column', id: 'root', children: ['child'] },
    { component: 'Column', id: 'child', children: ['root'] },
  ] }), null)
  assert.equal(normalizeA2uiAction({ name: 'request_user_confirm', surfaceId: 'approval' }), null)
  assert.deepEqual(normalizeA2uiAction({ name: 'refresh', surfaceId: 'sales' }), {
    version: 'v0.9', action: { name: 'refresh', surfaceId: 'sales' },
  })
})

test('frontend A2UI sanitizer preserves a standalone delete snapshot', async () => {
  const source = await readFile(new URL('../../frontend/src/a2ui/sanitizeOperations.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  })
  const { sanitizeA2uiOperations } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
  const operations = sanitizeA2uiOperations([
    { version: 'v0.9', deleteSurface: { surfaceId: 'sales' } },
  ], new Set(['Text']))
  assert.deepEqual(operations, [{ version: 'v0.9', deleteSurface: { surfaceId: 'sales' } }])
})

test('A2UI surface updates reuse the persisted message and original parent', () => {
  const firstStream = new A2uiStream('thread-a2ui', 'run-1')
  const [first] = firstStream.publish({ surfaceId: 'sales', components: [{ component: 'Text', id: 'root', text: '一' }] }, 'assistant-1')
  const nextStream = new A2uiStream('thread-a2ui', 'run-2', [first])
  const [updated] = nextStream.publish({ surfaceId: 'sales', components: [{ component: 'Text', id: 'root', text: '二' }] }, 'assistant-2')
  assert.equal(updated.messageId, first.messageId)
  assert.equal(updated.parentMessageId, 'assistant-1')
  assert.equal(updated.runId, 'run-2')
})
