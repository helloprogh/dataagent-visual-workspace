import assert from 'node:assert/strict'
import test from 'node:test'
import { ensureMcpConnected, isMcpConnected } from '../src/mcp-status.mjs'
import { normalizeCapabilityCatalog } from '../src/capability-catalog.mjs'

test('V2 MCP arrays and legacy maps expose actual connection status', () => {
  const current = [{ name: 'a', status: { status: 'failed', error: 'network' } }]
  assert.equal(isMcpConnected(current, 'a'), false)
  assert.equal(normalizeCapabilityCatalog({ mcp: current })[0].status, 'error')
  assert.equal(isMcpConnected({ a: { status: 'connected' } }, 'a'), true)
})

test('MCP registration only caches verified connections and repairs stale cache', async () => {
  const cache = new Map()
  let status = 'failed'
  let adds = 0
  const client = {
    listMcp: async () => [{ name: 'a', status: { status } }],
    disconnectMcp: async () => {}, connectMcp: async () => {},
    addMcp: async () => { adds++ },
  }
  await assert.rejects(ensureMcpConnected(client, cache, 'a', 'http://local'), /not connected/)
  assert.equal(cache.size, 0)
  status = 'connected'
  await ensureMcpConnected(client, cache, 'a', 'http://local')
  await ensureMcpConnected(client, cache, 'a', 'http://local')
  assert.equal(adds, 2)
  status = 'failed'
  await assert.rejects(ensureMcpConnected(client, cache, 'a', 'http://local'), /not connected/)
  assert.equal(adds, 3)
  assert.equal(cache.size, 0)
})
