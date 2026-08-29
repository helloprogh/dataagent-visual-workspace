import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCapabilityCatalog, normalizeCapabilityCatalog } from '../src/capability-catalog.mjs'

test('runtime capability catalog keeps tools and MCP status factual', () => {
  const items = normalizeCapabilityCatalog({
    toolIds: ['read', 'bash', 'workspace.render'],
    tools: [
      { id: 'read', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } } } },
      { id: 'bash', description: 'Run a shell command', parameters: { type: 'object', properties: { command: { type: 'string' } } } },
    ],
    mcp: {
      agui_frontend: { status: 'connected' },
      warehouse: { status: 'failed', error: 'connection refused' },
    },
  })

  assert.equal(items.find(item => item.id === 'read')?.status, 'registered')
  assert.deepEqual(items.find(item => item.id === 'read')?.capabilities, ['path'])
  assert.equal(items.find(item => item.id === 'mcp:agui_frontend')?.status, 'ready')
  assert.equal(items.find(item => item.id === 'mcp:warehouse')?.status, 'error')
  assert.match(items.find(item => item.id === 'mcp:warehouse')?.description ?? '', /connection refused/)
})

test('runtime capability catalog degrades partially instead of inventing capabilities', async () => {
  const client = {
    listToolIds: async () => ['read'],
    listTools: async () => { throw new Error('schema endpoint unavailable') },
    listMcp: async () => ({ filesystem: { status: 'connected' } }),
  }
  const catalog = await buildCapabilityCatalog(client, { providerID: 'openai', modelID: 'gpt-test' })

  assert.equal(catalog.summary.tools, 1)
  assert.equal(catalog.summary.connectedMcpServers, 1)
  assert.equal(catalog.warnings.length, 1)
  assert.equal(catalog.items.find(item => item.id === 'read')?.statusLabel, '已注册')
})
