import assert from 'node:assert/strict'
import test from 'node:test'
import { interruptFromPermission } from '../src/permission-interrupt.mjs'
import { OpenCodeAguiConverter } from '../src/converter.mjs'

test('live and restored permissions share schema and V2 tool correlation', () => {
  const raw = { id: 'per_test', action: 'read', resources: ['fixture'], source: { type: 'tool', id: 'tool-test' } }
  const restored = interruptFromPermission(raw)
  const converter = new OpenCodeAguiConverter({ threadId: 't', runId: 'r', sessionId: 's' })
  const live = converter.interrupt(raw).find(item => item.type === 'RUN_FINISHED').outcome.interrupts[0]
  assert.deepEqual(live, restored)
  assert.equal(restored.toolCallId, 'tool-test')
  assert.equal(interruptFromPermission({ action: 'read' }), null)
})
