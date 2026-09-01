import http from 'node:http'
import { buildCapabilityCatalog } from './capability-catalog.mjs'
import { runFinished, runStarted, stateSnapshot } from './agui.mjs'
import { createServer as createAgentServer } from './server.mjs'
import { FileStorage } from './file-storage.mjs'
import { OpenCodeClient } from './opencode-client.mjs'
import { createOpenCodeManagementHandler } from './opencode-management.mjs'
import { SessionRegistry } from './session-registry.mjs'
import { openSse, writeSse } from './sse.mjs'

const port = Number(process.env.ADAPTER_PORT ?? 3001)
const WEB_PREFIX = '/dataagent/web'
const API_BASE = `${WEB_PREFIX}/api`

const isDirectUpstreamApi = (req, url) => {
  if (req.method === 'GET' && url.pathname === `${API_BASE}/skill`) return true
  if (req.method === 'POST' && url.pathname === `${API_BASE}/skill/upload`) return true
  if (req.method === 'DELETE' && new RegExp(`^${API_BASE}/skill/upload/delete/[^/]+$`).test(url.pathname)) return true
  if (req.method === 'GET' && url.pathname === `${API_BASE}/session`) return true
  if (req.method === 'POST' && url.pathname === `${API_BASE}/session`) return true
  if (req.method === 'GET' && url.pathname === `${API_BASE}/model`) return true
  if (req.method === 'GET' && url.pathname === `${API_BASE}/model/default`) return true
  if (req.method === 'POST' && new RegExp(`^${API_BASE}/session/[^/]+/model$`).test(url.pathname)) return true
  if (req.method === 'POST' && new RegExp(`^${API_BASE}/session/[^/]+/interrupt$`).test(url.pathname)) return true
  if (req.method === 'GET' && new RegExp(`^${API_BASE}/session/[^/]+/message$`).test(url.pathname)) return true
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

const historyFile = (file) => ({
  uri: file.source,
  mime: file.mimeType || 'application/octet-stream',
  name: file.filename,
  size: file.size,
  fileId: file.fileId,
  ...(file.approvalInterruptId ? { approval: { interruptId: file.approvalInterruptId } } : {}),
})

const parseRuntimeUserMessage = (text) => {
  if (typeof text !== 'string' || !text.startsWith('<ag-ui-runtime>')) return null
  const closing = text.indexOf('</ag-ui-runtime>')
  if (closing === -1) return null
  const runtime = text.slice(0, closing)
  const jsonStart = runtime.indexOf('{')
  let attachments = []
  if (jsonStart !== -1) {
    try {
      const context = JSON.parse(runtime.slice(jsonStart).trim())
      attachments = Array.isArray(context.attachments) ? context.attachments : []
    } catch {
      // The original user text is still recoverable when legacy context JSON is invalid.
    }
  }
  return {
    text: text.slice(closing + '</ag-ui-runtime>'.length).trimStart(),
    files: attachments,
  }
}

const restoreUserMessageFiles = async (sessionId, items) => {
  const overlays = await new SessionRegistry().userMessages(sessionId)
  return items.map((item) => {
    if (!item || item.type !== 'user') return item
    const runId = item.metadata?.aguiRunId
    const overlay = (runId ? overlays[runId] : undefined) ?? parseRuntimeUserMessage(item.text)
    if (!overlay) return item
    return {
      ...item,
      text: typeof overlay.text === 'string' ? overlay.text : item.text,
      files: Array.isArray(overlay.files)
        ? overlay.files.filter(file => typeof file?.source === 'string' && file.source).map(historyFile)
        : [],
    }
  })
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

  const isConversationList = req.method === 'GET' && url.pathname === `${API_BASE}/session`
  const isConversationMessages = req.method === 'GET'
    && new RegExp(`^${API_BASE}/session/[^/]+/message$`).test(url.pathname)
  if (isConversationList || isConversationMessages) {
    const upstreamPath = url.pathname.slice(WEB_PREFIX.length)
    const upstreamQuery = new URLSearchParams(url.searchParams)
    if (isConversationList && !upstreamQuery.has('directory')) {
      upstreamQuery.set('directory', client.workspaceDirectory)
    }
    const payload = await client.json(
      `${upstreamPath}${upstreamQuery.size ? `?${upstreamQuery}` : ''}`,
      { headers: { Accept: 'application/json' } },
      isConversationList ? 'Unable to list OpenCode sessions' : 'Unable to read OpenCode messages',
    )
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    // OpenCode service builds prior to cursor pagination return a bare array.
    // Keep the browser-facing contract stable while preserving a native cursor
    // object whenever the upstream already provides one.
    const page = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload
      : { data: Array.isArray(payload) ? payload : [], cursor: {} }
    const data = Array.isArray(page.data) ? page.data : []
    const restored = isConversationMessages
      ? await restoreUserMessageFiles(decodeURIComponent(url.pathname.split('/').at(-2)), data)
      : data
    res.end(JSON.stringify({
      data: restored,
      cursor: page.cursor && typeof page.cursor === 'object' ? page.cursor : {},
    }))
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

const hydrateAgent = async (req, res) => {
  const input = await readJsonBody(req)
  const mode = input?.forwardedProps?.dataagent?.mode
  if (mode !== 'hydrate') throw new Error('Invalid AG-UI hydration request')

  const threadId = typeof input.threadId === 'string' ? input.threadId.trim() : ''
  const runId = typeof input.runId === 'string' ? input.runId.trim() : ''
  if (!threadId || !runId) throw new Error('AG-UI hydration requires threadId and runId')

  // The reference adapter stores pending interrupt correlation on disk. Load a
  // fresh registry for hydration so this gateway observes the latest commit
  // written by the streaming adapter before RUN_FINISHED(interrupt) was sent.
  const registry = new SessionRegistry()
  const pending = await registry.pendingInterrupts(threadId)

  openSse(res)
  writeSse(res, runStarted(threadId, runId))
  writeSse(res, stateSnapshot(input.state ?? {}))
  writeSse(res, runFinished(threadId, runId, pending.length
    ? { type: 'interrupt', interrupts: pending }
    : { type: 'success' }))
  res.end()
}

export const createServer = ({
  client = new OpenCodeClient({ baseUrl: process.env.OPENCODE_BASE_URL }),
  fileStorage = new FileStorage(),
} = {}) => {
  const agentServer = createAgentServer()
  const handleManagement = createOpenCodeManagementHandler(client)

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? '127.0.0.1'}`)

    try {
      if (req.method === 'POST' && url.pathname === `${API_BASE}/agui/file/upload`) {
        const file = await fileStorage.upload(req, url.origin)
        const publicUrl = `${API_BASE}/agui/file/${file.id}`
        res.writeHead(201, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        res.end(JSON.stringify({
          data: {
            fileId: file.storedPath,
            url: publicUrl,
            filename: file.filename,
            mimeType: file.mimeType,
            size: file.size,
          },
        }))
        return
      }

      const previewMatch = url.pathname.match(new RegExp(`^${API_BASE}/agui/file/([0-9a-f-]{36})$`, 'i'))
      if ((req.method === 'GET' || req.method === 'HEAD') && previewMatch) {
        const file = await fileStorage.read(previewMatch[1])
        if (!file) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: 'File not found' }))
          return
        }
        res.writeHead(200, {
          'Content-Type': file.mimeType,
          'Content-Length': file.size,
          'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        })
        if (req.method === 'HEAD') res.end()
        else res.end(file.bytes)
        return
      }

      if (req.method === 'GET' && url.pathname === `${API_BASE}/tools`) {
        await runtimeCapabilities(client, res, url)
        return
      }

      if (isDirectUpstreamApi(req, url)) {
        await proxyDirectApi(client, req, res, url)
        return
      }

      if (req.method === 'POST' && url.pathname === `${API_BASE}/agui`) {
        if (url.searchParams.get('mode') === 'hydrate') {
          await hydrateAgent(req, res)
          return
        }
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
