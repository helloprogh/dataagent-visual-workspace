import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { OpenCodeAguiConverter } from './converter.mjs'
import { OpenCodeClient } from './opencode-client.mjs'
import { interfaceCatalog, nativeEventMapping, supportedScenarios } from './capabilities.mjs'
import { createMockEvents, createScenarioEvents, streamMock } from './mock-scenario.mjs'
import { SessionRegistry } from './session-registry.mjs'
import { applyCors, openSse, writeSse } from './sse.mjs'

const port = Number(process.env.ADAPTER_PORT ?? 3001)
const runTimeoutMs = Number(process.env.ADAPTER_RUN_TIMEOUT_MS ?? 10 * 60 * 1000)
const client = new OpenCodeClient({ baseUrl: process.env.OPENCODE_BASE_URL })
const registry = new SessionRegistry()

const json = (res, status, body) => {
  applyCors(res)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

const readBody = async (req) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const latestUserText = (input) => {
  const message = [...(input.messages ?? [])].reverse().find((item) => item.role === 'user')
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  return (message.content ?? []).map((item) => item.text ?? item.content ?? '').join('')
}

const resolveSession = async (threadId) => {
  const mapped = await registry.get(threadId)
  if (mapped?.sessionId) {
    try {
      await client.getSession(mapped.sessionId)
      return mapped.sessionId
    } catch (error) {
      if (!error.message.includes('(404)')) throw error
      await registry.delete(threadId)
    }
  }
  const session = await client.createSession(`AG-UI · ${threadId.slice(0, 48)}`)
  const sessionId = session?.id ?? session?.sessionID ?? session?.sessionId
  if (!sessionId) throw new Error('OpenCode did not return a session id')
  await registry.set(threadId, sessionId)
  return sessionId
}

const runOpenCode = async (rawInput, res, { hybrid = false } = {}) => {
  const input = {
    ...rawInput,
    threadId: rawInput.threadId || `thread-${randomUUID()}`,
    runId: rawInput.runId || `run-${randomUUID()}`,
  }
  openSse(res)
  const abort = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    abort.abort()
  }, runTimeoutMs)
  reqClosed(res, () => abort.abort())
  try {
    const text = latestUserText(input).trim()
    if (!text) throw new Error('RunAgentInput does not contain a user message')
    const sessionId = await resolveSession(input.threadId)
    const converter = new OpenCodeAguiConverter({ threadId: input.threadId, runId: input.runId, sessionId })
    for (const item of converter.start()) writeSse(res, item)
    if (hybrid) for (const item of createScenarioEvents(input)) writeSse(res, item)

    const events = client.events(abort.signal)[Symbol.asyncIterator]()
    let nextEvent = events.next()
    await client.prompt(sessionId, text, {
      aguiThreadId: input.threadId,
      aguiRunId: input.runId,
      aguiAgentId: input.agentId,
    })
    while (true) {
      const current = await nextEvent
      if (current.done) break
      nextEvent = events.next()
      for (const item of converter.convert(current.value)) writeSse(res, item)
      if (converter.finished) {
        // The next event read was prefetched to avoid missing fast native events.
        // Consume its abort rejection before closing the upstream stream.
        nextEvent.catch(() => undefined)
        break
      }
    }
    if (!converter.finished) for (const item of converter.finish()) writeSse(res, item)
  } catch (error) {
    if (!res.destroyed && !res.writableEnded) {
      const message = timedOut ? `OpenCode run timed out after ${runTimeoutMs}ms` : error.message
      writeSse(res, { type: 'RUN_ERROR', message, code: timedOut ? 'ADAPTER_TIMEOUT' : 'ADAPTER_ERROR' })
    }
  } finally {
    clearTimeout(timeout)
    abort.abort()
    if (!res.writableEnded) res.end()
  }
}

const reqClosed = (res, callback) => res.on('close', callback)

const replay = async (body, res) => {
  const input = body.input ?? body
  openSse(res)
  const converter = new OpenCodeAguiConverter({
    threadId: input.threadId ?? 'thread-replay',
    runId: input.runId ?? 'run-replay',
    sessionId: body.sessionId,
  })
  for (const item of converter.start()) writeSse(res, item)
  for (const sourceEvent of body.events ?? []) {
    for (const item of converter.convert(sourceEvent)) writeSse(res, item)
  }
  if (!converter.finished) for (const item of converter.finish()) writeSse(res, item)
  res.end()
}

const proxyOpenCode = async (req, res, pathname) => {
  const targetPath = pathname.slice('/opencode'.length) || '/'
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(await collect(req))
  const headers = { ...req.headers }
  delete headers.host
  delete headers.authorization
  const response = await client.proxy(targetPath, { method: req.method, headers, body })
  applyCors(res)
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()))
  if (response.body) for await (const chunk of response.body) res.write(chunk)
  res.end()
}

const collect = async (stream) => {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

const debugSessions = async () => {
  const mappings = await registry.list()
  return Promise.all(mappings.map(async (mapping) => {
    try {
      const [session, inbox, permissions] = await Promise.all([
        client.getSession(mapping.sessionId),
        client.inbox(mapping.sessionId),
        client.permissions(mapping.sessionId),
      ])
      return {
        ...mapping,
        connected: true,
        title: session?.title,
        agent: session?.agent,
        model: session?.model,
        tokens: session?.tokens,
        cost: session?.cost,
        location: session?.location,
        queueSize: Array.isArray(inbox) ? inbox.length : 0,
        permissions: Array.isArray(permissions) ? permissions : [],
      }
    } catch (error) {
      return { ...mapping, connected: false, error: error.message }
    }
  }))
}

const sessionRoute = (pathname) => {
  const match = pathname.match(/^\/debug\/sessions\/([^/]+)(?:\/(context|background|interrupt)|\/permissions\/([^/]+)\/reply)?$/)
  return match ? { threadId: decodeURIComponent(match[1]), action: match[2] ?? (match[3] ? 'permission' : undefined), requestId: match[3] ? decodeURIComponent(match[3]) : undefined } : undefined
}

const handleDebugSession = async (req, res, route) => {
  const mapping = await registry.get(route.threadId)
  if (!mapping?.sessionId) return json(res, 404, { error: 'Thread is not mapped to an OpenCode session' })
  if (req.method === 'GET' && route.action === 'context') {
    const data = await client.context(mapping.sessionId)
    return json(res, 200, { threadId: route.threadId, sessionId: mapping.sessionId, data })
  }
  if (req.method === 'POST' && route.action === 'background') {
    await client.background(mapping.sessionId)
    return json(res, 200, { ok: true, threadId: route.threadId, sessionId: mapping.sessionId, status: 'backgrounded' })
  }
  if (req.method === 'POST' && route.action === 'interrupt') {
    await client.interrupt(mapping.sessionId)
    return json(res, 200, { ok: true, threadId: route.threadId, sessionId: mapping.sessionId, status: 'interrupted' })
  }
  if (req.method === 'POST' && route.action === 'permission') {
    const body = await readBody(req)
    if (!['once', 'always', 'reject'].includes(body.reply)) return json(res, 400, { error: 'reply must be once, always, or reject' })
    await client.replyPermission(mapping.sessionId, route.requestId, body.reply, body.message)
    return json(res, 200, { ok: true, threadId: route.threadId, sessionId: mapping.sessionId, requestId: route.requestId, reply: body.reply })
  }
  return json(res, 404, { error: 'Not found' })
}

export const createServer = () => http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? '127.0.0.1'}`)
  if (req.method === 'OPTIONS') {
    applyCors(res)
    res.writeHead(204)
    return res.end()
  }
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      const upstream = await client.diagnostics()
      return json(res, 200, { ok: true, service: 'opencode-agui-adapter', upstream })
    }
    if (req.method === 'GET' && url.pathname === '/debug/capabilities') {
      const upstream = await client.diagnostics()
      return json(res, 200, { service: 'opencode-agui-adapter', upstream, scenarios: supportedScenarios, interfaces: interfaceCatalog, eventMapping: nativeEventMapping })
    }
    if (req.method === 'GET' && url.pathname === '/debug/sessions') {
      return json(res, 200, { sessions: await debugSessions() })
    }
    const debugSession = sessionRoute(url.pathname)
    if (debugSession) return await handleDebugSession(req, res, debugSession)
    if (url.pathname.startsWith('/opencode/')) return await proxyOpenCode(req, res, url.pathname + url.search)
    if (req.method !== 'POST') return json(res, 404, { error: 'Not found' })

    const body = await readBody(req)
    if (url.pathname === '/agui/mock') {
      openSse(res)
      await streamMock(body, (item) => writeSse(res, item))
      return res.end()
    }
    if (url.pathname === '/agui/replay') return await replay(body, res)
    if (url.pathname === '/agui/hybrid') return await runOpenCode(body, res, { hybrid: true })
    if (url.pathname === '/agui' || url.pathname === '/agent') return await runOpenCode(body, res)
    return json(res, 404, { error: 'Not found' })
  } catch (error) {
    if (!res.headersSent) return json(res, 500, { error: error.message })
    if (!res.destroyed) writeSse(res, { type: 'RUN_ERROR', message: error.message, code: 'SERVER_ERROR' })
    res.end()
  }
})

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  createServer().listen(port, '127.0.0.1', async () => {
    const upstream = await client.diagnostics().catch((error) => ({ connected: false, error: error.message }))
    console.log(`AG-UI adapter listening on http://127.0.0.1:${port}`)
    console.log(`OpenCode upstream: ${upstream.connected ? `${upstream.url} (${upstream.version ?? 'unknown'})` : upstream.error}`)
  })
}
