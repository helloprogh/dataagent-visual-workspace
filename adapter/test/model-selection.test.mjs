import assert from 'node:assert/strict'
import test from 'node:test'
import { modelSelectionFromCookie } from '../src/model-selection.mjs'
import { OpenCodeClient } from '../src/opencode-client.mjs'

test('reads provider and model from encoded runtime cookie', () => {
  const encoded = encodeURIComponent(JSON.stringify(['openai', 'gpt-5.6-sol']))
  assert.deepEqual(modelSelectionFromCookie(`locale=zh_CN; agui_model=${encoded}`), {
    providerID: 'openai',
    modelID: 'gpt-5.6-sol',
  })
})

test('ignores malformed or unsafe model cookies', () => {
  assert.equal(modelSelectionFromCookie('agui_model=not-json'), undefined)
  const unsafe = encodeURIComponent(JSON.stringify(['openai\ninvalid', 'model']))
  assert.equal(modelSelectionFromCookie(`agui_model=${unsafe}`), undefined)
})

test('prompt sends model as nested structured field', async () => {
  let request
  const client = new OpenCodeClient({
    baseUrl: 'http://opencode.test',
    fetchImpl: async (url, init) => {
      request = { url, init }
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    },
  })

  await client.prompt('session-1', 'hello', { aguiRunId: 'run-1' }, {
    providerID: 'openai',
    modelID: 'gpt-5.6-sol',
  })

  assert.equal(request.url, 'http://opencode.test/api/session/session-1/prompt')
  assert.deepEqual(JSON.parse(request.init.body), {
    text: 'hello',
    metadata: { aguiRunId: 'run-1' },
    model: { providerID: 'openai', modelID: 'gpt-5.6-sol' },
  })
})

test('model catalog falls back to legacy /api/model endpoint on 404', async () => {
  const paths = []
  const client = new OpenCodeClient({
    baseUrl: 'http://opencode.test',
    fetchImpl: async (url) => {
      const pathname = new URL(url).pathname
      paths.push(pathname)
      if (pathname === '/api/catalog/model') {
        return new Response(JSON.stringify({ error: 'not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ data: [{ providerID: 'openai', modelID: 'gpt-5.6-sol' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    },
  })

  assert.deepEqual(await client.listModels(), [{ providerID: 'openai', modelID: 'gpt-5.6-sol' }])
  assert.deepEqual(paths, ['/api/catalog/model', '/api/model'])
})
