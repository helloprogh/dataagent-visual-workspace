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

test('turns OpenCode permission requests into a standard AG-UI interrupt', () => {
  const converter = create()
  converter.convert({
    type: 'session.tool.input.ended',
    data: { sessionID: 'ses-1', assistantMessageID: 'a1', id: 'tool-1', name: 'shell', text: '{"command":"npm test"}' },
  })
  const events = converter.convert({
    type: 'permission.asked',
    data: { sessionID: 'ses-1', id: 'permission-1', action: 'shell', resources: ['npm test'] },
  })
  const finished = events.at(-1)

  assert.deepEqual(types(events), ['ACTIVITY_SNAPSHOT', 'TOOL_CALL_END', 'RUN_FINISHED'])
  assert.equal(finished.outcome.type, 'interrupt')
  assert.deepEqual(finished.outcome.interrupts[0], {
    id: 'permission-1',
    reason: 'tool_call',
    message: '工具 shell 请求人工授权。',
    toolCallId: 'tool-1',
    responseSchema: {
      type: 'object',
      required: ['decision'],
      properties: {
        decision: {
          type: 'string',
          enum: ['once', 'always', 'reject'],
          title: '授权决定',
        },
      },
      additionalProperties: false,
    },
    metadata: { source: 'opencode2', kind: 'permission', action: 'shell', resources: ['npm test'] },
  })
})

test('turns OpenCode question requests into schema-driven AG-UI forms with single, multi and custom answers', () => {
  const converter = create()
  const events = converter.convert({
    type: 'question.asked',
    data: {
      sessionID: 'ses-1',
      id: 'question-1',
      tool: { messageID: 'a1', callID: 'tool-question' },
      questions: [
        {
          header: '环境',
          question: '选择部署环境',
          multiple: false,
          custom: false,
          options: [
            { label: '测试', description: '测试环境' },
            { label: '生产', description: '生产环境' },
          ],
        },
        {
          header: '范围',
          question: '选择需要处理的范围',
          multiple: true,
          custom: true,
          options: [
            { label: '表', description: '处理表' },
            { label: '视图', description: '处理视图' },
          ],
        },
      ],
    },
  })
  const finished = events.at(-1)
  const interrupt = finished.outcome.interrupts[0]

  assert.deepEqual(types(events), ['ACTIVITY_SNAPSHOT', 'RUN_FINISHED'])
  assert.equal(finished.outcome.type, 'interrupt')
  assert.equal(interrupt.id, 'question-1')
  assert.equal(interrupt.reason, 'input_required')
  assert.equal(interrupt.toolCallId, 'tool-question')
  assert.equal(interrupt.metadata.kind, 'question')
  assert.equal(interrupt.metadata.questionCount, 2)
  assert.equal(interrupt.responseSchema.type, 'object')
  const answers = interrupt.responseSchema.properties.answers
  assert.equal(answers.type, 'array')
  assert.equal(answers.minItems, 2)
  assert.equal(answers.maxItems, 2)
  assert.deepEqual(answers.default, [[], []])
  assert.equal(answers.prefixItems[0].maxItems, 1)
  assert.deepEqual(answers.prefixItems[0].items.enum, ['测试', '生产'])
  assert.equal(answers.prefixItems[1].maxItems, undefined)
  assert.deepEqual(answers.prefixItems[1].items.anyOf[0].enum, ['表', '视图'])
  assert.equal(answers.prefixItems[1].items.anyOf[1].type, 'string')
})

test('resumed tool calls emit only the result in the new run', () => {
  const converter = new OpenCodeAguiConverter({
    threadId: 'thread-1',
    runId: 'run-2',
    sessionId: 'ses-1',
    resumedToolCallIds: ['tool-1'],
  })

  assert.deepEqual(converter.convert({
    type: 'session.tool.input.ended',
    data: { sessionID: 'ses-1', assistantMessageID: 'a1', id: 'tool-1', name: 'shell', text: '{}' },
  }), [])
  assert.deepEqual(types(converter.convert({
    type: 'session.tool.success',
    data: { sessionID: 'ses-1', assistantMessageID: 'a1', id: 'tool-1', name: 'shell', content: 'done' },
  })), ['TOOL_CALL_RESULT'])
})

test('converts native v2 text, reasoning and execution events', () => {
  const converter = create()
  converter.start()
  assert.deepEqual(types(converter.convert({ type: 'session.text.started', data: { sessionID: 'ses-1', assistantMessageID: 'a1', ordinal: 0 } })), ['TEXT_MESSAGE_START'])
  assert.deepEqual(types(converter.convert({ type: 'session.text.delta', data: { sessionID: 'ses-1', assistantMessageID: 'a1', ordinal: 0, delta: 'hello' } })), ['TEXT_MESSAGE_CONTENT'])
  assert.deepEqual(types(converter.convert({ type: 'session.text.ended', data: { sessionID: 'ses-1', assistantMessageID: 'a1', ordinal: 0, text: 'hello' } })), ['TEXT_MESSAGE_END'])
  assert.deepEqual(types(converter.convert({ type: 'session.reasoning.delta', data: { sessionID: 'ses-1', assistantMessageID: 'a1', ordinal: 0, delta: 'think' } })), ['REASONING_START', 'REASONING_MESSAGE_START', 'REASONING_MESSAGE_CONTENT'])
  assert.deepEqual(types(converter.convert({ type: 'session.reasoning.ended', data: { sessionID: 'ses-1', assistantMessageID: 'a1', ordinal: 0, text: 'think' } })), ['REASONING_MESSAGE_END', 'REASONING_END'])
  assert.deepEqual(types(converter.convert({ type: 'session.execution.succeeded', data: { sessionID: 'ses-1' } })), ['ACTIVITY_SNAPSHOT', 'RUN_FINISHED'])
})

test('keeps one reasoning message when OpenCode2 increments ordinal', () => {
  const converter = create()
  const started = converter.convert({ type: 'session.reasoning.started', data: { sessionID: 'ses-1', assistantMessageID: 'a1', ordinal: 0 } })
  const delta = converter.convert({ type: 'session.reasoning.delta', data: { sessionID: 'ses-1', assistantMessageID: 'a1', ordinal: 3, delta: 'think' } })
  const ended = converter.convert({ type: 'session.reasoning.ended', data: { sessionID: 'ses-1', assistantMessageID: 'a1', ordinal: 9 } })

  assert.deepEqual(types(started), ['REASONING_START', 'REASONING_MESSAGE_START'])
  assert.deepEqual(types(delta), ['REASONING_MESSAGE_CONTENT'])
  assert.deepEqual(types(ended), ['REASONING_MESSAGE_END', 'REASONING_END'])
  assert.deepEqual(new Set([...started, ...delta, ...ended].map(item => item.messageId)), new Set(['a1-reasoning']))
  assert.deepEqual(converter.convert({ type: 'session.reasoning.ended', data: { sessionID: 'ses-1', assistantMessageID: 'a1', ordinal: 12 } }), [])
  assert.deepEqual(converter.convert({ type: 'session.reasoning.delta', data: { sessionID: 'ses-1', assistantMessageID: 'a1', ordinal: 13, delta: 'late duplicate' } }), [])
})

test('converts native v2 tool and sub-agent lifecycle', () => {
  const converter = create()
  const started = converter.convert({ type: 'session.tool.input.started', data: { sessionID: 'ses-1', assistantMessageID: 'a1', id: 't1', name: 'task' } })
  assert.deepEqual(types(started), ['TOOL_CALL_START', 'ACTIVITY_SNAPSHOT'])
  assert.deepEqual(types(converter.convert({ type: 'session.tool.input.delta', data: { sessionID: 'ses-1', assistantMessageID: 'a1', id: 't1', delta: '{"prompt":"work"}' } })), ['TOOL_CALL_ARGS'])
  const ended = converter.convert({ type: 'session.tool.success', data: { sessionID: 'ses-1', assistantMessageID: 'a1', id: 't1', content: [{ type: 'text', text: 'done' }], executed: true } })
  assert.deepEqual(types(ended), ['TOOL_CALL_END', 'TOOL_CALL_RESULT', 'ACTIVITY_SNAPSHOT'])
  assert.equal(ended[1].content, 'done')
})

test('uses the same AG-UI step name at both lifecycle boundaries', () => {
  const converter = create()
  const started = converter.convert({ type: 'session.step.started', data: { sessionID: 'ses-1', assistantMessageID: 'a1', agent: 'build', model: { id: 'model-1' } } })
  const ended = converter.convert({ type: 'session.step.ended', data: { sessionID: 'ses-1', assistantMessageID: 'a1', finish: 'stop', cost: 0, tokens: {} } })
  assert.equal(started[0].stepName, 'build · model-1')
  assert.equal(ended[0].stepName, started[0].stepName)
})

test('closes an active OpenCode step before finishing a paused frontend tool run', () => {
  const converter = create()
  converter.start()
  const started = converter.convert({ type: 'session.step.started', data: { sessionID: 'ses-1', assistantMessageID: 'a1', agent: 'build', model: { id: 'test-model' } } })
  const tool = converter.convert({ type: 'session.tool.input.started', data: { sessionID: 'ses-1', assistantMessageID: 'a1', id: 'tool-1', name: 'agui_frontend_workspace_render' } })
  const finished = converter.finish()

  assert.deepEqual(types(started), ['STEP_STARTED'])
  assert.deepEqual(types(tool), ['TOOL_CALL_START'])
  assert.deepEqual(types(finished), ['TOOL_CALL_END', 'STEP_FINISHED', 'RUN_FINISHED'])
  assert.equal(finished[1].stepName, started[0].stepName)
})

test('ignores unmatched and duplicate step lifecycle events', () => {
  const converter = create()
  const unmatched = converter.convert({ type: 'session.step.ended', data: { sessionID: 'ses-1', assistantMessageID: 'a1' } })
  const started = converter.convert({ type: 'session.step.started', data: { sessionID: 'ses-1', assistantMessageID: 'a1', agent: 'build' } })
  const duplicate = converter.convert({ type: 'session.step.started', data: { sessionID: 'ses-1', assistantMessageID: 'a1', agent: 'build' } })
  const ended = converter.convert({ type: 'session.step.ended', data: { sessionID: 'ses-1', assistantMessageID: 'a1' } })
  const duplicateEnd = converter.convert({ type: 'session.step.ended', data: { sessionID: 'ses-1', assistantMessageID: 'a1' } })

  assert.deepEqual(unmatched, [])
  assert.deepEqual(types(started), ['STEP_STARTED'])
  assert.deepEqual(duplicate, [])
  assert.deepEqual(types(ended), ['STEP_FINISHED'])
  assert.deepEqual(duplicateEnd, [])
})
