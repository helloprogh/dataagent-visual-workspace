import assert from 'node:assert/strict'
import test from 'node:test'
import { legacyUiToA2ui } from '../../shared/legacy-a2ui.mjs'

const snapshot = cards => ({ version: 1, surfaceId: 'legacy', title: 'Report', summary: 'Summary', status: 'ready', cards })
test('legacy projection maps every card kind without mutating historical content', () => {
  const source = snapshot([
    { id: 'text', kind: 'text', text: 'plain' }, { id: 'md', kind: 'markdown', text: '**bold**' },
    { id: 'metrics', kind: 'metrics', items: [{ label: 'Zero', value: 0, detail: 'detail' }] },
    { id: 'table', kind: 'table', columns: [{ key: 'n', label: 'N' }], rows: [{ n: 0 }] },
    { id: 'file', kind: 'file', name: 'report.txt', url: '/dataagent/web/api/agui/workspace-file?path=report.txt', approvalInterruptId: 'approval' },
  ])
  const before = JSON.stringify(source)
  const projected = legacyUiToA2ui(source, 'message')
  assert.equal(JSON.stringify(source), before)
  const components = projected.operations[1].updateComponents.components
  for (const type of ['Text', 'Markdown', 'MetricCard', 'DataTable', 'ArtifactCard']) assert.ok(components.some(item => item.component === type))
  const artifact = components.find(item => item.component === 'ArtifactCard')
  assert.deepEqual(Object.keys(artifact).sort(), ['artifactId', 'component', 'id'])
  assert.equal(projected.artifacts[0].id, artifact.artifactId)
  assert.equal(projected.artifacts[0].approvalInterruptId, 'approval')
  assert.notEqual(legacyUiToA2ui(source, 'other').artifacts[0].id, artifact.artifactId)
  assert.equal(components.find(item => item.component === 'MetricCard').value, 0)
})
test('removed, invalid and unsafe legacy snapshots cannot expose stale files', () => {
  assert.equal(legacyUiToA2ui({}, 'm'), null)
  assert.equal(legacyUiToA2ui(snapshot([{ id: 'bad', kind: 'file', url: 'javascript:alert(1)' }]), 'm'), null)
  const removed = legacyUiToA2ui({ ...snapshot([]), status: 'removed' }, 'm')
  assert.deepEqual(removed.operations, [{ deleteSurface: { surfaceId: 'legacy' } }])
  assert.deepEqual(removed.artifacts, [])
})
test('largest legacy metric collection is not silently truncated', () => {
  const projected = legacyUiToA2ui(snapshot(Array.from({ length: 12 }, (_, index) => ({
    id: `metrics-${index}`, kind: 'metrics', items: Array.from({ length: 24 }, (_, item) => ({ label: `${item}`, value: item })),
  }))), 'm')
  assert.equal(projected.operations[1].updateComponents.components.filter(item => item.component === 'MetricCard').length, 288)
})
