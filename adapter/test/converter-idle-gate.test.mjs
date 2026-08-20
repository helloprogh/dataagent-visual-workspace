import assert from 'node:assert/strict'
import test from 'node:test'
import { OpenCodeAguiConverter } from '../src/converter.mjs'

const types = (events) => events.map((item) => item.type)

const create = () => new OpenCodeAguiConverter({
  threadId: 'thread-1',
  runId: 'run-1',
  sessionId: 'ses-1',
})

test('ignores an initial idle event until the current run has actually started', () => {
  const converter = create()
  converter.start()

  const initialIdle = converter.convert({
    type: 'session.status',
    properties: { sessionID: 'ses-1', status: { type: 'idle' } },
  })
  assert.deepEqual(initialIdle, [])
  assert.equal(converter.finished, false)

  const busy = converter.convert({
    type: 'session.status',
    properties: { sessionID: 'ses-1', status: { type: 'busy' } },
  })
  assert.deepEqual(busy, [])

  const delta = converter.convert({
    type: 'session.text.delta',
    properties: { sessionID: 'ses-1', assistantMessageID: 'a1', delta: 'hello' },
  })
  assert.deepEqual(types(delta), ['TEXT_MESSAGE_START', 'TEXT_MESSAGE_CONTENT'])

  const finalIdle = converter.convert({
    type: 'session.status',
    properties: { sessionID: 'ses-1', status: { type: 'idle' } },
  })
  assert.deepEqual(types(finalIdle), ['TEXT_MESSAGE_END', 'RUN_FINISHED'])
  assert.equal(converter.finished, true)
})

test('ignores stale execution success before the current run becomes active', () => {
  const converter = create()
  converter.start()

  assert.deepEqual(converter.convert({
    type: 'session.execution.succeeded',
    properties: { sessionID: 'ses-1' },
  }), [])
  assert.equal(converter.finished, false)

  assert.deepEqual(types(converter.convert({
    type: 'session.execution.started',
    properties: { sessionID: 'ses-1' },
  })), ['ACTIVITY_SNAPSHOT'])

  assert.deepEqual(types(converter.convert({
    type: 'session.execution.succeeded',
    properties: { sessionID: 'ses-1' },
  })), ['ACTIVITY_SNAPSHOT', 'RUN_FINISHED'])
})
