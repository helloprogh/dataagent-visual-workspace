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

test('AG-UI hydration recovers an OpenCode form missed before adapter restart', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dataagent-hydrate-form-'))
  const stateFile = path.join(directory, 'sessions.json')
  const registry = new SessionRegistry(stateFile)
  await registry.set('session-form', 'session-form')
  const client = {
    listForms: async sessionId => [{
      id: 'frm_restore',
      sessionID: sessionId,
      title: '文件审批',
      metadata: { kind: 'question', tool: { id: 'question-restore' } },
      fields: [{ key: 'q0', type: 'string', title: '审批决定', options: [{ value: '通过', label: '通过' }] }],
    }],
  }

  await withServer(stateFile, async baseUrl => {
    const response = await fetch(`${baseUrl}/dataagent/web/api/agui?mode=hydrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: 'session-form',
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
    assert.equal((await new SessionRegistry(stateFile).pendingInterrupts('session-form'))[0].metadata.kind, 'form')
  }, client)
})
