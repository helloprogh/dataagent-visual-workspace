import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { SessionRegistry } from '../src/session-registry.mjs'

test('persists pending interrupts and the latest resume receipt', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dataagent-session-registry-'))
  const file = path.join(directory, 'thread-sessions.json')
  t.after(() => rm(directory, { recursive: true, force: true }))

  const registry = new SessionRegistry(file)
  await registry.set('thread-1', 'session-1')
  await registry.setPendingInterrupts('thread-1', [{ id: 'permission-1', toolCallId: 'tool-1' }])

  const reloaded = new SessionRegistry(file)
  assert.deepEqual(await reloaded.pendingInterrupts('thread-1'), [{ id: 'permission-1', toolCallId: 'tool-1' }])

  const receipt = {
    signature: '[{"interruptId":"permission-1","status":"resolved","payload":{"decision":"once"}}]',
    resumedToolCallIds: ['tool-1'],
    resolvedAt: 1,
  }
  await reloaded.resolveInterrupts('thread-1', receipt)

  const resolved = new SessionRegistry(file)
  assert.deepEqual(await resolved.pendingInterrupts('thread-1'), [])
  assert.deepEqual(await resolved.lastResume('thread-1'), receipt)
})
