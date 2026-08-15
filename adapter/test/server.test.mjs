import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { createServer } from '../src/server.mjs'

test('mock endpoint streams a complete AG-UI run', async (t) => {
  const server = createServer().listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => server.close())
  const { port } = server.address()
  const response = await fetch(`http://127.0.0.1:${port}/agui/mock`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId: 'thread-test', runId: 'run-test', messages: [] }),
  })
  assert.equal(response.status, 200)
  const body = await response.text()
  assert.match(body, /"type":"RUN_STARTED"/)
  assert.match(body, /"type":"TOOL_CALL_START".*"toolCallName":"workspace.render"/)
  assert.match(body, /"type":"REASONING_MESSAGE_CONTENT"/)
  assert.match(body, /"type":"RUN_FINISHED"/)
})

test('removed diagnostic and passthrough endpoints return not found', async (t) => {
  const server = createServer().listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => server.close())
  const { port } = server.address()

  for (const pathname of [
    '/health',
    '/debug/capabilities',
    '/debug/sessions',
    '/debug/sessions/thread-1/context',
    '/opencode/session',
  ]) {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`)
    assert.equal(response.status, 404)
  }

  for (const pathname of ['/agui', '/agui/hybrid']) {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    assert.equal(response.status, 404)
  }
})
