import assert from 'node:assert/strict'
import test from 'node:test'
import { OpenCodeClient } from '../src/opencode-client.mjs'

test('scopes session creation and MCP management to the configured workspace directory', async () => {
  const calls = []
  const client = new OpenCodeClient({
    baseUrl: 'http://127.0.0.1:4096',
    workspaceDirectory: 'D:\\ProjectSpace\\dataagent',
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), init })
      return new Response(JSON.stringify({ data: { id: 'ok' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    },
  })

  await client.createSession()
  await client.addMcp('agui_frontend', 'http://127.0.0.1:3001/mcp/frontend')
  await client.connectMcp('agui_frontend')
  await client.listMcp()

  assert.deepEqual(JSON.parse(calls[0].init.body), {
    title: 'AG-UI session',
    location: { directory: 'D:\\ProjectSpace\\dataagent' },
  })
  for (const call of calls.slice(1)) {
    const url = new URL(call.url)
    assert.equal(url.searchParams.get('location[directory]'), 'D:\\ProjectSpace\\dataagent')
  }
})
