import assert from 'node:assert/strict'
import test from 'node:test'
import { applyResume } from '../src/interrupt-resume.mjs'

const registryWith = (pending) => {
  let receipt
  return {
    pendingInterrupts: async () => pending,
    lastResume: async () => receipt,
    resolveInterrupts: async (_threadId, next) => { receipt = next; pending.length = 0 },
  }
}

const clientRecorder = () => {
  const calls = []
  return {
    calls,
    replyPermission: async (...args) => calls.push(['permission', ...args]),
    replyQuestion: async (...args) => calls.push(['question', ...args]),
    rejectQuestion: async (...args) => calls.push(['question-reject', ...args]),
  }
}

test('dispatches one complete AG-UI resume set across permission and question interrupts', async () => {
  const pending = [
    {
      id: 'permission-1',
      toolCallId: 'tool-1',
      metadata: { kind: 'permission' },
    },
    {
      id: 'question-1',
      toolCallId: 'tool-2',
      metadata: { kind: 'question', questionCount: 2 },
    },
  ]
  const registry = registryWith(pending)
  const client = clientRecorder()

  const result = await applyResume({
    threadId: 'thread-1',
    sessionId: 'session-1',
    registry,
    client,
    resume: [
      { interruptId: 'permission-1', status: 'resolved', payload: { decision: 'once' } },
      { interruptId: 'question-1', status: 'resolved', payload: { answers: [['生产'], ['表', '自定义范围']] } },
    ],
  })

  assert.deepEqual(client.calls, [
    ['permission', 'session-1', 'permission-1', 'once', undefined],
    ['question', 'session-1', 'question-1', [['生产'], ['表', '自定义范围']]],
  ])
  assert.deepEqual(result.resumedToolCallIds, ['tool-1', 'tool-2'])
  assert.equal(result.replayed, false)
})

test('maps AG-UI cancelled question to OpenCode question reject', async () => {
  const pending = [{ id: 'question-1', metadata: { kind: 'question', questionCount: 1 } }]
  const registry = registryWith(pending)
  const client = clientRecorder()

  await applyResume({
    threadId: 'thread-1',
    sessionId: 'session-1',
    registry,
    client,
    resume: [{ interruptId: 'question-1', status: 'cancelled' }],
  })

  assert.deepEqual(client.calls, [['question-reject', 'session-1', 'question-1']])
})

test('rejects partial resume arrays before touching OpenCode', async () => {
  const pending = [
    { id: 'permission-1', metadata: { kind: 'permission' } },
    { id: 'question-1', metadata: { kind: 'question', questionCount: 1 } },
  ]
  const registry = registryWith(pending)
  const client = clientRecorder()

  await assert.rejects(() => applyResume({
    threadId: 'thread-1',
    sessionId: 'session-1',
    registry,
    client,
    resume: [{ interruptId: 'permission-1', status: 'resolved', payload: { decision: 'once' } }],
  }), /must cover all pending interrupts/)
  assert.deepEqual(client.calls, [])
})

test('validates question answer count and values before replying upstream', async () => {
  const pending = [{ id: 'question-1', metadata: { kind: 'question', questionCount: 2 } }]
  const registry = registryWith(pending)
  const client = clientRecorder()

  await assert.rejects(() => applyResume({
    threadId: 'thread-1',
    sessionId: 'session-1',
    registry,
    client,
    resume: [{ interruptId: 'question-1', status: 'resolved', payload: { answers: [['only-one']] } }],
  }), /requires 2 question answers/)
  assert.deepEqual(client.calls, [])
})

test('refuses expired interrupts', async () => {
  const pending = [{
    id: 'permission-1',
    expiresAt: '2000-01-01T00:00:00.000Z',
    metadata: { kind: 'permission' },
  }]
  const registry = registryWith(pending)
  const client = clientRecorder()

  await assert.rejects(() => applyResume({
    threadId: 'thread-1',
    sessionId: 'session-1',
    registry,
    client,
    resume: [{ interruptId: 'permission-1', status: 'resolved', payload: { decision: 'once' } }],
  }), /expired/)
  assert.deepEqual(client.calls, [])
})
