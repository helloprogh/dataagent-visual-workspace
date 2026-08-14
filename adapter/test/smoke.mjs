import { once } from 'node:events'
import { createServer } from '../src/server.mjs'

const server = createServer().listen(0, '127.0.0.1')
await once(server, 'listening')
const { port } = server.address()
const health = await fetch(`http://127.0.0.1:${port}/health`).then((response) => response.json())
if (!health.ok) throw new Error('Health check failed')
server.close()
console.log('Smoke check passed')

