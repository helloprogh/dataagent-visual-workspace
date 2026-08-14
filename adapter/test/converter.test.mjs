import assert from 'node:assert/strict'
import test from 'node:test'
import { OpenCodeAguiConverter } from '../src/converter.mjs'

const create = () => new OpenCodeAguiConverter({ threadId: 'thread-1', runId: 'run-1', sessionId: 'ses-1' })
const types = (events) => events.map((item) => item.type)

test('starts exactly one AG-UI run', () => {
  const converter = create()
  assert.deepEqual(types(converter.start()), ['RUN_STARTED'])
  assert.deepEqual(converter.start(), [])
})

test('converts OpenCode text delta into a valid AG-UI text lifecycle', () => {
  const converter = create()
  const events = converter.convert({ type: 'message.part.delta', properties: { sessionID: 'ses-1', messageID: 'm1', partID: 'p1', field: 'text', delta: 'hello' } })
  assert.deepEqual(types(events), ['TEXT_MESSAGE_START', 'TEXT_MESSAGE_CONTENT'])
  assert.equal(events[1].messageId, 'm1')
  assert.equal(events[1].delta, 'hello')
})

test('ignores metadata-only content events', () => {
  const converter = create()
  assert.deepEqual(converter.convert({ type: 'TEXT_MESSAGE_CONTENT', data: { sessionID: 'ses-1', messageID: 'm1', ordinal: 0 } }), [])
})

test('filters events from another session', () => {
  const converter = create()
  assert.deepEqual(converter.convert({ type: 'message.part.delta', properties: { sessionID: 'other', messageID: 'm1', delta: 'no' } }), [])
})

test('converts a completed tool call', () => {
  const converter = create()
  const events = converter.convert({ type: 'message.part.updated', properties: { part: { type: 'tool', sessionID: 'ses-1', messageID: 'm1', callID: 'call-1', tool: 'query', state: { status: 'completed', input: { sql: 'select 1' }, output: '1' } } } })
  assert.deepEqual(types(events), ['TOOL_CALL_START', 'TOOL_CALL_ARGS', 'TOOL_CALL_END', 'TOOL_CALL_RESULT'])
})

test('converts reasoning with a closed lifecycle', () => {
  const converter = create()
  const events = converter.convert({ type: 'message.part.updated', properties: { part: { type: 'reasoning', sessionID: 'ses-1', messageID: 'm1', text: 'thinking', done: true } } })
  assert.deepEqual(types(events), ['REASONING_START', 'REASONING_MESSAGE_START', 'REASONING_MESSAGE_CONTENT', 'REASONING_MESSAGE_END', 'REASONING_END'])
})

test('finishes only when the OpenCode session becomes idle', () => {
  const converter = create()
  converter.start()
  assert.deepEqual(converter.convert({ type: 'session.status', properties: { sessionID: 'ses-1', status: { type: 'busy' } } }), [])
  assert.deepEqual(types(converter.convert({ type: 'session.status', properties: { sessionID: 'ses-1', status: { type: 'idle' } } })), ['RUN_FINISHED'])
})

test('turns session errors into RUN_ERROR', () => {
  const converter = create()
  const events = converter.convert({ type: 'session.error', properties: { sessionID: 'ses-1', error: { message: 'boom' } } })
  assert.deepEqual(types(events), ['RUN_ERROR'])
  assert.equal(events[0].message, 'boom')
})

test('converts native v2 text, reasoning and execution events', () => {
  const converter = create()
  converter.start()
  assert.deepEqual(types(converter.convert({ type: 'session.text.started', data: { sessionID: 'ses-1', assistantMessageID: 'a1', ordinal: 0 } })), ['TEXT_MESSAGE_START'])
  assert.deepEqual(types(converter.convert({ type: 'session.text.delta', data: { sessionID: 'ses-1', assistantMessageID: 'a1', ordinal: 0, delta: 'hello' } })), ['TEXT_MESSAGE_CONTENT'])
  assert.deepEqual(types(converter.convert({ type: 'session.text.ended', data: { sessionID: 'ses-1', assistantMessageID: 'a1', ordinal: 0, text: 'hello' } })), ['TEXT_MESSAGE_END'])
  assert.deepEqual(types(converter.convert({ type: 'session.reasoning.delta', data: { sessionID: 'ses-1', assistantMessageID: 'a1', ordinal: 0, delta: 'think' } })), ['REASONING_START', 'REASONING_MESSAGE_START', 'REASONING_MESSAGE_CONTENT'])
  assert.deepEqual(types(converter.convert({ type: 'session.reasoning.ended', data: { sessionID: 'ses-1', assistantMessageID: 'a1', ordinal: 0, text: 'think' } })), ['REASONING_MESSAGE_END', 'REASONING_END'])
  assert.deepEqual(types(converter.convert({ type: 'session.execution.succeeded', data: { sessionID: 'ses-1' } })), ['CUSTOM', 'RUN_FINISHED'])
})

test('converts native v2 tool and sub-agent lifecycle', () => {
  const converter = create()
  const started = converter.convert({ type: 'session.tool.input.started', data: { sessionID: 'ses-1', assistantMessageID: 'a1', id: 't1', name: 'task' } })
  assert.deepEqual(types(started), ['TOOL_CALL_START', 'CUSTOM'])
  assert.deepEqual(types(converter.convert({ type: 'session.tool.input.delta', data: { sessionID: 'ses-1', assistantMessageID: 'a1', id: 't1', delta: '{"prompt":"work"}' } })), ['TOOL_CALL_ARGS'])
  const ended = converter.convert({ type: 'session.tool.success', data: { sessionID: 'ses-1', assistantMessageID: 'a1', id: 't1', content: [{ type: 'text', text: 'done' }], executed: true } })
  assert.deepEqual(types(ended), ['TOOL_CALL_END', 'TOOL_CALL_RESULT', 'CUSTOM'])
  assert.equal(ended[1].content, 'done')
})

test('uses the same AG-UI step name at both lifecycle boundaries', () => {
  const converter = create()
  const started = converter.convert({ type: 'session.step.started', data: { sessionID: 'ses-1', assistantMessageID: 'a1', agent: 'build', model: { id: 'model-1' } } })
  const ended = converter.convert({ type: 'session.step.ended', data: { sessionID: 'ses-1', assistantMessageID: 'a1', finish: 'stop', cost: 0, tokens: {} } })
  assert.equal(started[0].stepName, 'build · model-1')
  assert.equal(ended[0].stepName, started[0].stepName)
})
