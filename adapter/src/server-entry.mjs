import http from 'node:http'
import { createServer as createAgentServer } from './server.mjs'
import { OpenCodeClient } from './opencode-client.mjs'
import { createOpenCodeManagementHandler } from './opencode-management.mjs'
import { createOpenCodeSkillDeleteHandler } from './opencode-skill-delete.mjs'

const port = Number(process.env.ADAPTER_PORT ?? 3001)

export const createServer = () => {
  const agentServer = createAgentServer()
  const client = new OpenCodeClient({ baseUrl: process.env.OPENCODE_BASE_URL })
  const handleSkillDelete = createOpenCodeSkillDeleteHandler(client)
  const handleManagement = createOpenCodeManagementHandler(client)

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? '127.0.0.1'}`)
    if (url.pathname.startsWith('/api/opencode/') && req.method !== 'OPTIONS') {
      if (await handleSkillDelete(req, res, url)) return
      await handleManagement(req, res, url)
      return
    }
    agentServer.emit('request', req, res)
  })
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  const diagnostics = new OpenCodeClient({ baseUrl: process.env.OPENCODE_BASE_URL })
  createServer().listen(port, '127.0.0.1', async () => {
    const upstream = await diagnostics.diagnostics().catch((error) => ({ connected: false, error: error.message }))
    console.log(`AG-UI adapter listening on http://127.0.0.1:${port}`)
    console.log(`OpenCode upstream: ${upstream.connected ? `${upstream.url} (${upstream.version ?? 'unknown'})` : upstream.error}`)
  })
}
