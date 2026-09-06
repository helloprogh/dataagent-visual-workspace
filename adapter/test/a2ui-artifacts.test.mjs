import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeA2uiArtifacts } from '../../shared/a2ui-artifacts.mjs'
import { normalizeRenderA2uiArgs } from '../../shared/a2ui.mjs'
import { A2uiStream } from '../src/a2ui.mjs'

const file = { id: 'report', name: 'report.txt', mimeType: 'text/plain', url: '/dataagent/web/api/agui/workspace-file?path=report.txt' }
const input = { surfaceId: 'report', components: [{ id: 'root', component: 'ArtifactCard', artifactId: 'report' }], artifacts: [file] }
test('artifact contract rejects unsafe URLs, duplicates, missing references and ignores claimed approvals', () => {
  assert.ok(normalizeRenderA2uiArgs(input))
  assert.equal(normalizeRenderA2uiArgs({ ...input, artifacts: [] }), null)
  assert.equal(normalizeA2uiArtifacts([file, file]), null)
  for (const url of ['https://example.com/a.txt', 'javascript:alert(1)', '/dataagent/web/api/agui/workspace-file?path=../secret']) {
    assert.equal(normalizeA2uiArtifacts([{ ...file, url }]), null)
  }
  const [clean] = normalizeA2uiArtifacts([{ ...file, approvalInterruptId: 'forged', approvalResolved: true }])
  assert.equal(clean.approvalInterruptId, undefined)
  assert.equal(clean.approvalResolved, undefined)
})
test('native artifacts survive restore, update metadata and disappear on delete', () => {
  const first = new A2uiStream('thread', 'run').publish(input, 'parent')[0]
  assert.deepEqual(first.content.artifacts, normalizeA2uiArtifacts([file]))
  const restored = new A2uiStream('thread', 'next', [first])
  assert.deepEqual(restored.publish(input, 'new-parent'), [])
  const updated = restored.publish({ ...input, artifacts: [{ ...file, name: 'renamed.txt' }] }, 'new-parent')[0]
  assert.equal(updated.parentMessageId, 'parent')
  assert.equal(updated.content.artifacts[0].name, 'renamed.txt')
  const accepted = new A2uiStream('thread', 'next').accept(updated, 'session')[0]
  assert.deepEqual(accepted.content, updated.content)
  const removed = restored.publish({ surfaceId: 'report', components: [] }, 'parent')[0]
  assert.equal(removed.content.artifacts, undefined)
  assert.ok(removed.content.a2ui_operations[0].deleteSurface)
})
