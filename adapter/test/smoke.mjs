import { once } from 'node:events'
import { createServer } from '../src/server-entry.mjs'

const server = createServer().listen(0, '127.0.0.1')
await once(server, 'listening')
const { port } = server.address()
const response = await fetch(`http://127.0.0.1:${port}/agui/mock`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ threadId: 'thread-smoke', runId: 'run-smoke', messages: [] }),
})
const body = await response.text()
if (!response.ok || !body.includes('RUN_FINISHED')) throw new Error('Mock AG-UI smoke check failed')
server.close()
console.log('Smoke check passed')
