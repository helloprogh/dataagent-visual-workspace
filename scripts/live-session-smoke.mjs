// Opt-in integration check against a real OpenCode service; never mocked.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from '../adapter/src/server-entry.mjs'
import { OpenCodeClient } from '../adapter/src/opencode-client.mjs'

if (!process.env.OPENCODE_BASE_URL) throw new Error('Set OPENCODE_BASE_URL and service credentials before running live checks')
const client = new OpenCodeClient()
const health = await client.health()
assert.equal(health.healthy, true)
const server = createServer({ client }).listen(0, '127.0.0.1')
await once(server, 'listening')
const base = `http://127.0.0.1:${server.address().port}/dataagent/web/api`
const checks = []
let sessionId
async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(20000) })
  assert.ok(response.ok, `${path}: HTTP ${response.status}`)
  return response
}
const post = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
try {
  const modelBody = await (await request('/model/default')).json()
  const model = modelBody.data ?? modelBody
  assert.ok(model.providerID && model.id, 'default model must have providerID and id')
  checks.push('default model')
  const title = `UI live check ${new Date().toISOString()}`
  const created = await (await request('/session', post({ title, model: { providerID: model.providerID, id: model.id } }))).json()
  sessionId = created.data.id
  assert.ok(sessionId)
  checks.push('session creation')
  const renamed = `${title} renamed`
  const rename = await request(`/session/${sessionId}/rename`, post({ title: renamed }))
  assert.equal(rename.status, 204)
  const persisted = await client.getSession(sessionId)
  assert.equal(persisted.title, renamed)
  checks.push('rename persisted upstream')
  const messages = await (await request(`/session/${sessionId}/message?limit=100&order=desc`)).json()
  assert.ok(Array.isArray(messages.data) && messages.cursor)
  checks.push('history contract')
  const form = new FormData()
  form.append('threadId', sessionId)
  form.append('file', new Blob(['UI live upload fixture'], { type: 'text/plain' }), 'ui-live-check.txt')
  const upload = await (await request('/agui/file/upload', { method: 'POST', body: form })).json()
  const file = upload.data ?? upload.file ?? upload
  assert.ok(file.fileId && file.url)
  const preview = await (await request(file.url.replace('/dataagent/web/api', ''))).text()
  assert.equal(preview, 'UI live upload fixture')
  checks.push('upload and download')
  const hydration = await (await request('/agui?mode=hydrate', post({
    threadId: sessionId, runId: `live-${Date.now()}`, messages: [], tools: [], context: [], state: {},
    forwardedProps: { dataagent: { mode: 'hydrate' } },
  }))).text()
  assert.ok(hydration.includes('RUN_FINISHED') && !hydration.includes('RUN_ERROR'))
  checks.push('real session hydration')
  console.log(JSON.stringify({ result: 'passed', serviceVersion: health.version, sessionId, checks,
    note: 'Creates a dedicated test session and upload; does not run a model or delete data.' }, null, 2))
} catch (error) {
  console.error(JSON.stringify({ result: 'failed', sessionId, checks, error: error.message }))
  process.exitCode = 1
} finally {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
