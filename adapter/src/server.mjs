import http from 'node:http'
import { OpenCodeAguiConverter } from './converter.mjs'
import { OpenCodeClient } from './opencode-client.mjs'
import { createMockEvents, streamMock } from './mock-scenario.mjs'
import { applyCors, openSse, writeSse } from './sse.mjs'

const port = Number(process.env.ADAPTER_PORT ?? 3001)
const openCodeBaseUrl = process.env.OPENCODE_BASE_URL ?? 'http://127.0.0.1:4096'
const client = new OpenCodeClient(openCodeBaseUrl)
const threadSessions = new Map()

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

const runOpenCode = async (input, res, { hybrid = false } = {}) => {
  openSse(res)
  const abort = new AbortController()
  reqClosed(res, () => abort.abort())
  try {
    let sessionId = threadSessions.get(input.threadId)
    if (!sessionId) {
      const session = await client.createSession(`AG-UI · ${input.threadId}`)
      sessionId = session.id ?? session.sessionID ?? session.sessionId
      if (!sessionId) throw new Error('OpenCode did not return a session id')
      threadSessions.set(input.threadId, sessionId)
    }

    const converter = new OpenCodeAguiConverter({ threadId: input.threadId, runId: input.runId, sessionId })
    for (const item of converter.start()) writeSse(res, item)
    if (hybrid) {
      for (const item of createMockEvents(input).filter((event) => event.type === 'CUSTOM')) writeSse(res, item)
    }

    const events = client.events(abort.signal)[Symbol.asyncIterator]()
    let nextEvent = events.next()
    await client.promptAsync(sessionId, [{ type: 'text', text: latestUserText(input) }])
    while (true) {
      const current = await nextEvent
      if (current.done) break
      nextEvent = events.next()
      for (const item of converter.convert(current.value)) writeSse(res, item)
      if (converter.finished) break
    }

    if (!converter.finished) for (const item of converter.finish()) writeSse(res, item)
  } catch (error) {
    writeSse(res, { type: 'RUN_ERROR', message: error.message, code: 'ADAPTER_ERROR' })
  } finally {
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
  const response = await client.proxy(targetPath, {
    method: req.method,
    headers: { ...req.headers, host: undefined },
    body,
  })
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

export const createServer = () => http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? '127.0.0.1'}`)
  if (req.method === 'OPTIONS') {
    applyCors(res)
    res.writeHead(204)
    return res.end()
  }
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { ok: true, service: 'opencode-agui-adapter', openCodeBaseUrl })
    }
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
    writeSse(res, { type: 'RUN_ERROR', message: error.message, code: 'SERVER_ERROR' })
    res.end()
  }
})

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  createServer().listen(port, '127.0.0.1', () => {
    console.log(`AG-UI adapter listening on http://127.0.0.1:${port}`)
    console.log(`OpenCode upstream: ${openCodeBaseUrl}`)
  })
}
