import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { SessionRegistry } from '../src/session-registry.mjs'

const parseEvents = (text) => text
  .split('\n\n')
  .map(block => block.split('\n').find(line => line.startsWith('data: ')))
  .filter(Boolean)
  .map(line => JSON.parse(line.slice(6)))

test('hydration clears externally resolved cached forms in both response and registry', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dataagent-hydrate-resolved-'))
  const stateFile = path.join(directory, 'sessions.json')
  const registry = new SessionRegistry(stateFile)
  await registry.set('resolved-thread', 'native-session')
  await registry.setPendingInterrupts('resolved-thread', [{ id: 'old-form', metadata: { kind: 'form' } }])
  await withServer(stateFile, async baseUrl => {
    const response = await fetch(`${baseUrl}/dataagent/web/api/agui?mode=hydrate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: 'resolved-thread', runId: 'hydrate', state: {}, forwardedProps: { dataagent: { mode: 'hydrate' } } }),
    })
    assert.equal(parseEvents(await response.text()).at(-1).outcome.type, 'success')
    assert.deepEqual(await new SessionRegistry(stateFile).pendingInterrupts('resolved-thread'), [])
  }, { listForms: async () => [] })
})

test('hydration does not overwrite newer stream correlation during upstream reads', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dataagent-hydrate-race-'))
  const stateFile = path.join(directory, 'sessions.json')
  const registry = new SessionRegistry(stateFile)
  await registry.set('racing-thread', 'native-session')
  await registry.setPendingInterrupts('racing-thread', [{ id: 'old', metadata: { kind: 'form' } }])
  const latest = [{ id: 'new', metadata: { kind: 'form' } }]
  await withServer(stateFile, async baseUrl => {
    const response = await fetch(`${baseUrl}/dataagent/web/api/agui?mode=hydrate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: 'racing-thread', runId: 'hydrate', state: {}, forwardedProps: { dataagent: { mode: 'hydrate' } } }),
    })
    assert.deepEqual(parseEvents(await response.text()).at(-1).outcome.interrupts, latest)
    assert.deepEqual(await new SessionRegistry(stateFile).pendingInterrupts('racing-thread'), latest)
  }, { listForms: async () => { await registry.setPendingInterrupts('racing-thread', latest); return [] } })
})

async function withServer(stateFile, callback, client = { listForms: async () => [] }) {
  process.env.ADAPTER_STATE_FILE = stateFile
  const { createServer } = await import(`../src/server-entry.mjs?hydrate-test=${Date.now()}-${Math.random()}`)
  const server = createServer({ client })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    await callback(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

test('hydration cannot resurrect an approval resolved while its upstream snapshot was loading', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dataagent-hydrate-receipt-'))
  const stateFile = path.join(directory, 'sessions.json')
  const registry = new SessionRegistry(stateFile)
  await registry.set('receipt-thread', 'native-session')
  const receipt = { signature: 'resolved-during-read' }
  await withServer(stateFile, async baseUrl => {
    const response = await fetch(`${baseUrl}/dataagent/web/api/agui?mode=hydrate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: 'receipt-thread', runId: 'hydrate', state: {}, forwardedProps: { dataagent: { mode: 'hydrate' } } }),
    })
    assert.equal(parseEvents(await response.text()).at(-1).outcome.type, 'success')
    assert.deepEqual(await new SessionRegistry(stateFile).lastResume('receipt-thread'), receipt)
  }, { listForms: async () => {
    await registry.resolveInterrupts('receipt-thread', receipt)
    return [{ id: 'resolved-form', fields: [{ key: 'decision', type: 'string' }] }]
  } })
})

test('AG-UI hydration restores persisted pending interrupts without prompting OpenCode', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dataagent-hydrate-'))
  const stateFile = path.join(directory, 'sessions.json')
  const registry = new SessionRegistry(stateFile)
  await registry.set('session-hydrate', 'session-hydrate')
  await registry.setPendingInterrupts('session-hydrate', [{
    id: 'permission-1',
    reason: 'tool_call',
    toolCallId: 'tool-1',
    message: '需要确认',
    responseSchema: {
      type: 'object',
      properties: {
        decision: { type: 'string', enum: ['once', 'always', 'reject'] },
      },
      required: ['decision'],
    },
  }])

  await withServer(stateFile, async baseUrl => {
    const response = await fetch(`${baseUrl}/dataagent/web/api/agui?mode=hydrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: 'session-hydrate',
        runId: 'run-hydrate',
        messages: [],
        state: {},
        tools: [],
        context: [],
        forwardedProps: { dataagent: { mode: 'hydrate' } },
      }),
    })

    assert.equal(response.status, 200)
    const events = parseEvents(await response.text())
    assert.deepEqual(events.map(item => item.type), ['RUN_STARTED', 'STATE_SNAPSHOT', 'RUN_FINISHED'])
    assert.equal(events[2].outcome.type, 'interrupt')
    assert.equal(events[2].outcome.interrupts[0].id, 'permission-1')
    assert.equal(events[2].outcome.interrupts[0].toolCallId, 'tool-1')
  })
})

test('AG-UI hydration finishes successfully when no interrupt is pending', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dataagent-hydrate-empty-'))
  const stateFile = path.join(directory, 'sessions.json')
  const registry = new SessionRegistry(stateFile)
  await registry.set('session-clean', 'session-clean')

  await withServer(stateFile, async baseUrl => {
    const response = await fetch(`${baseUrl}/dataagent/web/api/agui?mode=hydrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: 'session-clean',
        runId: 'run-clean',
        messages: [],
        state: {},
        tools: [],
        context: [],
        forwardedProps: { dataagent: { mode: 'hydrate' } },
      }),
    })

    const events = parseEvents(await response.text())
    assert.equal(events.at(-1).type, 'RUN_FINISHED')
    assert.equal(events.at(-1).outcome.type, 'success')
  })
})

test('AG-UI hydration recovers forms and permissions missed before adapter restart', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dataagent-hydrate-form-'))
  const stateFile = path.join(directory, 'sessions.json')
  const registry = new SessionRegistry(stateFile)
  await registry.set('thread-form', 'opencode-session-form')
  let listedSessionId = ''
  const client = {
    listPermissions: async () => [{ id: 'per_restore', action: 'read', resources: ['fixture'], source: { type: 'tool', id: 'tool-permission' } }],
    listForms: async sessionId => {
      listedSessionId = sessionId
      return [{
        id: 'frm_restore',
        sessionID: sessionId,
        title: '文件审批',
        metadata: { kind: 'question', tool: { id: 'question-restore' } },
        fields: [{ key: 'q0', type: 'string', title: '审批决定', options: [{ value: '通过', label: '通过' }] }],
      }]
    },
  }

  await withServer(stateFile, async baseUrl => {
    const response = await fetch(`${baseUrl}/dataagent/web/api/agui?mode=hydrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: 'thread-form',
        runId: 'run-form-hydrate',
        messages: [],
        state: {},
        tools: [],
        context: [],
        forwardedProps: { dataagent: { mode: 'hydrate' } },
      }),
    })
    const events = parseEvents(await response.text())
    assert.equal(events.at(-1).outcome.type, 'interrupt')
    assert.equal(events.at(-1).outcome.interrupts[0].id, 'frm_restore')
    assert.equal(events.at(-1).outcome.interrupts.length, 2)
    assert.equal(events.at(-1).outcome.interrupts[1].id, 'per_restore')
    assert.equal(events.at(-1).outcome.interrupts[1].toolCallId, 'tool-permission')
    assert.equal(listedSessionId, 'opencode-session-form')
    assert.equal((await new SessionRegistry(stateFile).pendingInterrupts('thread-form'))[0].metadata.kind, 'form')
  }, client)
})
