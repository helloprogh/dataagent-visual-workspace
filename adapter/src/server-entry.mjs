import http from 'node:http'
import { createServer as createAgentServer } from './server.mjs'
import { OpenCodeClient } from './opencode-client.mjs'
import { createOpenCodeManagementHandler } from './opencode-management.mjs'

const port = Number(process.env.ADAPTER_PORT ?? 3001)

const isDirectSkillApi = (req, url) => {
  if (req.method === 'GET' && url.pathname === '/api/skill') return true
  if (req.method === 'POST' && url.pathname === '/api/skill/upload') return true
  if (req.method === 'DELETE' && /^\/api\/skill\/upload\/delete\/[^/]+$/.test(url.pathname)) return true
  return false
}

const isDirectDataAgentWebApi = (req, url) => {
  if (req.method === 'POST' && url.pathname === '/dataagent/web/api/session') return true
  if (req.method === 'GET' && url.pathname === '/dataagent/web/api/model') return true
  if (req.method === 'GET' && url.pathname === '/dataagent/web/api/model/default') return true
  if (req.method === 'POST' && /^\/dataagent\/web\/api\/session\/[^/]+\/model$/.test(url.pathname)) return true
  return false
}

const isDirectDataAgentApi = (req, url) => req.method === 'POST'
  && /^\/dataagent\/api\/session\/[^/]+\/interrupt$/.test(url.pathname)

const proxyDirectApi = async (client, req, res, url, prefix) => {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (key === 'host' || value == null) continue
    if (Array.isArray(value)) value.forEach(item => headers.append(key, item))
    else headers.set(key, value)
  }

  const init = {
    method: req.method,
    headers,
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    init.body = req
    init.duplex = 'half'
  }

  const upstreamPath = `${url.pathname.slice(prefix.length)}${url.search}`
  const upstream = await client.request(upstreamPath, init)
  const responseHeaders = {}
  const contentType = upstream.headers.get('content-type')
  if (contentType) responseHeaders['Content-Type'] = contentType
  const cacheControl = upstream.headers.get('cache-control')
  if (cacheControl) responseHeaders['Cache-Control'] = cacheControl

  res.writeHead(upstream.status, responseHeaders)
  if (!upstream.body) return res.end()
  for await (const chunk of upstream.body) res.write(Buffer.from(chunk))
  res.end()
}

export const createServer = () => {
  const agentServer = createAgentServer()
  const client = new OpenCodeClient({ baseUrl: process.env.OPENCODE_BASE_URL })
  const handleManagement = createOpenCodeManagementHandler(client)

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? '127.0.0.1'}`)

    try {
      if (isDirectSkillApi(req, url)) {
        await proxyDirectApi(client, req, res, url, '')
        return
      }

      if (isDirectDataAgentWebApi(req, url)) {
        await proxyDirectApi(client, req, res, url, '/dataagent/web')
        return
      }

      if (isDirectDataAgentApi(req, url)) {
        await proxyDirectApi(client, req, res, url, '/dataagent')
        return
      }

      if (req.method !== 'OPTIONS' && await handleManagement(req, res, url)) return

      agentServer.emit('request', req, res)
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: error?.message ?? String(error) }))
      } else if (!res.writableEnded) {
        res.end()
      }
    }
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
