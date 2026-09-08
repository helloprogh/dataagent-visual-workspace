import assert from 'node:assert/strict'
import test from 'node:test'
import { generatedArtifactsFromTool } from '../../shared/generated-artifacts.mjs'

test('only successful text writes expose their exact version content, including empty files', () => {
  const call = content => ({ id: 'write-version', function: { name: 'write', arguments: JSON.stringify({ path: 'report.md', content }) } })
  assert.deepEqual(generatedArtifactsFromTool(call('unconfirmed'), new Set()), [])
  const successful = new Set(['write-version'])
  assert.equal(generatedArtifactsFromTool(call('original\n'), successful)[0].snapshotText, 'original\n')
  assert.equal(generatedArtifactsFromTool(call(''), successful)[0].snapshotText, '')
  assert.equal('snapshotText' in generatedArtifactsFromTool(call(undefined), successful)[0], false)
})
