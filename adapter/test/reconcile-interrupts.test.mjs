import assert from 'node:assert/strict'
import test from 'node:test'
import { reconcileInterrupts } from '../src/reconcile-interrupts.mjs'
import { interruptFromPermission } from '../src/permission-interrupt.mjs'

const permission = id => interruptFromPermission({ id, action: 'external_directory' })
const form = { id: 'old-form', metadata: { kind: 'form' } }

test('hydration removes externally resolved cached approvals and discovers additional ones', async () => {
  const client = { listForms: async () => [], listPermissions: async () => [{ id: 'new-permission', action: 'read' }] }
  const actual = await reconcileInterrupts(client, 'session', [form, permission('old-permission')])
  assert.deepEqual(actual.map(item => item.id), ['new-permission'])
  assert.equal(actual[0].toolCallId, undefined, 'array index must not become a tool id')
})

test('failed or malformed kind preserves its cached approvals while another kind updates', async () => {
  for (const listForms of [async () => { throw new Error('offline') }, async () => ({}), async () => [null]]) {
    assert.deepEqual(await reconcileInterrupts({ listForms, listPermissions: async () => [] }, 'session', [form, permission('old')]), [form])
  }
})

test('unavailable endpoints and unclassified legacy interrupts are not silently discarded', async () => {
  const legacy = { id: 'legacy' }
  assert.deepEqual(await reconcileInterrupts({}, 'session', [form, legacy]), [form, legacy])
  assert.deepEqual(await reconcileInterrupts({ listForms: async () => [], listPermissions: async () => [] }, 'session', [legacy]), [legacy])
})

test('existing tool correlation survives upstream omission without keeping stale choices', async () => {
  const old = { ...permission('same'), toolCallId: 'tool-original' }
  const result = await reconcileInterrupts({ listPermissions: async () => [{ id: 'same', action: 'write' }] }, 'session', [old])
  assert.equal(result[0].toolCallId, 'tool-original')
  assert.equal(result[0].metadata.action, 'write')
})
