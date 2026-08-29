import http from 'node:http'
import { buildCapabilityCatalog } from './capability-catalog.mjs'
import { createServer as createAgentServer } from './server.mjs'
import { OpenCodeClient } from './opencode-client.mjs'
import { createOpenCodeManagementHandler } from './opencode-management.mjs'

const port = Number(process.env.ADAPTER_PORT ?? 3001)
const WEB_PREFIX = '/dataagent/web'
const API_BASE = `${WEB_PREFIX}/api`

const isDirectUpstreamApi = (req, url) => {
  if (req.method === 'GET' && url.pathname === `${API_BASE}/skill`) return true
  if (req.method === 'POST' && url.pathname === `${API_BASE}/skill/upload`) return true
  if (req.method === 'DELETE' && new RegExp(`^${API_BASE}/skill/upload/delete/[^/]+$`).test(url.pathname)) return true
  if (req.method === 'POST' && url.pathname === `${API_BASE}/session`) return true
  if (req.method === 'GET' && url.pathname === `${API_BASE}/model`) return true
  if (req.method === 'GET' && url.pathname === `${API_BASE}/model/default`) return true
  if (req.method === 'POST' && new RegExp(`^${API_BASE}/session/[^/]+/model$`).test(url.pathname)) return true
  if (req.method === 'POST' && new RegExp(`^${API_BASE}/session/[^/]+/interrupt$`).test(url.pathname)) return true
  return false
}

const readJsonBody = async (req) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const normalizeSessionModel = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const providerID = typeof value.providerID === 'string' ? value.providerID.trim() : ''
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  return providerID && id ? { providerID, id } : undefined
}

const proxyDirectApi = async (client, req, res, url) => {
  if (req.method === 'POST' && url.pathname === `${API_BASE}/session`) {
    const input = await readJsonBody(req)
    const model = normalizeSessionModel(input?.model)
    const session = await client.json('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'AG-UI session',
        location: { directory: client.workspaceDirectory },
        ...(model ? { model } : {}),
      }),
    }, 'Unable to create OpenCode session')
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ data: session }))
    return
  }

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

  const upstreamPath = `${url.pathname.slice(WEB_PREFIX.length)}${url.search}`
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

const runtimeCapabilities = async (client, res, url) => {
  const catalog = await buildCapabilityCatalog(client, {
    providerID: url.searchParams.get('providerID') || undefined,
    modelID: url.searchParams.get('modelID') || undefined,
  })
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify({ data: catalog }))
}

export const createServer = () => {
  const agentServer = createAgentServer()
  const client = new OpenCodeClient({ baseUrl: process.env.OPENCODE_BASE_URL })
  const handleManagement = createOpenCodeManagementHandler(client)

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? '127.0.0.1'}`)

    try {
      if (req.method === 'GET' && url.pathname === `${API_BASE}/tools`) {
        await runtimeCapabilities(client, res, url)
        return
      }

      if (isDirectUpstreamApi(req, url)) {
        await proxyDirectApi(client, req, res, url)
        return
      }

      if (req.method === 'POST' && url.pathname === `${API_BASE}/agui`) {
        req.url = `/agent${url.search}`
        agentServer.emit('request', req, res)
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
