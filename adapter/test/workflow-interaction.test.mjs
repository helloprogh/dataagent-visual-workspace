import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function loadFrontendModule(name) {
  const source = await fs.readFile(new URL(`../../frontend/src/features/conversation/${name}.ts`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}
const { deriveWorkflow, toolWorkflowStage, WORKFLOW_STAGES } = await loadFrontendModule('workflow')
const { publishAndRun } = await loadFrontendModule('sendLifecycle')
const user = (content, id = 'u1') => ({ id, role: 'user', content })
const tool = (name, command = '', id = 't1') => ({ id: `a-${id}`, role: 'assistant', content: '', toolCalls: [{ id, function: { name, arguments: JSON.stringify({ command }) } }] })
const result = (id = 't1', error) => ({ id: `r-${id}`, role: 'tool', toolCallId: id, content: 'result', ...(error ? { error } : {}) })

test('a running greeting or a question about development never means developing', () => {
  for (const text of ['你好', '怎么进入开发步骤', '请解释开发流程', '不要开始开发']) {
    assert.equal(deriveWorkflow([user(text)], { running: true }).active, 'clarify')
  }
})
test('each prepared phase instruction maps to its requested phase without pretending execution', () => {
  for (const stage of WORKFLOW_STAGES) {
    const state = deriveWorkflow([user(stage.prompt)], { running: true })
    assert.equal(state.active, stage.id)
    assert.equal(state.status, 'requested')
  }
})
test('file writes move into development and history replay retains that stage', () => {
  const history = [user('改一下文件'), tool('edit'), result()]
  assert.equal(deriveWorkflow(history, { running: true }).active, 'develop')
  assert.equal(deriveWorkflow(history).active, 'develop')
  assert.equal(deriveWorkflow(history).status, 'recorded')
  assert.equal(deriveWorkflow([...history, tool('read', '', 't2')]).active, 'develop')
})
test('tests and builds enter verification; repair after validation returns to development', () => {
  const history = [user('修改'), tool('write'), result(), tool('bash', 'npm run test', 't2'), result('t2')]
  assert.equal(deriveWorkflow(history).active, 'verify')
  assert.equal(deriveWorkflow([...history, tool('edit', '', 't3')]).active, 'develop')
  assert.equal(toolWorkflowStage('bash', '{"command":"npm run bu'), undefined)
  assert.equal(toolWorkflowStage('bash', '{"command":"git status"}'), undefined)
})
test('permission waiting and stopping do not fabricate a validation stage', () => {
  const history = [user('开始开发'), tool('write')]
  assert.equal(deriveWorkflow(history, { waiting: true }).active, 'develop')
  assert.equal(deriveWorkflow(history, { waiting: true }).status, 'waiting')
  assert.equal(deriveWorkflow(history, { stopped: true }).active, 'develop')
  assert.equal(deriveWorkflow(history, { stopped: true }).status, 'stopped')
})
test('failed tool or run stays incomplete; skipped phases are not marked completed', () => {
  const history = [user('请验证'), tool('bash', 'npm test'), result('t1', 'failed')]
  const state = deriveWorkflow(history)
  assert.equal(state.status, 'failed')
  assert.equal(state.evidence.develop, undefined)
  assert.equal(deriveWorkflow(history, { error: 'connection lost' }).active, 'verify')
})
test('new unrelated chat does not mark the previous development as running', () => {
  const state = deriveWorkflow([user('开始开发'), tool('write'), result(), user('你好', 'u2')], { running: true })
  assert.equal(state.active, 'develop')
  assert.equal(state.status, 'recorded')
})
test('only assistant attachments are delivery evidence', () => {
  const content = [{ type: 'document', source: { value: '/file/report.md' } }]
  assert.equal(deriveWorkflow([user(content)]).active, 'clarify')
  assert.equal(deriveWorkflow([{ id: 'a1', role: 'assistant', content }]).active, 'deliver')
})
test('acceptance clears the submitted draft before a slow stream and does not clear a new draft', async () => {
  const order = []
  let draft = 'welcome question'
  let finish
  const stream = new Promise(resolve => { finish = resolve })
  const pending = publishAndRun({ sessionId: 'new', created: true }, () => order.push('publish'), receipt => {
    assert.equal(receipt.created, true)
    order.push('accepted')
    draft = ''
  }, () => { order.push('run'); return stream })
  assert.deepEqual(order, ['publish', 'accepted', 'run'])
  assert.equal(draft, '')
  draft = 'next question'
  finish()
  await pending
  assert.equal(draft, 'next question')
})
test('failure before publication retains the draft; a stream failure does not restore stale text', async () => {
  let draft = 'question'
  await assert.rejects(publishAndRun({}, () => { throw Error('publish failed') }, () => { draft = '' }, async () => {}))
  assert.equal(draft, 'question')
  await assert.rejects(publishAndRun({}, () => {}, () => { draft = '' }, async () => { throw Error('stream failed') }))
  assert.equal(draft, '')
})
