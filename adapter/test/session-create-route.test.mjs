import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from '../src/server-entry.mjs'

const listen = (server) => new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => resolve(server.address()))
})

const close = (server) => new Promise((resolve, reject) => {
  server.close(error => error ? reject(error) : resolve())
})

test('POST /dataagent/web/api/session forwards the selected model to OpenCode session creation', async () => {
  const calls = []
  const client = {
    workspaceDirectory: 'D:\\ProjectSpace\\dataagent',
    async json(pathname, init, action) {
      calls.push({ pathname, init, action })
      return { id: 'session-created' }
    },
  }
  const server = createServer({ client })
  const address = await listen(server)

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/dataagent/web/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: {
          providerID: 'test',
          id: 'test',
        },
      }),
    })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { data: { id: 'session-created' } })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].pathname, '/api/session')
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      title: 'AG-UI session',
      location: { directory: 'D:\\ProjectSpace\\dataagent' },
      model: {
        providerID: 'test',
        id: 'test',
      },
    })
  } finally {
    await close(server)
  }
})
