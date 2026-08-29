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

test('answers and rejects OpenCode2 questions through session-scoped endpoints', async () => {
  const calls = []
  const client = new OpenCodeClient({
    baseUrl: 'http://127.0.0.1:4096',
    workspaceDirectory: 'D:\\ProjectSpace\\dataagent',
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), init })
      return new Response(null, { status: 204 })
    },
  })

  await client.replyQuestion('ses_123', 'que_123', [['生产'], ['表', '自定义范围']])
  await client.rejectQuestion('ses_123', 'que_456')

  const reply = new URL(calls[0].url)
  const reject = new URL(calls[1].url)
  assert.equal(reply.pathname, '/api/session/ses_123/question/que_123/reply')
  assert.equal(reject.pathname, '/api/session/ses_123/question/que_456/reject')
  assert.deepEqual(JSON.parse(calls[0].init.body), { answers: [['生产'], ['表', '自定义范围']] })
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[1].init.method, 'POST')
})
