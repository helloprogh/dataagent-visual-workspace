// Real permission service + adapter hydration. No protected operation is executed.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { OpenCodeClient } from '../adapter/src/opencode-client.mjs'
import { createServer } from '../adapter/src/server-entry.mjs'
import { SessionRegistry } from '../adapter/src/session-registry.mjs'

assert.ok(process.env.OPENCODE_BASE_URL, 'Set real service URL and credentials')
const client = new OpenCodeClient()
const session = await client.createSession(`UI permission hydration ${new Date().toISOString()}`)
let permissionId
const server = createServer({ client }).listen(0, '127.0.0.1')
await once(server, 'listening')
try {
  const request = await client.json(`/api/session/${session.id}/permission`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'external_directory', resources: ['D:/ui-permission-probe-nonexistent'], agent: 'explore' }),
  }, 'Unable to create permission probe')
  permissionId = request.id
  assert.equal(request.effect, 'ask', 'Service must actually require approval')
  assert.ok((await client.listPermissions(session.id)).some(item => item.id === permissionId))
  const response = await fetch(`http://127.0.0.1:${server.address().port}/dataagent/web/api/agui?mode=hydrate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId: session.id, runId: crypto.randomUUID(), state: {}, forwardedProps: { dataagent: { mode: 'hydrate' } } }),
  })
  assert.ok(response.ok)
  const events = (await response.text()).split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)))
  const pending = events.find(item => item.type === 'RUN_FINISHED').outcome.interrupts
  assert.equal(pending.length, 1)
  assert.equal(pending[0].id, permissionId)
  assert.equal(pending[0].metadata.action, 'external_directory')
  assert.deepEqual(pending[0].responseSchema.properties.decision.enum, ['once', 'always', 'reject'])
  console.log(JSON.stringify({ check: 'real upstream permission recovered without stream receipt', result: 'passed', sessionId: session.id }))
} finally {
  if (permissionId) {
    await client.replyPermission(session.id, permissionId, 'reject')
    assert.deepEqual(await client.listPermissions(session.id), [])
    await new SessionRegistry().setPendingInterrupts(session.id, [])
  }
  await new Promise(resolve => server.close(resolve))
}
