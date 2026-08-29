import test from 'node:test'
import { EventSchemas } from '@ag-ui/core'
import { createMockEvents } from '../src/mock-scenario.mjs'
import { OpenCodeAguiConverter } from '../src/converter.mjs'

const validate = (events) => {
  for (const event of events) EventSchemas.parse(event)
}

test('mock scenario only emits schema-valid AG-UI events', () => {
  validate(createMockEvents({ threadId: 'thread-schema', runId: 'run-schema' }))
})

test('native OpenCode2 reasoning events become schema-valid AG-UI events', () => {
  const converter = new OpenCodeAguiConverter({ threadId: 'thread-schema', runId: 'run-schema', sessionId: 'ses-schema' })
  validate(converter.start())
  validate(converter.convert({ type: 'session.reasoning.started', data: { sessionID: 'ses-schema', assistantMessageID: 'm1', ordinal: 0 } }))
  validate(converter.convert({ type: 'session.reasoning.delta', data: { sessionID: 'ses-schema', assistantMessageID: 'm1', ordinal: 0, delta: 'thinking' } }))
  validate(converter.convert({ type: 'session.reasoning.ended', data: { sessionID: 'ses-schema', assistantMessageID: 'm1', ordinal: 0, text: 'thinking' } }))
  validate(converter.convert({ type: 'session.execution.succeeded', data: { sessionID: 'ses-schema' } }))
})

test('OpenCode2 permissions become schema-valid AG-UI interrupt outcomes', () => {
  const converter = new OpenCodeAguiConverter({ threadId: 'thread-schema', runId: 'run-schema', sessionId: 'ses-schema' })
  validate(converter.start())
  validate(converter.convert({
    type: 'session.tool.input.ended',
    data: { sessionID: 'ses-schema', assistantMessageID: 'm1', id: 'tool-1', name: 'shell', text: '{}' },
  }))
  validate(converter.convert({
    type: 'permission.asked',
    data: { sessionID: 'ses-schema', id: 'permission-1', action: 'shell' },
  }))
})

test('OpenCode2 questions become schema-valid AG-UI interrupt outcomes', () => {
  const converter = new OpenCodeAguiConverter({ threadId: 'thread-schema', runId: 'run-schema', sessionId: 'ses-schema' })
  validate(converter.start())
  validate(converter.convert({
    type: 'question.asked',
    data: {
      sessionID: 'ses-schema',
      id: 'question-1',
      questions: [
        {
          header: '环境',
          question: '请选择环境',
          options: [{ label: '测试' }, { label: '生产' }],
          multiple: false,
          custom: false,
        },
        {
          header: '范围',
          question: '请选择范围',
          options: [{ label: '表' }, { label: '视图' }],
          multiple: true,
          custom: true,
        },
      ],
    },
  }))
})
