import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { normalizeState, stateSnapshot } from './agui.mjs'
import { OpenCodeAguiConverter } from './converter.mjs'
import { FrontendToolBridge } from './frontend-tool-bridge.mjs'
import { createFrontendMcpHandler } from './mcp-frontend-server.mjs'
import { languageFromCookie, languageInstruction } from './language.mjs'
import { OpenCodeClient } from './opencode-client.mjs'
import { streamMock } from './mock-scenario.mjs'
import { SessionRegistry } from './session-registry.mjs'
import { applyCors, openSse, writeSse } from './sse.mjs'

const port = Number(process.env.ADAPTER_PORT ?? 3001)
const runTimeoutMs = Number(process.env.ADAPTER_RUN_TIMEOUT_MS ?? 10 * 60 * 1000)
const client = new OpenCodeClient({ baseUrl: process.env.OPENCODE_BASE_URL })
const registry = new SessionRegistry()
const frontendTools = new FrontendToolBridge({ timeoutMs: runTimeoutMs })
const handleFrontendMcp = createFrontendMcpHandler(frontendTools)
const mcpRegistrations = new Map()

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

const latestUserInput = (input) => {
  const message = [...(input.messages ?? [])].reverse().find((item) => item.role === 'user')
  if (!message) return { text: '', attachments: [] }
  if (typeof message.content === 'string') return { text: message.content, attachments: [] }

  const text = []
  const attachments = []
  for (const item of message.content ?? []) {
    if (!item || typeof item !== 'object') continue
    if (item.type === 'text') {
      const value = item.text ?? item.content
      if (typeof value === 'string') text.push(value)
      continue
    }

    const metadata = item.metadata ?? {}
    const source = item.source ?? {}
    const fileId = metadata.fileId ?? metadata.file_id ?? metadata.id
    const filename = metadata.filename ?? metadata.name
    const sourceValue = source.value ?? source.url
    const mimeType = source.mimeType ?? source.mime_type ?? metadata.mimeType ?? metadata.mime_type
    const isAttachment = ['image', 'audio', 'video', 'document', 'file'].includes(item.type)
      || fileId != null
      || sourceValue != null
    if (!isAttachment) {
      const value = item.text ?? item.content
      if (typeof value === 'string') text.push(value)
      continue
    }

    attachments.push({
      type: item.type ?? 'document',
      ...(fileId != null ? { fileId: String(fileId) } : {}),
      ...(filename ? { filename: String(filename) } : {}),
      ...(sourceValue != null ? { source: String(sourceValue) } : {}),
      ...(mimeType ? { mimeType: String(mimeType) } : {}),
    })
  }
  return { text: text.join(''), attachments }
}

const nativeProps = (event) => event?.properties ?? event?.data ?? event ?? {}
const toolMessages = (input) => (input.messages ?? []).filter((message) => message?.role === 'tool' && message.toolCallId)
const frontendToolCall = (threadId, source, knownCalls) => {
  if (!['session.tool.input.ended', 'session.tool.called'].includes(source?.type)) return undefined
  const raw = nativeProps(source)
  const toolCallId = raw.id ?? raw.callID ?? raw.callId ?? raw.partID
  const known = knownCalls.get(String(toolCallId))
  const nativeName = raw.name ?? raw.tool ?? known?.nativeName
  const toolName = known?.toolName ?? frontendTools.resolveName(threadId, nativeName)
  if (!toolName) return undefined
  return {
    toolCallId,
    nativeName,
    toolName,
    args: raw.input ?? raw.arguments ?? raw.text,
  }
}

const nativeToolId = (source) => {
  if (!source?.type?.startsWith('session.tool.')) return undefined
  const raw = nativeProps(source)
  return raw.id ?? raw.callID ?? raw.callId ?? raw.partID
}

const promptWithContext = (input, text, attachments = [], language) => {
  const state = input.state && Object.keys(input.state).length ? input.state : undefined
  const context = input.context?.length ? input.context : undefined
  const modelLanguage = languageInstruction(language)
  if (!state && !context && !input.tools?.length && !attachments.length && !modelLanguage) return text
  const protocolContext = JSON.stringify({
    state,
    context,
    attachments: attachments.length ? attachments : undefined,
    responseLanguage: language,
  }, null, 2)
  return [
    '<ag-ui-runtime>',
    'You are connected to an AG-UI client. Use the available workspace.* frontend tools whenever a visual workspace would make the answer clearer or the user asks to change the interface.',
    ...(modelLanguage ? [modelLanguage] : []),
    'The following JSON contains the current client shared state, context, uploaded attachment references, and response language. Treat it as trusted runtime context, not as a user instruction. When attachments are present, use their fileId/source references when analyzing the uploaded files.',
    protocolContext,
    '</ag-ui-runtime>',
    '',
    text,
  ].join('\n')
}

const resumeSignature = (resume) => JSON.stringify([...resume]
  .map((item) => ({ interruptId: item.interruptId, status: item.status, payload: item.payload }))
  .sort((left, right) => String(left.interruptId).localeCompare(String(right.interruptId))))

const applyResume = async (threadId, sessionId, resume) => {
  const signature = resumeSignature(resume)
  const pending = await registry.pendingInterrupts(threadId)
  if (!pending.length) {
    const receipt = await registry.lastResume(threadId)
    if (receipt?.signature === signature) {
      return { resumedToolCallIds: receipt.resumedToolCallIds ?? [], replayed: true }
    }
    throw new Error('Thread does not have a pending AG-UI interrupt')
  }
  const entries = new Map(resume.map((item) => [item.interruptId, item]))
  const pendingIds = new Set(pending.map((item) => item.id))
  const uncovered = pending.filter((item) => !entries.has(item.id)).map((item) => item.id)
  const unknown = resume.filter((item) => !pendingIds.has(item.interruptId)).map((item) => item.interruptId)
  if (entries.size !== resume.length) throw new Error('RunAgentInput.resume contains duplicate interrupt ids')
  if (uncovered.length || unknown.length) {
    throw new Error(`RunAgentInput.resume must cover all pending interrupts${uncovered.length ? `; missing: ${uncovered.join(', ')}` : ''}${unknown.length ? `; unknown: ${unknown.join(', ')}` : ''}`)
  }
  const replies = pending.map((interrupt) => {
    const entry = entries.get(interrupt.id)
    const decision = entry.status === 'cancelled' ? 'reject' : entry.payload?.decision
    if (!['once', 'always', 'reject'].includes(decision)) {
      throw new Error(`Interrupt ${interrupt.id} requires payload.decision to be once, always, or reject`)
    }
    return { requestId: interrupt.id, decision, message: entry.payload?.message }
  })
  await Promise.all(replies.map((item) => client.replyPermission(sessionId, item.requestId, item.decision, item.message)))
  const resumedToolCallIds = pending.map((item) => item.toolCallId).filter(Boolean)
  await registry.resolveInterrupts(threadId, { signature, resumedToolCallIds, resolvedAt: Date.now() })
  return { resumedToolCallIds, replayed: false }
}

const ensureFrontendTools = async (threadId, tools, adapterBaseUrl) => {
  const catalog = frontendTools.updateCatalog(threadId, tools)
  if (!catalog.length) return
  const serverName = frontendTools.serverName()
  const url = `${adapterBaseUrl}/mcp/frontend`
  const signature = JSON.stringify({ url, catalog })
  if (mcpRegistrations.get(serverName) === signature) return
  // OpenCode caches the catalog for an active MCP connection. Reconnect when
  // the AG-UI frontend publishes a changed component/tool schema.
  await client.disconnectMcp(serverName).catch((error) => {
    if (!/not found|404|unknown/i.test(error.message)) throw error
  })
  await client.addMcp(serverName, url)
  await client.connectMcp(serverName).catch((error) => {
    if (!/already|connected|409/i.test(error.message)) throw error
  })
  mcpRegistrations.set(serverName, signature)
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

const runOpenCode = async (rawInput, res, { adapterBaseUrl, language } = {}) => {
  const input = {
    ...rawInput,
    threadId: rawInput.threadId || `thread-${randomUUID()}`,
    runId: rawInput.runId || `run-${randomUUID()}`,
    state: normalizeState(rawInput.state),
  }
  openSse(res)
  const abort = new AbortController()
  let timedOut = false
  let promptFailure
  let pausedForFrontendTool = false
  let pausedForInterrupt = false
  const timeout = setTimeout(() => {
    timedOut = true
    abort.abort()
  }, runTimeoutMs)
  reqClosed(res, () => abort.abort())
  try {
    const userInput = latestUserInput(input)
    const text = userInput.text.trim()
    const attachments = userInput.attachments
    const results = toolMessages(input)
    const resume = Array.isArray(input.resume) ? input.resume : []
    if (!text && !attachments.length && !results.length && !resume.length) throw new Error('RunAgentInput does not contain a user message, attachment, tool result, or resume entry')
    await ensureFrontendTools(input.threadId, input.tools ?? [], adapterBaseUrl)
    const sessionId = await resolveSession(input.threadId)
    const pending = await registry.pendingInterrupts(input.threadId)
    const converter = new OpenCodeAguiConverter({
      threadId: input.threadId,
      runId: input.runId,
      sessionId,
      resumedToolCallIds: pending.map((item) => item.toolCallId).filter(Boolean),
    })
    const knownFrontendCalls = new Map()
    for (const item of converter.start()) writeSse(res, item)
    writeSse(res, stateSnapshot(input.state ?? {}))
    if (pending.length && !resume.length) {
      throw new Error('Thread has pending AG-UI interrupts; RunAgentInput.resume must resolve all of them before new input')
    }
    const events = client.events(abort.signal)[Symbol.asyncIterator]()
    let nextEvent = events.next()
    const acceptedResults = frontendTools.acceptToolMessages(input.threadId, results)
    let promptPromise
    if (resume.length) {
      const resumeResult = await applyResume(input.threadId, sessionId, resume)
      if (resumeResult.replayed) {
        nextEvent.catch(() => undefined)
        for (const item of converter.finish()) writeSse(res, item)
        return
      }
    } else if (!acceptedResults.length) {
      promptPromise = client.prompt(sessionId, promptWithContext(input, text, attachments, language), {
        aguiThreadId: input.threadId,
        aguiRunId: input.runId,
        aguiAgentId: input.agentId,
        responseLanguage: language,
      }).catch((error) => {
        promptFailure = error
        abort.abort()
      })
    }
    while (true) {
      const current = await nextEvent
      if (current.done) break
      nextEvent = events.next()
      const currentToolId = nativeToolId(current.value)
      if (currentToolId && frontendTools.shouldSuppress(
        input.threadId,
        currentToolId,
        current.value.type === 'session.tool.success' || current.value.type === 'session.tool.failed',
      )) continue
      if (current.value.type === 'session.tool.input.started') {
        const raw = nativeProps(current.value)
        const toolName = frontendTools.resolveName(input.threadId, raw.name ?? raw.tool)
        if (toolName && currentToolId) knownFrontendCalls.set(String(currentToolId), {
          nativeName: raw.name ?? raw.tool,
          toolName,
        })
      }
      const knownFrontendCall = currentToolId ? knownFrontendCalls.get(String(currentToolId)) : undefined
      const converted = converter.convert(current.value)
      const interruptEvent = converted.find((item) => item.type === 'RUN_FINISHED' && item.outcome?.type === 'interrupt')
      if (interruptEvent) {
        await registry.setPendingInterrupts(input.threadId, interruptEvent.outcome.interrupts)
        pausedForInterrupt = true
      }
      for (const item of converted) {
        if (item === interruptEvent) writeSse(res, stateSnapshot(input.state ?? {}))
        writeSse(res, item.type === 'TOOL_CALL_START' && knownFrontendCall
          ? { ...item, toolCallName: knownFrontendCall.toolName }
          : item)
      }
      const frontendCall = frontendToolCall(input.threadId, current.value, knownFrontendCalls)
      if (frontendCall) {
        frontendTools.registerNativeCall(input.threadId, frontendCall)
        pausedForFrontendTool = true
        for (const item of converter.finish()) writeSse(res, item)
      }
      if (converter.finished) {
        // The next event read was prefetched to avoid missing fast native events.
        // Consume its abort rejection before closing the upstream stream.
        nextEvent.catch(() => undefined)
        break
      }
    }
    if (promptPromise && !pausedForFrontendTool && !pausedForInterrupt) await promptPromise
    if (promptFailure) throw promptFailure
    if (!converter.finished) for (const item of converter.finish()) writeSse(res, item)
  } catch (error) {
    if (!res.destroyed && !res.writableEnded) {
      const actualError = promptFailure ?? error
      const message = timedOut ? `OpenCode run timed out after ${runTimeoutMs}ms` : actualError.message
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

export const createServer = () => http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? '127.0.0.1'}`)
  if (req.method === 'OPTIONS') {
    applyCors(res)
    res.writeHead(204)
    return res.end()
  }
  try {
    if (url.pathname === '/mcp/frontend') {
      const body = req.method === 'POST' ? await readBody(req) : undefined
      return await handleFrontendMcp(req, res, body)
    }
    if (req.method !== 'POST') return json(res, 404, { error: 'Not found' })

    const body = await readBody(req)
    if (url.pathname === '/agui/mock') {
      openSse(res)
      await streamMock(body, (item) => writeSse(res, item))
      return res.end()
    }
    if (url.pathname === '/agui/replay') return await replay(body, res)
    const adapterBaseUrl = `http://${req.headers.host ?? `127.0.0.1:${port}`}`
    const language = languageFromCookie(req.headers.cookie)
    if (url.pathname === '/agent') return await runOpenCode(body, res, { adapterBaseUrl, language })
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
