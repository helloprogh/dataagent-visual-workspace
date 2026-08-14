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
