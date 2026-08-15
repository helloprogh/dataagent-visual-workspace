import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeState, stateSnapshot } from '../src/agui.mjs'

test('normalizes serialized workspace widgets into an array', () => {
  const state = {
    workspace: {
      threadId: 'thread-1',
      widgets: '[{"id":"chart1","component":"ui.areaChart","props":{"points":[]}}]',
    },
  }

  const normalized = normalizeState(state)
  assert.equal(Array.isArray(normalized.workspace.widgets), true)
  assert.equal(normalized.workspace.widgets[0].component, 'ui.areaChart')
  assert.equal(Array.isArray(state.workspace.widgets), false)

  const snapshot = stateSnapshot(state)
  assert.equal(snapshot.type, 'STATE_SNAPSHOT')
  assert.equal(Array.isArray(snapshot.snapshot.workspace.widgets), true)
})

test('preserves invalid serialized widget values without throwing', () => {
  const state = { workspace: { widgets: 'not-json' } }
  assert.equal(normalizeState(state).workspace.widgets, 'not-json')
})
